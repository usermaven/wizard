import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createChangeApproval } from "@usermaven/wizard-core";
import {
  applyResultSchema,
  changePreviewSchema,
  projectInspectionSchema,
  setupPlanSchema,
  trackingPlanSchema,
  verificationResultSchema,
  verificationSessionSchema,
  type TrackingPlan,
} from "@usermaven/wizard-schemas";
import { describe, expect, it } from "vitest";

import { createWizardMcpServer, resolveProjectPath } from "./mcp-server.js";

const fixtures = fileURLToPath(new URL("../../../fixtures/", import.meta.url));
const businessContext = {
  product_name: "Example SaaS",
  product_description:
    "A collaborative link management product for marketing teams.",
  business_goals: ["Improve activation"],
  key_user_journeys: ["A new user creates their first branded link"],
  data_policy: ["Do not capture destination URLs"],
};
const aiProposal = {
  identity: [],
  events: [
    {
      id: "link-created",
      event_name: "link_created",
      description: "A user created a link",
      business_question: "How many users activate?",
      category: "activation",
      trigger: { description: "After API confirmation", runtime: "server" },
      properties: [],
      pii: "none",
      authority: "server",
      deduplication_key: "link_id",
      owner: "growth",
      status: "proposed",
      revenue: false,
      proposal: {
        confidence: 0.85,
        rationale: ["Link creation is the stated activation journey"],
        review_required: true,
      },
    },
  ],
  shared_properties: [],
  assumptions: [],
  warnings: [],
  generated_by: { provider: "mcp-client", model: "test-model" },
};

