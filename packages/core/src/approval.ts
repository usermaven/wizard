import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import {
  chmod,
  link,
  lstat,
  mkdir,
  readFile,
  realpath,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

import {
  changeApprovalSchema,
  setupPlanSchema,
  type ChangeApproval,
  type SetupPlan,
} from "@usermaven/wizard-schemas";

import { canonicalJsonDigest } from "./canonical.js";
import { canonicalJson } from "./canonical.js";

const APPROVAL_DIRECTORY = ".usermaven/approvals";
const APPROVAL_KEY = ".usermaven/approval.key";

function isErrno(error: unknown, code: string): boolean {
  return (error as NodeJS.ErrnoException).code === code;
}

async function ensurePrivateDirectory(root: string): Promise<void> {
  for (const path of [
    join(root, ".usermaven"),
    join(root, APPROVAL_DIRECTORY),
  ]) {
    try {
      const item = await lstat(path);
      if (item.isSymbolicLink() || !item.isDirectory())
        throw new Error("Approval state path is not a safe directory");
    } catch (error) {
      if (!isErrno(error, "ENOENT")) throw error;
      await mkdir(path, { mode: 0o700 });
    }
  }
}

async function approvalKey(root: string): Promise<Buffer> {
  await ensurePrivateDirectory(root);
  const path = join(root, APPROVAL_KEY);
  try {
    const item = await lstat(path);
    if (
      item.isSymbolicLink() ||
      !item.isFile() ||
      item.size !== 32 ||
      (item.mode & 0o077) !== 0
    ) {
      throw new Error("Approval signing key is not a private regular file");
    }
    return await readFile(path);
  } catch (error) {
    if (!isErrno(error, "ENOENT")) throw error;
    const key = randomBytes(32);
    await writeFile(path, key, { flag: "wx", mode: 0o600 });
    return key;
  }
}

function unsignedApproval(approval: ChangeApproval) {
  const { signature: _signature, ...unsigned } = approval;
  return unsigned;
}

function signApproval(
  key: Buffer,
  approval: Omit<ChangeApproval, "signature">,
) {
  return `sha256:${createHmac("sha256", key)
    .update(canonicalJson(approval))
    .digest("hex")}`;
}

export function digestSetupPlan(input: SetupPlan): string {
  const plan = setupPlanSchema.parse(input);
  return canonicalJsonDigest(plan);
}

export async function fingerprintRepositoryRoot(
  projectRoot: string,
): Promise<string> {
  return canonicalJsonDigest(await realpath(projectRoot));
}

export function approvalConfirmation(
  planDigest: string,
  operationIds: string[],
): string {
  return `APPLY ${planDigest.slice(-12)} ${operationIds.join(",")}`;
}

export interface CreateChangeApprovalInput {
  plan: SetupPlan;
  projectRoot: string;
  operationIds: string[];
  confirmedByInteractiveUser: true;
}

export interface CreateChangeApprovalOptions {
  now?: () => Date;
  idFactory?: () => string;
  ttlMs?: number;
}

export async function createChangeApproval(
  input: CreateChangeApprovalInput,
  options: CreateChangeApprovalOptions = {},
): Promise<ChangeApproval> {
  if (input.confirmedByInteractiveUser !== true) {
    throw new Error("Interactive user confirmation is required");
  }
  const plan = setupPlanSchema.parse(input.plan);
  const available = new Map(
    plan.operations.map((operation) => [operation.id, operation]),
  );
  if (new Set(input.operationIds).size !== input.operationIds.length) {
    throw new Error("Approved operation IDs must be unique");
  }
  for (const operationId of input.operationIds) {
    if (!available.has(operationId)) {
      throw new Error(`Unknown operation ID: ${operationId}`);
    }
  }
  if (
    !input.operationIds.some(
      (operationId) => available.get(operationId)?.type !== "manual_step",
    )
  ) {
    throw new Error("Approval must include at least one executable operation");
  }
  const confirmedAt = (options.now ?? (() => new Date()))();
  const ttlMs = options.ttlMs ?? 15 * 60 * 1_000;
  if (!Number.isInteger(ttlMs) || ttlMs < 1 || ttlMs > 60 * 60 * 1_000) {
    throw new Error("Approval TTL must be between 1 ms and 1 hour");
  }

  const root = await realpath(input.projectRoot);
  const unsigned = {
    schema_version: "1",
    approval_id: `approval_${(options.idFactory ?? randomUUID)()}`,
    plan_id: plan.plan_id,
    plan_digest: digestSetupPlan(plan),
    repository_root_fingerprint: await fingerprintRepositoryRoot(root),
    operation_ids: input.operationIds,
    approved_by: "interactive_local_user",
    confirmed_at: confirmedAt.toISOString(),
    expires_at: new Date(confirmedAt.getTime() + ttlMs).toISOString(),
  } as const;
  return changeApprovalSchema.parse({
    ...unsigned,
    signature: signApproval(await approvalKey(root), unsigned),
  });
}

export async function verifyChangeApproval(
  projectRoot: string,
  input: ChangeApproval,
): Promise<ChangeApproval> {
  const root = await realpath(projectRoot);
  const approval = changeApprovalSchema.parse(input);
  const expected = signApproval(
    await approvalKey(root),
    unsignedApproval(approval),
  );
  const actualBytes = Buffer.from(approval.signature);
  const expectedBytes = Buffer.from(expected);
  if (
    actualBytes.length !== expectedBytes.length ||
    !timingSafeEqual(actualBytes, expectedBytes)
  ) {
    throw new Error("Approval signature is invalid");
  }
  return approval;
}

export async function storeChangeApproval(
  projectRoot: string,
  input: ChangeApproval,
): Promise<string> {
  const root = await realpath(projectRoot);
  const approval = await verifyChangeApproval(root, input);
  await ensurePrivateDirectory(root);
  const relativePath = `${APPROVAL_DIRECTORY}/${approval.approval_id}.json`;
  const path = join(root, relativePath);
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(approval, null, 2), {
    flag: "wx",
    mode: 0o600,
  });
  try {
    await link(temporary, path);
    await chmod(path, 0o600);
  } catch (error) {
    if (isErrno(error, "EEXIST"))
      throw new Error("Approval ID is already registered");
    throw error;
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
  return relativePath;
}

export async function loadChangeApproval(
  projectRoot: string,
  approvalId: string,
): Promise<ChangeApproval> {
  const root = await realpath(projectRoot);
  const id = changeApprovalSchema.shape.approval_id.parse(approvalId);
  const path = join(root, APPROVAL_DIRECTORY, `${id}.json`);
  const item = await lstat(path);
  if (
    item.isSymbolicLink() ||
    !item.isFile() ||
    item.size > 1_000_000 ||
    (item.mode & 0o077) !== 0
  ) {
    throw new Error("Registered approval is not a private regular file");
  }
  const approval = changeApprovalSchema.parse(
    JSON.parse(await readFile(path, "utf8")),
  );
  if (approval.approval_id !== id)
    throw new Error("Registered approval ID does not match its filename");
  return verifyChangeApproval(root, approval);
}
