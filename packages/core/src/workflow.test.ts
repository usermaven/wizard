import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  setupPlanSchema,
  trackingPlanSchema,
  type SetupPlan,
} from "@usermaven/wizard-schemas";
import { afterEach, describe, expect, it } from "vitest";

import { createChangeApproval } from "./approval.js";
import {
  resumeWorkflow,
  saveWorkflowCheckpoint,
  startGuidedSetup,
} from "./workflow.js";

const roots: string[] = [];
const now = () => new Date("2026-07-11T16:00:00Z");
const trackingPlan = trackingPlanSchema.parse({
  schema_version: "1",
  plan_id: "plan_workflow-1234",
  identity: [],
  events: [],
  shared_properties: [],
  proposal: {
    mode: "deterministic_baseline",
    review_required: true,
    assumptions: [],
    warnings: [],
    source: {
      framework: "node",
      inspected_at: "2026-07-11T15:00:00Z",
      inspection_truncated: false,
    },
  },
  created_at: "2026-07-11T15:00:00Z",
  wizard_version: "0.10.0",
});

function setupPlan(): SetupPlan {
  return setupPlanSchema.parse({
    schema_version: "1",
    plan_id: "setup_workflow-1234",
    workspace: {
      display_name: "Example",
      region: "us",
      public_key_fingerprint: "sha256:example",
      tracking_host: "https://events.example.com",
    },
    project: { framework: "node", package_manager: "npm", confidence: 1 },
    operations: [
      {
        id: "create-client",
        type: "create_file",
        summary: "Create client",
        path: "src/usermaven.ts",
        content: "export {};\n",
        requires_approval: true,
      },
    ],
    tracking_plan: trackingPlan,
    checks: [],
    risks: [],
    created_at: "2026-07-11T15:00:00Z",
    wizard_version: "0.10.0",
  });
}

