import { createHash } from "node:crypto";
import {
  access,
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

import { applyChanges, type CommandSpec } from "./apply.js";
import {
  approvalConfirmation,
  createChangeApproval,
  digestSetupPlan,
} from "./approval.js";
import { generateSetupPlan } from "./setup-plan.js";

const roots: string[] = [];
const fixedNow = () => new Date("2026-07-11T15:00:00Z");
const workspace = {
  display_name: "Example workspace",
  region: "us",
  public_key_fingerprint: "sha256:abcdef1234567890",
  tracking_host: "https://events.example.com",
};
const trackingPlan = trackingPlanSchema.parse({
  schema_version: "1",
  plan_id: "plan_apply-ai-1234",
  identity: [],
  events: [
    {
      id: "link-created",
      event_name: "link_created",
      description: "A link was created",
      business_question: "Do users activate?",
      category: "activation",
      trigger: { description: "After API confirmation", runtime: "server" },
      properties: [],
      pii: "none",
      authority: "server",
      deduplication_key: "link_id",
      owner: null,
      status: "proposed",
      revenue: false,
      proposal: {
        confidence: 0.8,
        rationale: ["Core activation journey"],
        review_required: true,
      },
    },
  ],
  shared_properties: [],
  proposal: {
    mode: "ai_generated",
    review_required: true,
    generated_by: {
      provider: "test",
      model: "test-model",
      prompt_version: "ai-tracking-plan-v1",
    },
    business_context_digest: `sha256:${"a".repeat(64)}`,
    assumptions: [],
    warnings: [],
    source: {
      framework: "react-vite",
      inspected_at: "2026-07-11T12:00:00Z",
      inspection_truncated: false,
    },
  },
  created_at: "2026-07-11T13:00:00Z",
  wizard_version: "0.9.0",
});
const instrumentationProposal = {
  schema_version: "1" as const,
  tracking_plan_id: trackingPlan.plan_id,
  changes: [
    {
      id: "generate-tracking-hooks",
      type: "create_file" as const,
      summary: "Create reviewed tracking hooks",
      path: "src/generated-tracking.ts",
      content: 'export const events = ["link_created"] as const;\n',
      covers: [{ kind: "event" as const, event_id: "link-created" }],
    },
  ],
  deferred: [],
  warnings: [],
  generated_by: { provider: "test", model: "test-coding-model" },
};

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "wizard-apply-"));
  roots.push(root);
  await mkdir(join(root, "src"));
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "apply-fixture",
      scripts: { build: "echo build" },
      dependencies: { react: "19.2.7", vite: "8.1.4" },
    }),
  );
  await writeFile(join(root, "src", "main.ts"), "export {};\n");
  return root;
}

async function generatedPlan(root: string): Promise<SetupPlan> {
  return generateSetupPlan(
    {
      projectRoot: root,
      workspace,
      trackingPlan,
      instrumentationProposal,
    },
    {
      now: fixedNow,
      idFactory: () => "apply-plan-1234",
    },
  );
}

async function approval(root: string, plan: SetupPlan, operationIds: string[]) {
  return createChangeApproval(
    {
      plan,
      projectRoot: root,
      operationIds,
      confirmedByInteractiveUser: true,
    },
    { now: fixedNow, idFactory: () => "apply-approval-1234" },
  );
}

describe("change approval", () => {
  it("binds exact operations, plan contents, root, and confirmation text", async () => {
    const root = await project();
    const plan = await generatedPlan(root);
    const result = await approval(root, plan, ["create-usermaven-client"]);

    expect(result.plan_digest).toBe(digestSetupPlan(plan));
    expect(result.repository_root_fingerprint).toMatch(
      /^sha256:[a-f0-9]{64}$/u,
    );
    expect(
      approvalConfirmation(result.plan_digest, result.operation_ids),
    ).toMatch(/^APPLY [a-f0-9]{12} create-usermaven-client$/u);
    expect(
      digestSetupPlan({ ...plan, risks: [...plan.risks, "changed"] }),
    ).not.toBe(result.plan_digest);
  });
});

