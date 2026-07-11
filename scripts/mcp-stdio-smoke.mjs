import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["packages/cli/dist/mcp.js", "--root", "fixtures"],
  cwd: process.cwd(),
  stderr: "pipe",
});
const client = new Client({ name: "wizard-stdio-smoke", version: "1.0.0" });

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
} finally {
  await client.close();
}
