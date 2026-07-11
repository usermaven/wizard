import { randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join, resolve, sep } from "node:path";

import {
  applyResultSchema,
  changeApprovalSchema,
  setupPlanSchema,
  trackingPlanSchema,
  verificationResultSchema,
  verificationSessionSchema,
  wizardCheckpointSchema,
  workflowResumeResultSchema,
  type ApplyResult,
  type ChangeApproval,
  type SetupPlan,
  type VerificationResult,
  type VerificationSession,
  type WizardCheckpoint,
  type WorkflowArtifactKind,
  type WorkflowResumeResult,
  type WorkflowStep,
} from "@usermaven/wizard-schemas";

import { digestSetupPlan, fingerprintRepositoryRoot } from "./approval.js";
import { canonicalJsonDigest } from "./canonical.js";
import { inspectProject } from "./inspector.js";

const STATE_DIRECTORY = ".usermaven/workflows";
const MAXIMUM_ARTIFACT_BYTES = 5_000_000;
const STEP_ORDER: WorkflowStep[] = [
  "inspection_completed",
  "tracking_plan_created",
  "setup_plan_created",
  "preview_completed",
  "approval_created",
  "apply_completed",
  "verification_prepared",
  "verification_completed",
];

type ArtifactPaths = Partial<Record<WorkflowArtifactKind, string>>;
type TrackingPlan = ReturnType<typeof trackingPlanSchema.parse>;
type ParsedArtifacts = {
  tracking_plan?: TrackingPlan;
  setup_plan?: SetupPlan;
  approval?: ChangeApproval;
  apply_result?: ApplyResult;
  verification_session?: VerificationSession;
  verification_result?: VerificationResult;
};

export interface SaveWorkflowCheckpointInput {
  projectRoot: string;
  workflowId?: string;
  completedStep: WorkflowStep;
  artifactPaths?: ArtifactPaths;
}

export interface WorkflowOptions {
  now?: () => Date;
  idFactory?: () => string;
}

export async function startGuidedSetup(
  projectRoot: string,
  options: WorkflowOptions = {},
) {
  const root = await realpath(projectRoot);
  const inspection = await inspectProject(
    root,
    options.now ? { now: options.now } : {},
  );
  const checkpoint = await saveWorkflowCheckpoint(
    { projectRoot: root, completedStep: "inspection_completed" },
    options,
  );
  const relativeDirectory = `${STATE_DIRECTORY}/${checkpoint.workflow_id}/inputs`;
  let current = root;
  for (const segment of relativeDirectory.split("/")) {
    current = join(current, segment);
    try {
      const item = await lstat(current);
      if (item.isSymbolicLink() || !item.isDirectory())
        throw new Error("Guided workflow path is not a safe directory");
    } catch (error) {
      if (!isErrno(error, "ENOENT")) throw error;
      await mkdir(current, { mode: 0o700 });
    }
  }
  const defaults = {
    inspection: `${relativeDirectory}/inspection.json`,
    business_context: `${relativeDirectory}/business-context.json`,
    ai_proposal: `${relativeDirectory}/ai-proposal.json`,
    tracking_plan: `${relativeDirectory}/tracking-plan.json`,
    ai_instrumentation: `${relativeDirectory}/ai-instrumentation.json`,
  };
  await Promise.all([
    writeFile(
      join(root, defaults.inspection),
      JSON.stringify(inspection, null, 2),
      {
        flag: "wx",
        mode: 0o600,
      },
    ),
    writeFile(
      join(root, defaults.business_context),
      JSON.stringify(
        {
          _instructions:
            "Replace this template with explicit product goals, user journeys, revenue context, and data policy before planning.",
        },
        null,
        2,
      ),
      { flag: "wx", mode: 0o600 },
    ),
    writeFile(
      join(root, defaults.ai_proposal),
      JSON.stringify(
        {
          _instructions:
            "Have the agent create a schema-valid AI tracking proposal from inspection.json and business-context.json.",
        },
        null,
        2,
      ),
      { flag: "wx", mode: 0o600 },
    ),
    writeFile(
      join(root, defaults.ai_instrumentation),
      JSON.stringify(
        {
          _instructions:
            "After the tracking plan is reviewed, have the agent create schema-valid source-aware instrumentation here.",
        },
        null,
        2,
      ),
      { flag: "wx", mode: 0o600 },
    ),
  ]);
  const next = await resumeWorkflow(root, checkpoint.workflow_id, options);
  return { inspection, checkpoint, default_artifacts: defaults, next };
}

function isErrno(error: unknown, code: string): boolean {
  return (error as NodeJS.ErrnoException).code === code;
}

