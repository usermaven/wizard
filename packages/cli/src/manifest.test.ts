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
});
