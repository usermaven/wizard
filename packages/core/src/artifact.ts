import { randomUUID } from "node:crypto";
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
  setupPlanArtifactReferenceSchema,
  setupPlanSchema,
  type SetupPlan,
  type SetupPlanArtifactReference,
} from "@usermaven/wizard-schemas";

import { digestSetupPlan } from "./approval.js";

const ARTIFACT_DIRECTORY = ".usermaven/artifacts/setup-plans";

function isErrno(error: unknown, code: string): boolean {
  return (error as NodeJS.ErrnoException).code === code;
}

async function ensureArtifactDirectory(root: string): Promise<void> {
  for (const path of [
    join(root, ".usermaven"),
    join(root, ".usermaven", "artifacts"),
    join(root, ARTIFACT_DIRECTORY),
  ]) {
    try {
      const item = await lstat(path);
      if (item.isSymbolicLink() || !item.isDirectory())
        throw new Error("Artifact state path is not a safe directory");
    } catch (error) {
      if (!isErrno(error, "ENOENT")) throw error;
      await mkdir(path, { mode: 0o700 });
    }
  }
}

function artifactRelativePath(planDigest: string): string {
  const digest =
    setupPlanArtifactReferenceSchema.shape.plan_digest.parse(planDigest);
  return `${ARTIFACT_DIRECTORY}/${digest.slice("sha256:".length)}.json`;
}

export async function storeSetupPlanArtifact(
  projectRoot: string,
  input: SetupPlan,
): Promise<SetupPlanArtifactReference> {
  const root = await realpath(projectRoot);
  const plan = setupPlanSchema.parse(input);
  const planDigest = digestSetupPlan(plan);
  await ensureArtifactDirectory(root);
  const artifactPath = artifactRelativePath(planDigest);
  const path = join(root, artifactPath);
  const reference = setupPlanArtifactReferenceSchema.parse({
    schema_version: "1",
    artifact_kind: "setup_plan",
    plan_id: plan.plan_id,
    plan_digest: planDigest,
    artifact_path: artifactPath,
    operation_count: plan.operations.length,
    risk_count: plan.risks.length,
  });
  try {
    const existing = await loadSetupPlanArtifact(root, planDigest);
    if (existing.plan_id !== plan.plan_id)
      throw new Error("Setup-plan artifact digest collision");
    return reference;
  } catch (error) {
    if (!isErrno(error, "ENOENT")) throw error;
  }
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(plan, null, 2), {
    flag: "wx",
    mode: 0o600,
  });
  try {
    await link(temporary, path);
    await chmod(path, 0o600);
  } catch (error) {
    if (!isErrno(error, "EEXIST")) throw error;
    await loadSetupPlanArtifact(root, planDigest);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
  return reference;
}

export async function loadSetupPlanArtifact(
  projectRoot: string,
  planDigest: string,
): Promise<SetupPlan> {
  const root = await realpath(projectRoot);
  const path = join(root, artifactRelativePath(planDigest));
  const item = await lstat(path);
  if (
    item.isSymbolicLink() ||
    !item.isFile() ||
    item.size > 5_000_000 ||
    (item.mode & 0o077) !== 0
  ) {
    throw new Error("Setup-plan artifact is not a private regular file");
  }
  const plan = setupPlanSchema.parse(JSON.parse(await readFile(path, "utf8")));
  if (digestSetupPlan(plan) !== planDigest)
    throw new Error("Setup-plan artifact digest does not match its contents");
  return plan;
}