function digestJson(value: unknown): string {
  return canonicalJsonDigest(value);
}

function isWithinRoot(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

function artifactCandidate(root: string, artifactPath: string): string {
  if (
    !artifactPath ||
    artifactPath.includes("\\") ||
    artifactPath.split("/").includes("..")
  ) {
    throw new Error("Workflow artifact paths must be repository-relative");
  }
  const candidate = resolve(root, artifactPath);
  if (!isWithinRoot(root, candidate))
    throw new Error("Workflow artifact path escapes the repository root");
  return candidate;
}

async function assertSafeArtifactParents(
  root: string,
  artifactPath: string,
): Promise<void> {
  let current = root;
  for (const segment of artifactPath.split("/").slice(0, -1)) {
    current = join(current, segment);
    const item = await lstat(current);
    if (item.isSymbolicLink() || !item.isDirectory())
      throw new Error("Workflow artifact path has an unsafe parent directory");
  }
}

async function readArtifact(
  root: string,
  artifactPath: string,
): Promise<unknown> {
  const candidate = artifactCandidate(root, artifactPath);
  await assertSafeArtifactParents(root, artifactPath);
  const item = await lstat(candidate);
  if (item.isSymbolicLink() || !item.isFile())
    throw new Error("Workflow artifact must be a regular file");
  if (item.size > MAXIMUM_ARTIFACT_BYTES)
    throw new Error("Workflow artifact exceeds the 5 MB safety limit");
  return JSON.parse(await readFile(candidate, "utf8"));
}

function parseArtifact(kind: WorkflowArtifactKind, value: unknown): unknown {
  switch (kind) {
    case "tracking_plan":
      return trackingPlanSchema.parse(value);
    case "setup_plan":
      return setupPlanSchema.parse(value);
    case "approval":
      return changeApprovalSchema.parse(value);
    case "apply_result":
      return applyResultSchema.parse(value);
    case "verification_session":
      return verificationSessionSchema.parse(value);
    case "verification_result":
      return verificationResultSchema.parse(value);
  }
}

async function ensureStateDirectory(root: string): Promise<void> {
  for (const path of [join(root, ".usermaven"), join(root, STATE_DIRECTORY)]) {
    try {
      const item = await lstat(path);
      if (item.isSymbolicLink() || !item.isDirectory())
        throw new Error("Workflow state path is not a safe directory");
    } catch (error) {
      if (!isErrno(error, "ENOENT")) throw error;
      await mkdir(path, { mode: 0o700 });
    }
  }
}

function checkpointPath(root: string, workflowId: string): string {
  const parsed = wizardCheckpointSchema.shape.workflow_id.parse(workflowId);
  return join(root, STATE_DIRECTORY, `${parsed}.json`);
}

async function loadCheckpoint(
  root: string,
  workflowId: string,
): Promise<WizardCheckpoint> {
  const path = checkpointPath(root, workflowId);
  const item = await lstat(path);
  if (item.isSymbolicLink() || !item.isFile() || item.size > 1_000_000)
    throw new Error("Workflow checkpoint is not a safe state file");
  return wizardCheckpointSchema.parse(JSON.parse(await readFile(path, "utf8")));
}

function requiredArtifacts(step: WorkflowStep): WorkflowArtifactKind[] {
  const index = STEP_ORDER.indexOf(step);
  if (index < 1) return [];
  const required: WorkflowArtifactKind[] = ["tracking_plan"];
  if (index >= 2) required.push("setup_plan");
  if (step === "approval_created") required.push("approval");
  if (index >= 5) required.push("apply_result");
  if (index >= 6) required.push("verification_session");
  if (index >= 7) required.push("verification_result");
  return required;
}

function validateRelationships(
  rootFingerprint: string,
  artifacts: ParsedArtifacts,
): void {
  const tracking = artifacts.tracking_plan;
  const setup = artifacts.setup_plan;
  const approval = artifacts.approval;
  const applyResult = artifacts.apply_result;
  const session = artifacts.verification_session;
  const result = artifacts.verification_result;
  if (
    tracking &&
    setup &&
    digestJson(setup.tracking_plan) !== digestJson(tracking)
  )
    throw new Error(
      "Setup plan does not contain the checkpointed tracking plan",
    );
  if (
    approval &&
    setup &&
    (approval.plan_id !== setup.plan_id ||
      approval.plan_digest !== digestSetupPlan(setup) ||
      approval.repository_root_fingerprint !== rootFingerprint)
  )
    throw new Error("Approval is not bound to this setup plan and repository");
  if (
    applyResult &&
    setup &&
    (applyResult.plan_id !== setup.plan_id ||
      applyResult.plan_digest !== digestSetupPlan(setup) ||
      applyResult.repository_root_fingerprint !== rootFingerprint ||
      (approval !== undefined &&
        applyResult.approval_id !== approval.approval_id))
  )
    throw new Error(
      "Apply result is not bound to this setup plan and repository",
    );
  if (
    session &&
    setup &&
    (session.plan_id !== setup.plan_id ||
      session.plan_digest !== digestSetupPlan(setup))
  )
    throw new Error("Verification session is not bound to this setup plan");
  if (
    result &&
    session &&
    (result.session_id !== session.session_id ||
      result.plan_id !== session.plan_id ||
      result.environment !== session.environment)
  )
    throw new Error("Verification result is not bound to this session");
}

export async function saveWorkflowCheckpoint(
  input: SaveWorkflowCheckpointInput,
  options: WorkflowOptions = {},
): Promise<WizardCheckpoint> {
  const root = await realpath(input.projectRoot);
  const rootFingerprint = await fingerprintRepositoryRoot(root);
  const now = (options.now ?? (() => new Date()))();
  const workflowId =
    input.workflowId ?? `workflow_${(options.idFactory ?? randomUUID)()}`;
  wizardCheckpointSchema.shape.workflow_id.parse(workflowId);
  await ensureStateDirectory(root);

  let existing: WizardCheckpoint | undefined;
  try {
    existing = await loadCheckpoint(root, workflowId);
  } catch (error) {
    if (!isErrno(error, "ENOENT")) throw error;
  }
  if (!existing && input.completedStep !== "inspection_completed")
    throw new Error("A new workflow must start at inspection_completed");
  if (existing && existing.repository_root_fingerprint !== rootFingerprint)
    throw new Error(
      "Workflow checkpoint belongs to a different repository root",
    );
  if (
    existing &&
    STEP_ORDER.indexOf(input.completedStep) <
      STEP_ORDER.indexOf(existing.last_completed_step)
  )
    throw new Error("Workflow checkpoints cannot move backward");

  const artifacts = { ...(existing?.artifacts ?? {}) };
  const parsedArtifacts: ParsedArtifacts = {};
  for (const [kind, artifactPath] of Object.entries(
    input.artifactPaths ?? {},
  ) as [WorkflowArtifactKind, string][]) {
    const parsed = parseArtifact(kind, await readArtifact(root, artifactPath));
    parsedArtifacts[kind] = parsed as never;
    artifacts[kind] = { path: artifactPath, digest: digestJson(parsed) };
  }
  for (const [kind, reference] of Object.entries(artifacts) as [
    WorkflowArtifactKind,
    { path: string; digest: string },
  ][]) {
    if (parsedArtifacts[kind]) continue;
    const parsed = parseArtifact(
      kind,
      await readArtifact(root, reference.path),
    );
    if (digestJson(parsed) !== reference.digest)
      throw new Error(`Checkpointed ${kind} artifact has changed`);
    parsedArtifacts[kind] = parsed as never;
  }
  for (const required of requiredArtifacts(input.completedStep)) {
    if (!artifacts[required])
      throw new Error(
        `${input.completedStep} requires a ${required} artifact path`,
      );
  }
  validateRelationships(rootFingerprint, parsedArtifacts);

  const checkpoint = wizardCheckpointSchema.parse({
    schema_version: "1",
    workflow_id: workflowId,
    repository_root_fingerprint: rootFingerprint,
    last_completed_step: input.completedStep,
    artifacts,
    created_at: existing?.created_at ?? now.toISOString(),
    updated_at: now.toISOString(),
  });
  const path = checkpointPath(root, workflowId);
  const lock = `${path}.lock`;
  await writeFile(lock, JSON.stringify({ workflow_id: workflowId }), {
    flag: "wx",
    mode: 0o600,
  }).catch((error) => {
    if (isErrno(error, "EEXIST"))
      throw new Error("Workflow checkpoint is being updated");
    throw error;
  });
  try {
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(checkpoint, null, 2), {
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporary, path);
    await chmod(path, 0o600);
  } finally {
    await unlink(lock).catch(() => undefined);
  }
  return checkpoint;
}

async function validateReferences(root: string, checkpoint: WizardCheckpoint) {
  const parsed: ParsedArtifacts = {};
  const reusable: WorkflowArtifactKind[] = [];
  const invalid: WorkflowArtifactKind[] = [];
  for (const [kind, reference] of Object.entries(checkpoint.artifacts) as [
    WorkflowArtifactKind,
    { path: string; digest: string },
  ][]) {
    try {
      const artifact = parseArtifact(
        kind,
        await readArtifact(root, reference.path),
      );
      if (digestJson(artifact) !== reference.digest) throw new Error("changed");
      parsed[kind] = artifact as never;
      reusable.push(kind);
    } catch {
      invalid.push(kind);
    }
  }
  for (const required of requiredArtifacts(checkpoint.last_completed_step)) {
    if (!checkpoint.artifacts[required] && !invalid.includes(required)) {
      invalid.push(required);
    }
  }
  try {
    validateRelationships(checkpoint.repository_root_fingerprint, parsed);
  } catch {
    for (const kind of reusable.splice(0)) invalid.push(kind);
  }
  return { parsed, reusable, invalid: [...new Set(invalid)] };
}

function staleAction(invalid: WorkflowArtifactKind[]) {
  if (invalid.includes("tracking_plan"))
    return "generate_tracking_plan" as const;
  if (invalid.includes("setup_plan")) return "generate_setup_plan" as const;
  if (invalid.includes("approval")) return "request_approval" as const;
  if (invalid.includes("apply_result")) return "inspect_apply_state" as const;
  if (invalid.includes("verification_session"))
    return "prepare_verification" as const;
  return "collect_verification_evidence" as const;
}

export async function resumeWorkflow(
  projectRoot: string,
  workflowId: string,
  options: WorkflowOptions = {},
): Promise<WorkflowResumeResult> {
  const root = await realpath(projectRoot);
  const rootFingerprint = await fingerprintRepositoryRoot(root);
  const checkpoint = await loadCheckpoint(root, workflowId);
  const now = (options.now ?? (() => new Date()))();
  if (checkpoint.repository_root_fingerprint !== rootFingerprint)
    throw new Error(
      "Workflow checkpoint belongs to a different repository root",
    );
  const { parsed, reusable, invalid } = await validateReferences(
    root,
    checkpoint,
  );
  const base = {
    schema_version: "1" as const,
    workflow_id: checkpoint.workflow_id,
    repository_root_fingerprint: rootFingerprint,
    last_completed_step: checkpoint.last_completed_step,
    reusable_artifacts: reusable,
    invalid_artifacts: invalid,
    warnings: [
      "Resume returns the next workflow action; it does not execute a model, replay an approval, or collect evidence.",
    ],
    checked_at: now.toISOString(),
  };
  const result = (
    checkpoint_status: string,
    next_action: string,
    reason: string,
  ) => {
    const setupDigest = checkpoint.artifacts.setup_plan?.digest;
    const operationIds = parsed.setup_plan?.operations
      .filter((operation) => operation.requires_approval)
      .map((operation) => operation.id)
      .join(",");
    const suggestedCommands: Record<string, string | undefined> = {
      generate_tracking_plan: `usermaven-wizard plan . --business-context ${STATE_DIRECTORY}/${checkpoint.workflow_id}/inputs/business-context.json --ai-proposal ${STATE_DIRECTORY}/${checkpoint.workflow_id}/inputs/ai-proposal.json > ${STATE_DIRECTORY}/${checkpoint.workflow_id}/inputs/tracking-plan.json`,
      generate_setup_plan: checkpoint.artifacts.tracking_plan
        ? `usermaven-wizard setup-plan . --tracking-plan ${checkpoint.artifacts.tracking_plan.path} --ai-instrumentation ai-instrumentation.json --workspace-name <name> --region <region> --key-fingerprint <sha256:fingerprint> --tracking-host <https-url>`
        : undefined,
      preview_changes: setupDigest
        ? `usermaven-wizard preview --root . --plan-digest ${setupDigest}`
        : undefined,
      request_approval:
        setupDigest && operationIds
          ? `usermaven-wizard approve --root . --plan-digest ${setupDigest} --operations ${operationIds}`
          : undefined,
      apply_changes:
        setupDigest && checkpoint.artifacts.approval
          ? `usermaven-wizard apply --root . --plan-digest ${setupDigest} --approval ${checkpoint.artifacts.approval.path}`
          : undefined,
      prepare_verification: setupDigest
        ? `usermaven-wizard verification-session --root . --plan-digest ${setupDigest} --environment <environment>`
        : undefined,
      collect_verification_evidence:
        "Collect signed runtime, transport, and workspace receipt evidence for the active verification session.",
      inspect_apply_state:
        "Inspect .usermaven/apply and the working tree; do not replay the uncertain approval.",
      remediate_setup:
        "Inspect verification/apply failures, update instrumentation, and start a new exact plan and approval.",
      complete: undefined,
    };
    return workflowResumeResultSchema.parse({
      ...base,
      checkpoint_status,
      next_action,
      reason,
      suggested_command: suggestedCommands[next_action] ?? null,
    });
  };
  if (invalid.length > 0)
    return result(
      "stale",
      staleAction(invalid),
      "One or more checkpointed artifacts are missing, changed, or no longer valid.",
    );

  const step = checkpoint.last_completed_step;
  if (step === "inspection_completed")
    return result(
      "ready",
      "generate_tracking_plan",
      "Repository inspection completed; create the reviewed tracking plan next.",
    );
  if (step === "tracking_plan_created")
    return result(
      "ready",
      "generate_setup_plan",
      "The tracking plan is reusable; generate source-aware setup operations next.",
    );
  if (step === "setup_plan_created")
    return result(
      "ready",
      "preview_changes",
      "The exact setup plan is reusable and should be previewed before approval.",
    );
  if (step === "preview_completed")
    return result(
      "ready",
      "request_approval",
      "Preview completed; request a new interactive approval for the selected operations.",
    );

  const approval = parsed.approval;
  if (step === "approval_created" && approval) {
    const recordPath = join(
      root,
      `.usermaven/apply/${approval.approval_id}.json`,
    );
    const lockPath = join(
      root,
      `.usermaven/apply/${approval.approval_id}.lock`,
    );
    const recordExists = await lstat(recordPath)
      .then(() => true)
      .catch(() => false);
    const lockExists = await lstat(lockPath)
      .then(() => true)
      .catch(() => false);
    if (recordExists) {
      const item = await lstat(recordPath);
      if (item.isSymbolicLink() || !item.isFile() || item.size > 1_000_000) {
        return result(
          "interrupted",
          "inspect_apply_state",
          "The apply completion record is not a safe regular state file; do not replay the approval.",
        );
      }
      let recorded: ApplyResult;
      try {
        recorded = applyResultSchema.parse(
          JSON.parse(await readFile(recordPath, "utf8")),
        );
      } catch {
        return result(
          "interrupted",
          "inspect_apply_state",
          "The apply completion record is corrupt or invalid; do not replay the approval.",
        );
      }
      const setup = parsed.setup_plan;
      if (
        recorded.approval_id !== approval.approval_id ||
        !setup ||
        recorded.plan_id !== setup.plan_id ||
        recorded.plan_digest !== digestSetupPlan(setup) ||
        recorded.repository_root_fingerprint !== rootFingerprint
      ) {
        return result(
          "interrupted",
          "inspect_apply_state",
          "The apply completion record is not bound to this approval, plan, and repository; do not replay the approval.",
        );
      }
      return recorded.outcome === "succeeded"
        ? result(
            "ready",
            "prepare_verification",
            "The approval was consumed successfully; checkpoint verification next.",
          )
        : result(
            "ready",
            "remediate_setup",
            "The consumed apply attempt did not succeed; inspect and remediate before a new plan.",
          );
    }
    if (lockExists)
      return result(
        "interrupted",
        "inspect_apply_state",
        "An apply lock exists without a completed one-time state record; do not replay the approval.",
      );
    if (Date.parse(approval.expires_at) <= now.getTime())
      return result(
        "expired",
        "request_approval",
        "The interactive approval expired and must be regenerated.",
      );
    return result(
      "ready",
      "apply_changes",
      "The exact approval is unexpired and has not been consumed.",
    );
  }
  if (step === "apply_completed")
    return parsed.apply_result?.outcome === "succeeded"
      ? result(
          "ready",
          "prepare_verification",
          "Apply completed successfully; prepare marker-bound verification.",
        )
      : result(
          "ready",
          "remediate_setup",
          "Apply did not succeed; remediate before creating another setup plan.",
        );
  if (step === "verification_prepared" && parsed.verification_session) {
    if (Date.parse(parsed.verification_session.expires_at) <= now.getTime())
      return result(
        "expired",
        "prepare_verification",
        "The verification session expired; create a new marker-bound session.",
      );
    return result(
      "ready",
      "collect_verification_evidence",
      "The verification session is active; collect normalized runtime, transport, and workspace evidence.",
    );
  }
  const outcome = parsed.verification_result?.outcome;
  if (outcome === "pass")
    return result(
      "complete",
      "complete",
      "All required setup verification checks passed.",
    );
  if (outcome === "fail")
    return result(
      "ready",
      "remediate_setup",
      "Verification found contradictory or failed setup state that requires remediation.",
    );
  return result(
    "ready",
    "prepare_verification",
    "Verification is incomplete or warning-only; create a fresh marker session before collecting evidence.",
  );
}
