import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { setupPlanSchema, type SetupPlan } from "@usermaven/wizard-schemas";
import { afterEach, describe, expect, it } from "vitest";

import { createChangeApproval, verifyChangeApproval } from "./approval.js";

const roots: string[] = [];
const now = () => new Date("2026-07-11T12:00:00.000Z");

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "wizard-approval-"));
  roots.push(root);
  await mkdir(join(root, "src"));
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "fixture" }),
  );
  return root;
}

function plan(operations: SetupPlan["operations"]): SetupPlan {
  return setupPlanSchema.parse({
    schema_version: "1",
    plan_id: "setup_approval-test-1234",
    workspace: {
      display_name: "Test",
      region: "us",
      public_key_fingerprint: "sha256:test-fingerprint",
      tracking_host: "https://events.example.com",
    },
    project: { framework: "react-vite", package_manager: "npm", confidence: 1 },
    operations,
    tracking_plan: {
      schema_version: "1",
      plan_id: "plan_approval-test-1234",
      identity: [],
      events: [],
      shared_properties: [],
      created_at: now().toISOString(),
      wizard_version: "0.11.0",
    },
    checks: [],
    risks: [],
    created_at: now().toISOString(),
    wizard_version: "0.11.0",
  });
}

const executable = {
  id: "create-client",
  type: "create_file" as const,
  summary: "Create client",
  path: "src/client.ts",
  content: "export {};\n",
  requires_approval: true as const,
};
const manual = {
  id: "configure-env",
  type: "manual_step" as const,
  summary: "Configure env",
  instructions: "Set the public key",
  requires_approval: false as const,
};

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

describe("change approval boundary", () => {
  it.each([
    [["missing"], "Unknown operation ID"],
    [["create-client", "create-client"], "must be unique"],
    [["configure-env"], "at least one executable operation"],
  ] as const)(
    "rejects invalid operation selection %j",
    async (ids, message) => {
      const root = await project();
      await expect(
        createChangeApproval(
          {
            plan: plan([executable, manual]),
            projectRoot: root,
            operationIds: [...ids],
            confirmedByInteractiveUser: true,
          },
          { now },
        ),
      ).rejects.toThrow(message);
    },
  );

  it.each([0, 3_600_001, 1.5])("rejects invalid TTL %s", async (ttlMs) => {
    const root = await project();
    await expect(
      createChangeApproval(
        {
          plan: plan([executable]),
          projectRoot: root,
          operationIds: ["create-client"],
          confirmedByInteractiveUser: true,
        },
        { now, ttlMs },
      ),
    ).rejects.toThrow("TTL must be between");
  });

  it("rejects a valid signed approval in another repository root", async () => {
    const first = await project();
    const second = await project();
    const approval = await createChangeApproval(
      {
        plan: plan([executable]),
        projectRoot: first,
        operationIds: ["create-client"],
        confirmedByInteractiveUser: true,
      },
      { now },
    );

    await expect(verifyChangeApproval(second, approval)).rejects.toThrow(
      "signature is invalid",
    );
  });

  it("rejects broadening a signed approval after confirmation", async () => {
    const root = await project();
    const approval = await createChangeApproval(
      {
        plan: plan([executable, manual]),
        projectRoot: root,
        operationIds: ["create-client"],
        confirmedByInteractiveUser: true,
      },
      { now },
    );

    await expect(
      verifyChangeApproval(root, {
        ...approval,
        operation_ids: ["create-client", "configure-env"],
      }),
    ).rejects.toThrow("signature is invalid");
  });
});