async function project() {
  const root = await mkdtemp(join(tmpdir(), "wizard-workflow-"));
  roots.push(root);
  await mkdir(join(root, "src"));
  await writeFile(
    join(root, "tracking-plan.json"),
    JSON.stringify(trackingPlan),
  );
  await writeFile(join(root, "setup-plan.json"), JSON.stringify(setupPlan()));
  return root;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

describe("workflow checkpoints", () => {
  it("starts a guided workflow with private default artifacts", async () => {
    const root = await project();
    const result = await startGuidedSetup(root, {
      now,
      idFactory: () => "guided-setup-1234",
    });

    expect(result.next).toMatchObject({
      next_action: "generate_tracking_plan",
      suggested_command: expect.stringContaining(
        ".usermaven/workflows/workflow_guided-setup-1234/inputs/business-context.json",
      ),
    });
    expect(
      JSON.parse(
        await readFile(join(root, result.default_artifacts.inspection), "utf8"),
      ),
    ).toMatchObject({
      project: { framework: "unknown" },
    });
    expect(
      (await lstat(join(root, result.default_artifacts.business_context)))
        .mode & 0o077,
    ).toBe(0);
  });

  it("persists safe progress and returns a deterministic next action", async () => {
    const root = await project();
    const created = await saveWorkflowCheckpoint(
      { projectRoot: root, completedStep: "inspection_completed" },
      { now, idFactory: () => "checkpoint-1234" },
    );
    await saveWorkflowCheckpoint(
      {
        projectRoot: root,
        workflowId: created.workflow_id,
        completedStep: "tracking_plan_created",
        artifactPaths: { tracking_plan: "tracking-plan.json" },
      },
      { now },
    );

    const resumed = await resumeWorkflow(root, created.workflow_id, { now });
    expect(resumed).toMatchObject({
      checkpoint_status: "ready",
      next_action: "generate_setup_plan",
      suggested_command: expect.stringContaining("usermaven-wizard setup-plan"),
      reusable_artifacts: ["tracking_plan"],
      invalid_artifacts: [],
    });
  });

  it("detects an altered artifact and never silently reuses it", async () => {
    const root = await project();
    const created = await saveWorkflowCheckpoint(
      { projectRoot: root, completedStep: "inspection_completed" },
      { now, idFactory: () => "stale-checkpoint" },
    );
    await saveWorkflowCheckpoint(
      {
        projectRoot: root,
        workflowId: created.workflow_id,
        completedStep: "tracking_plan_created",
        artifactPaths: { tracking_plan: "tracking-plan.json" },
      },
      { now },
    );
    await writeFile(
      join(root, "tracking-plan.json"),
      JSON.stringify({ ...trackingPlan, plan_id: "plan_changed-1234" }),
    );

    const resumed = await resumeWorkflow(root, created.workflow_id, { now });
    expect(resumed).toMatchObject({
      checkpoint_status: "stale",
      next_action: "generate_tracking_plan",
      invalid_artifacts: ["tracking_plan"],
    });
  });

  it("rejects artifact paths beneath symlinked parent directories", async () => {
    const root = await project();
    const external = await mkdtemp(join(tmpdir(), "wizard-workflow-external-"));
    roots.push(external);
    await writeFile(
      join(external, "tracking.json"),
      JSON.stringify(trackingPlan),
    );
    await symlink(external, join(root, "linked"));
    const created = await saveWorkflowCheckpoint(
      { projectRoot: root, completedStep: "inspection_completed" },
      { now, idFactory: () => "symlink-checkpoint" },
    );

    await expect(
      saveWorkflowCheckpoint(
        {
          projectRoot: root,
          workflowId: created.workflow_id,
          completedStep: "tracking_plan_created",
          artifactPaths: { tracking_plan: "linked/tracking.json" },
        },
        { now },
      ),
    ).rejects.toThrow("unsafe parent");
  });

  it("requires a new approval after expiry", async () => {
    const root = await project();
    const approval = await createChangeApproval(
      {
        projectRoot: root,
        plan: setupPlan(),
        operationIds: ["create-client"],
        confirmedByInteractiveUser: true,
      },
      { now, idFactory: () => "workflow-approval", ttlMs: 60_000 },
    );
    await writeFile(join(root, "approval.json"), JSON.stringify(approval), {
      mode: 0o600,
    });
    const created = await saveWorkflowCheckpoint(
      { projectRoot: root, completedStep: "inspection_completed" },
      { now, idFactory: () => "expired-checkpoint" },
    );
    await saveWorkflowCheckpoint(
      {
        projectRoot: root,
        workflowId: created.workflow_id,
        completedStep: "approval_created",
        artifactPaths: {
          tracking_plan: "tracking-plan.json",
          setup_plan: "setup-plan.json",
          approval: "approval.json",
        },
      },
      { now },
    );

    const resumed = await resumeWorkflow(root, created.workflow_id, {
      now: () => new Date("2026-07-11T16:02:00Z"),
    });
    expect(resumed).toMatchObject({
      checkpoint_status: "expired",
      next_action: "request_approval",
      suggested_command: expect.stringContaining("--plan-digest"),
    });
  });

  it("detects interrupted apply state and refuses to recommend replay", async () => {
    const root = await project();
    const approval = await createChangeApproval(
      {
        projectRoot: root,
        plan: setupPlan(),
        operationIds: ["create-client"],
        confirmedByInteractiveUser: true,
      },
      { now, idFactory: () => "interrupted-approval", ttlMs: 60_000 },
    );
    await writeFile(join(root, "approval.json"), JSON.stringify(approval), {
      mode: 0o600,
    });
    const created = await saveWorkflowCheckpoint(
      { projectRoot: root, completedStep: "inspection_completed" },
      { now, idFactory: () => "interrupted-checkpoint" },
    );
    await saveWorkflowCheckpoint(
      {
        projectRoot: root,
        workflowId: created.workflow_id,
        completedStep: "approval_created",
        artifactPaths: {
          tracking_plan: "tracking-plan.json",
          setup_plan: "setup-plan.json",
          approval: "approval.json",
        },
      },
      { now },
    );
    await mkdir(join(root, ".usermaven", "apply"));
    await writeFile(
      join(root, ".usermaven", "apply", `${approval.approval_id}.lock`),
      "locked",
      { mode: 0o600 },
    );

    const resumed = await resumeWorkflow(root, created.workflow_id, { now });
    expect(resumed).toMatchObject({
      checkpoint_status: "interrupted",
      next_action: "inspect_apply_state",
    });
    expect(resumed.next_action).not.toBe("apply_changes");
  });

  it("returns recovery guidance for a corrupt apply completion record", async () => {
    const root = await project();
    const approval = await createChangeApproval(
      {
        projectRoot: root,
        plan: setupPlan(),
        operationIds: ["create-client"],
        confirmedByInteractiveUser: true,
      },
      { now, idFactory: () => "corrupt-approval", ttlMs: 60_000 },
    );
    await writeFile(join(root, "approval.json"), JSON.stringify(approval), {
      mode: 0o600,
    });
    const created = await saveWorkflowCheckpoint(
      { projectRoot: root, completedStep: "inspection_completed" },
      { now, idFactory: () => "corrupt-checkpoint" },
    );
    await saveWorkflowCheckpoint(
      {
        projectRoot: root,
        workflowId: created.workflow_id,
        completedStep: "approval_created",
        artifactPaths: {
          tracking_plan: "tracking-plan.json",
          setup_plan: "setup-plan.json",
          approval: "approval.json",
        },
      },
      { now },
    );
    await mkdir(join(root, ".usermaven", "apply"));
    await writeFile(
      join(root, ".usermaven", "apply", `${approval.approval_id}.json`),
      "not-json",
      { mode: 0o600 },
    );

    const resumed = await resumeWorkflow(root, created.workflow_id, { now });
    expect(resumed).toMatchObject({
      checkpoint_status: "interrupted",
      next_action: "inspect_apply_state",
    });
  });
});
