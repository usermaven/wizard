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
  if (names.join(",") !== "inspect_project,propose_tracking_plan") {
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
  process.stdout.write("stdio MCP smoke passed\n");
} finally {
  await client.close();
}
