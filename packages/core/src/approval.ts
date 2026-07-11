import { createHash, randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";

import {
  changeApprovalSchema,
  setupPlanSchema,
  type ChangeApproval,
  type SetupPlan,
} from "@usermaven/wizard-schemas";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function digest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function digestSetupPlan(input: SetupPlan): string {
  const plan = setupPlanSchema.parse(input);
  return digest(JSON.stringify(canonicalize(plan)));
}

export async function fingerprintRepositoryRoot(
  projectRoot: string,
): Promise<string> {
  return digest(await realpath(projectRoot));
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

  return changeApprovalSchema.parse({
    schema_version: "1",
    approval_id: `approval_${(options.idFactory ?? randomUUID)()}`,
    plan_id: plan.plan_id,
    plan_digest: digestSetupPlan(plan),
    repository_root_fingerprint: await fingerprintRepositoryRoot(
      input.projectRoot,
    ),
    operation_ids: input.operationIds,
    approved_by: "interactive_local_user",
    confirmed_at: confirmedAt.toISOString(),
    expires_at: new Date(confirmedAt.getTime() + ttlMs).toISOString(),
  });
}
