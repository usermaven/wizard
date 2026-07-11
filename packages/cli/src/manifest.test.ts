import { describe, expect, it } from "vitest";

import { wizardManifestSchema } from "@usermaven/wizard-schemas";

import { manifest } from "./manifest.js";

describe("CLI manifest", () => {
  it("conforms to the public schema", () => {
    expect(wizardManifestSchema.safeParse(manifest).success).toBe(true);
  });

  it("requires approval for every repository-mutating surface", () => {
    const surfaces = [...manifest.commands, ...manifest.local_mcp_tools];
    expect(
      surfaces
        .filter((surface) => surface.mutates_repository)
        .every((surface) => surface.requires_approval),
    ).toBe(true);
  });

  it("marks exactly the currently executable local MCP tools implemented", () => {
    expect(
      manifest.local_mcp_tools
        .filter((tool) => tool.availability === "implemented")
        .map((tool) => tool.name),
    ).toEqual([
      "inspect_project",
      "propose_tracking_plan",
      "generate_setup_plan",
      "preview_changes",
      "apply_changes",
    ]);
  });
});
