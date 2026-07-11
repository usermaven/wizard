import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["packages/cli/dist/mcp.js", "--root", "fixtures"],
  cwd: process.cwd(),
  stderr: "pipe",
});
const client = new Client({ name: "wizard-stdio-smoke", version: "1.0.0" });
let childStderr = "";
transport.stderr?.on("data", (chunk) => {
  childStderr += chunk.toString();
});

try {
  await client.connect(transport);
  const listed = await client.listTools();
  const names = listed.tools.map((tool) => tool.name);
  if (
    names.join(",") !==
    "inspect_project,propose_tracking_plan,generate_setup_plan,preview_changes,apply_changes"
  ) {
    throw new Error(`Unexpected MCP tools: ${names.join(", ")}`);
  }

  const result = await client.callTool({
    name: "inspect_project",
    arguments: { project_path: "react-vite" },
  });
  if (
    result.isError ||
    result.structuredContent?.project?.framework !== "react-vite"
  ) {
    throw new Error("MCP inspection smoke call failed");
  }

  const tracking = await client.callTool({
    name: "propose_tracking_plan",
    arguments: {
      project_path: "react-vite",
      business_context: {
        product_name: "Smoke product",
        product_description:
          "A collaborative product used to validate the local MCP setup flow.",
        business_goals: ["Validate activation"],
        key_user_journeys: ["A user completes the primary product action"],
        data_policy: [],
      },
      ai_proposal: {
        identity: [],
        events: [
          {
            id: "primary-action",
            event_name: "primary_action_completed",
            description: "The primary product action completed",
            business_question: "Do users activate?",
            category: "activation",
            trigger: {
              description: "After authoritative completion",
              runtime: "server",
            },
            properties: [],
            pii: "none",
            authority: "server",
            deduplication_key: null,
            owner: null,
            status: "proposed",
            revenue: false,
            proposal: {
              confidence: 0.7,
              rationale: ["The journey identifies this as the primary action"],
              review_required: true,
            },
          },
        ],
        shared_properties: [],
        assumptions: [],
        warnings: [],
        generated_by: { provider: "mcp-client", model: "smoke-model" },
      },
    },
  });
  if (
    tracking.isError ||
    tracking.structuredContent?.proposal?.mode !== "ai_generated"
  ) {
    throw new Error("MCP AI tracking-plan smoke call failed");
  }

  const generated = await client.callTool({
    name: "generate_setup_plan",
    arguments: {
      project_path: "react-vite",
      workspace: {
        display_name: "Smoke workspace",
        region: "us",
        public_key_fingerprint: "sha256:smoke-test",
        tracking_host: "https://events.example.com",
      },
      tracking_plan: tracking.structuredContent,
    },
  });
  if (
    generated.isError ||
    !Array.isArray(generated.structuredContent?.operations) ||
    generated.structuredContent.operations.length < 1
  ) {
    throw new Error("MCP setup-plan smoke call failed");
  }
  const previewed = await client.callTool({
    name: "preview_changes",
    arguments: { setup_plan: generated.structuredContent },
  });
  if (
    previewed.isError ||
    previewed.structuredContent?.summary?.total !==
      generated.structuredContent.operations.length
  ) {
    throw new Error("MCP preview smoke call failed");
  }
  process.stdout.write("stdio MCP smoke passed\n");
} catch (error) {
  if (childStderr) {
    process.stderr.write(`MCP child stderr:\n${childStderr}\n`);
  }
  throw error;
} finally {
  await client.close();
}
