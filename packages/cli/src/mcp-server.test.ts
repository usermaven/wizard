import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  projectInspectionSchema,
  trackingPlanSchema,
} from "@usermaven/wizard-schemas";
import { describe, expect, it } from "vitest";

import { createWizardMcpServer, resolveProjectPath } from "./mcp-server.js";

const fixtures = fileURLToPath(new URL("../../../fixtures/", import.meta.url));

async function connectedServer(root: string) {
  const server = await createWizardMcpServer({ root });
  const client = new Client({ name: "wizard-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
}

describe("local MCP server", () => {
  it("advertises only the two read-only tools", async () => {
    const { client, server } = await connectedServer(fixtures);
    try {
      const { tools } = await client.listTools();

      expect(tools.map((tool) => tool.name)).toEqual([
        "inspect_project",
        "propose_tracking_plan",
      ]);
      expect(
        tools.every(
          (tool) =>
            tool.annotations?.readOnlyHint === true &&
            tool.annotations.destructiveHint === false &&
            tool.annotations.openWorldHint === false,
        ),
      ).toBe(true);
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

  it("returns a review-required baseline plan", async () => {
    const { client, server } = await connectedServer(fixtures);
    try {
      const result = await client.callTool({
        name: "propose_tracking_plan",
        arguments: { project_path: "next-app-router" },
      });
      const plan = trackingPlanSchema.parse(result.structuredContent);

      expect(result.isError).not.toBe(true);
      expect(plan.events.map((event) => event.event_name)).toEqual([
        "page_view",
      ]);
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