async function connectedServer(root: string) {
  const server = await createWizardMcpServer({ root });
  const client = new Client({ name: "wizard-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
}

async function generatedTrackingPlan(client: Client, projectPath?: string) {
  const result = await client.callTool({
    name: "propose_tracking_plan",
    arguments: {
      ...(projectPath ? { project_path: projectPath } : {}),
      business_context: businessContext,
      ai_proposal: aiProposal,
    },
  });
  expect(result.isError).not.toBe(true);
  return trackingPlanSchema.parse(result.structuredContent);
}

function generatedInstrumentation(plan: TrackingPlan) {
  return {
    schema_version: "1",
    tracking_plan_id: plan.plan_id,
    changes: [
      {
        id: "generate-tracking-hooks",
        type: "create_file",
        summary: "Create reviewed tracking hooks",
        path: "src/generated-tracking.ts",
        content: 'export const events = ["link_created"] as const;\n',
        covers: [{ kind: "event", event_id: "link-created" }],
      },
    ],
    deferred: [],
    warnings: [],
    generated_by: { provider: "mcp-client", model: "test-coding-model" },
  };
}

describe("local MCP server", () => {
  it("advertises six read-only tools and one destructive apply tool", async () => {
    const { client, server } = await connectedServer(fixtures);
    try {
      const { tools } = await client.listTools();

      expect(tools.map((tool) => tool.name)).toEqual([
        "inspect_project",
        "propose_tracking_plan",
        "generate_setup_plan",
        "preview_changes",
        "apply_changes",
        "prepare_verification",
        "verify_setup",
      ]);
      const readOnlyTools = tools.filter(
        (tool) => tool.name !== "apply_changes",
      );
      expect(
        readOnlyTools.every(
          (tool) =>
            tool.annotations?.readOnlyHint === true &&
            tool.annotations.destructiveHint === false &&
            tool.annotations.openWorldHint === false,
        ),
      ).toBe(true);
      expect(
        tools.find((tool) => tool.name === "apply_changes")?.annotations,
      ).toMatchObject({
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("returns schema-valid structured inspection output", async () => {
    const { client, server } = await connectedServer(fixtures);
    try {
      const result = await client.callTool({
        name: "inspect_project",
        arguments: { project_path: "react-vite" },
      });
      const inspection = projectInspectionSchema.parse(
        result.structuredContent,
      );

      expect(result.isError).not.toBe(true);
      expect(inspection.project.framework).toBe("react-vite");
      expect(JSON.stringify(result)).not.toContain("Synthetic checkout");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("validates a review-required AI-generated custom plan", async () => {
    const { client, server } = await connectedServer(fixtures);
    try {
      const plan = await generatedTrackingPlan(client, "next-app-router");

      expect(plan.events.map((event) => event.event_name)).toEqual([
        "link_created",
      ]);
      expect(plan.proposal?.mode).toBe("ai_generated");
      expect(plan.proposal?.review_required).toBe(true);
      expect(plan.events.every((event) => event.revenue === false)).toBe(true);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("rejects parent traversal through the protocol", async () => {
    const { client, server } = await connectedServer(fixtures);
    try {
      const result = await client.callTool({
        name: "inspect_project",
        arguments: { project_path: "../" },
      });

      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).not.toContain("/root/projects");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("generates and previews an approval-ready setup plan", async () => {
    const { client, server } = await connectedServer(fixtures);
    try {
      const trackingPlan = await generatedTrackingPlan(client, "react-vite");
      const generated = await client.callTool({
        name: "generate_setup_plan",
        arguments: {
          project_path: "react-vite",
          workspace: {
            display_name: "Example workspace",
            region: "us",
            public_key_fingerprint: "sha256:abcdef1234567890",
            tracking_host: "https://events.example.com",
          },
          tracking_plan: trackingPlan,
          ai_instrumentation: generatedInstrumentation(trackingPlan),
        },
      });
      const plan = setupPlanSchema.parse(generated.structuredContent);
      const previewed = await client.callTool({
        name: "preview_changes",
        arguments: { setup_plan: plan },
      });
      const preview = changePreviewSchema.parse(previewed.structuredContent);

      expect(generated.isError).not.toBe(true);
      expect(previewed.isError).not.toBe(true);
      expect(plan.operations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "install_package",
            requires_approval: true,
          }),
          expect.objectContaining({
            type: "create_file",
            requires_approval: true,
          }),
        ]),
      );
      expect(preview.summary.mutations).toBe(3);
      expect(JSON.stringify({ plan, preview })).not.toContain(
        "actual-workspace-key",
      );

      const prepared = await client.callTool({
        name: "prepare_verification",
        arguments: { setup_plan: plan, environment: "test" },
      });
      const session = verificationSessionSchema.parse(
        prepared.structuredContent,
      );
      const verified = await client.callTool({
        name: "verify_setup",
        arguments: {
          project_path: "react-vite",
          setup_plan: plan,
          session,
          evidence: { session_id: session.session_id },
        },
      });
      const verification = verificationResultSchema.parse(
        verified.structuredContent,
      );
      expect(verification.outcome).toBe("fail");
      expect(JSON.stringify(verification)).not.toContain("Synthetic checkout");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("rejects raw workspace keys at the protocol boundary", async () => {
    const { client, server } = await connectedServer(fixtures);
    try {
      const trackingPlan = await generatedTrackingPlan(client, "react-vite");
      const result = await client.callTool({
        name: "generate_setup_plan",
        arguments: {
          project_path: "react-vite",
          workspace: {
            display_name: "Example workspace",
            region: "us",
            public_key_fingerprint: "sha256:abcdef1234567890",
            tracking_host: "https://events.example.com",
            key: "actual-workspace-key",
          },
          tracking_plan: trackingPlan,
          ai_instrumentation: generatedInstrumentation(trackingPlan),
        },
      });

      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).not.toContain("actual-workspace-key");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("applies only operations covered by a CLI-style approval artifact", async () => {
    const root = await mkdtemp(join(tmpdir(), "wizard-mcp-apply-"));
    await mkdir(join(root, "src"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ name: "mcp-apply" }),
    );
    const { client, server } = await connectedServer(root);
    try {
      const trackingPlan = await generatedTrackingPlan(client);
      const generated = await client.callTool({
        name: "generate_setup_plan",
        arguments: {
          workspace: {
            display_name: "Example workspace",
            region: "us",
            public_key_fingerprint: "sha256:abcdef1234567890",
            tracking_host: "https://events.example.com",
          },
          tracking_plan: trackingPlan,
          ai_instrumentation: generatedInstrumentation(trackingPlan),
        },
      });
      const plan = setupPlanSchema.parse(generated.structuredContent);
      const approval = await createChangeApproval({
        plan,
        projectRoot: root,
        operationIds: [
          "create-usermaven-client",
          "instrument-generate-tracking-hooks",
        ],
        confirmedByInteractiveUser: true,
      });
      const applied = await client.callTool({
        name: "apply_changes",
        arguments: { setup_plan: plan, approval },
      });
      const result = applyResultSchema.parse(applied.structuredContent);

      expect(applied.isError).not.toBe(true);
      expect(result.outcome).toBe("succeeded");
      expect(
        await readFile(join(root, "src", "usermaven.ts"), "utf8"),
      ).toContain("usermavenClient");
      expect(
        await readFile(join(root, "src", "generated-tracking.ts"), "utf8"),
      ).toContain("link_created");
    } finally {
      await client.close();
      await server.close();
      await rm(root, { recursive: true });
    }
  });

  it("rejects a symlink that escapes the configured root", async () => {
    const root = await mkdtemp(join(tmpdir(), "wizard-mcp-root-"));
    const external = await mkdtemp(join(tmpdir(), "wizard-mcp-external-"));
    try {
      await mkdir(join(external, "project"));
      await symlink(join(external, "project"), join(root, "escape"));

      await expect(resolveProjectPath(root, "escape")).rejects.toThrow(
        "must stay within the configured MCP root",
      );
    } finally {
      await rm(root, { recursive: true });
      await rm(external, { recursive: true });
    }
  });
});