describe("applyChanges", () => {
  it("atomically creates only an approved file and blocks replay", async () => {
    const root = await project();
    const plan = await generatedPlan(root);
    const approved = await approval(root, plan, ["create-usermaven-client"]);
    const result = await applyChanges(
      { projectRoot: root, plan, approval: approved },
      { now: fixedNow },
    );

    expect(result.outcome).toBe("succeeded");
    expect(await readFile(join(root, "src", "usermaven.ts"), "utf8")).toContain(
      "usermavenClient",
    );
    expect(result.operations).toEqual([
      expect.objectContaining({
        operation_id: "create-usermaven-client",
        outcome: "applied",
      }),
    ]);
    await expect(
      applyChanges(
        { projectRoot: root, plan, approval: approved },
        { now: fixedNow },
      ),
    ).rejects.toThrow("already been consumed");
  });

  it("rolls back a created file when an approved check fails", async () => {
    const root = await project();
    const plan = await generatedPlan(root);
    const approved = await approval(root, plan, [
      "create-usermaven-client",
      "run-project-build",
    ]);
    const result = await applyChanges(
      { projectRoot: root, plan, approval: approved },
      {
        now: fixedNow,
        commandRunner: async () => {
          throw new Error("synthetic build failure");
        },
      },
    );

    expect(result.outcome).toBe("rolled_back");
    await expect(access(join(root, "src", "usermaven.ts"))).rejects.toThrow();
    expect(result.operations).toEqual([
      expect.objectContaining({ outcome: "rolled_back" }),
      expect.objectContaining({ outcome: "failed" }),
    ]);
  });

  it("uses shell-free package arguments with lifecycle scripts disabled", async () => {
    const root = await project();
    const plan = await generatedPlan(root);
    const approved = await approval(root, plan, ["install-usermaven-sdk"]);
    const commands: CommandSpec[] = [];
    const result = await applyChanges(
      { projectRoot: root, plan, approval: approved },
      {
        now: fixedNow,
        commandRunner: async (command) => {
          commands.push(command);
          await writeFile(
            join(root, "package.json"),
            JSON.stringify({
              name: "apply-fixture",
              dependencies: { sdk: "installed" },
            }),
          );
        },
      },
    );

    expect(result.outcome).toBe("succeeded");
    expect(commands).toEqual([
      {
        command: "npm",
        args: ["install", "--ignore-scripts", "@usermaven/sdk-js@^1.5.15"],
        cwd: root,
      },
    ]);
  });

  it("restores package metadata after a partial install failure", async () => {
    const root = await project();
    const original = await readFile(join(root, "package.json"), "utf8");
    const plan = await generatedPlan(root);
    const approved = await approval(root, plan, ["install-usermaven-sdk"]);
    const result = await applyChanges(
      { projectRoot: root, plan, approval: approved },
      {
        now: fixedNow,
        commandRunner: async () => {
          await writeFile(join(root, "package.json"), "partially changed");
          await writeFile(join(root, "package-lock.json"), "partial lock");
          throw new Error("synthetic install failure");
        },
      },
    );

    expect(result.outcome).toBe("rolled_back");
    expect(await readFile(join(root, "package.json"), "utf8")).toBe(original);
    await expect(access(join(root, "package-lock.json"))).rejects.toThrow();
    expect(result.rollback.warnings.join(" ")).toContain("node_modules");
  });

  it("rejects a stale edit without overwriting the newer file", async () => {
    const root = await project();
    const target = join(root, "src", "existing.ts");
    const original = "export const value = 1;\n";
    await writeFile(target, original);
    const base = await generatedPlan(root);
    const beforeHash = `sha256:${createHash("sha256").update(original).digest("hex")}`;
    const plan = setupPlanSchema.parse({
      ...base,
      instrumentation: undefined,
      operations: [
        {
          id: "edit-existing",
          type: "edit_file",
          summary: "Update existing module",
          path: "src/existing.ts",
          before_hash: beforeHash,
          unified_diff:
            "--- a/src/existing.ts\n+++ b/src/existing.ts\n@@ -1 +1 @@\n-export const value = 1;\n+export const value = 2;\n",
          requires_approval: true,
        },
      ],
    });
    const approved = await approval(root, plan, ["edit-existing"]);
    await writeFile(target, "export const value = 3;\n");

    const result = await applyChanges(
      { projectRoot: root, plan, approval: approved },
      { now: fixedNow },
    );

    expect(result.outcome).toBe("rolled_back");
    expect(await readFile(target, "utf8")).toBe("export const value = 3;\n");
  });

  it("applies a matching single-file textual diff", async () => {
    const root = await project();
    const target = join(root, "src", "existing.ts");
    const original = "export const value = 1;\n";
    await writeFile(target, original);
    const base = await generatedPlan(root);
    const plan = setupPlanSchema.parse({
      ...base,
      instrumentation: undefined,
      operations: [
        {
          id: "edit-existing",
          type: "edit_file",
          summary: "Update existing module",
          path: "src/existing.ts",
          before_hash: `sha256:${createHash("sha256").update(original).digest("hex")}`,
          unified_diff:
            "--- a/src/existing.ts\n+++ b/src/existing.ts\n@@ -1 +1 @@\n-export const value = 1;\n+export const value = 2;\n",
          requires_approval: true,
        },
      ],
    });
    const approved = await approval(root, plan, ["edit-existing"]);

    const result = await applyChanges(
      { projectRoot: root, plan, approval: approved },
      { now: fixedNow },
    );

    expect(result.outcome).toBe("succeeded");
    expect(await readFile(target, "utf8")).toBe("export const value = 2;\n");
  });

  it("rejects a plan changed after approval before mutating state", async () => {
    const root = await project();
    const plan = await generatedPlan(root);
    const approved = await approval(root, plan, ["create-usermaven-client"]);
    const changed = setupPlanSchema.parse({
      ...plan,
      risks: [...plan.risks, "Changed after approval"],
    });

    await expect(
      applyChanges(
        { projectRoot: root, plan: changed, approval: approved },
        { now: fixedNow },
      ),
    ).rejects.toThrow("exact setup plan");
    await expect(access(join(root, "src", "usermaven.ts"))).rejects.toThrow();
    await expect(access(join(root, ".usermaven", "apply"))).rejects.toThrow();
  });

  it("rejects symlink parents without touching the external directory", async () => {
    const root = await project();
    const external = await mkdtemp(join(tmpdir(), "wizard-apply-external-"));
    roots.push(external);
    await symlink(external, join(root, "linked"));
    const base = await generatedPlan(root);
    const plan = setupPlanSchema.parse({
      ...base,
      instrumentation: undefined,
      operations: [
        {
          id: "unsafe-create",
          type: "create_file",
          summary: "Unsafe create",
          path: "linked/out.ts",
          content: "must not be written",
          requires_approval: true,
        },
      ],
    });
    const approved = await approval(root, plan, ["unsafe-create"]);
    const result = await applyChanges(
      { projectRoot: root, plan, approval: approved },
      { now: fixedNow },
    );

    expect(result.outcome).toBe("rolled_back");
    await expect(access(join(external, "out.ts"))).rejects.toThrow();
  });

  it("rejects approved mutations of protected local files", async () => {
    const root = await project();
    const base = await generatedPlan(root);
    const plan = setupPlanSchema.parse({
      ...base,
      instrumentation: undefined,
      operations: [
        {
          id: "unsafe-secret-create",
          type: "create_file",
          summary: "Unsafe secret create",
          path: ".env.local",
          content: "must not be written",
          requires_approval: true,
        },
      ],
    });
    const approved = await approval(root, plan, ["unsafe-secret-create"]);
    const result = await applyChanges(
      { projectRoot: root, plan, approval: approved },
      { now: fixedNow },
    );

    expect(result.outcome).toBe("rolled_back");
    await expect(access(join(root, ".env.local"))).rejects.toThrow();
  });

  it("rejects expired approval before creating apply state", async () => {
    const root = await project();
    const plan = await generatedPlan(root);
    const approved = await approval(root, plan, ["create-usermaven-client"]);

    await expect(
      applyChanges(
        { projectRoot: root, plan, approval: approved },
        { now: () => new Date("2026-07-11T16:00:00Z") },
      ),
    ).rejects.toThrow("expired");
    await expect(access(join(root, ".usermaven", "apply"))).rejects.toThrow();
  });

  it("rejects a schema-valid forged approval signature", async () => {
    const root = await project();
    const plan = await generatedPlan(root);
    const approved = await approval(root, plan, ["create-usermaven-client"]);
    const forged = {
      ...approved,
      approval_id: "approval_forged-approval-1234",
      signature: `sha256:${"0".repeat(64)}`,
    };

    await expect(
      applyChanges(
        { projectRoot: root, plan, approval: forged },
        { now: fixedNow },
      ),
    ).rejects.toThrow("signature is invalid");
    await expect(access(join(root, "src", "usermaven.ts"))).rejects.toThrow();
  });
});
