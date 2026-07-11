import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { setupPlanSchema, type SetupPlan } from "@usermaven/wizard-schemas";
import { afterEach, describe, expect, it } from "vitest";

import { loadSetupPlanArtifact, storeSetupPlanArtifact } from "./artifact.js";

const roots: string[] = [];

function plan(): SetupPlan {
  return setupPlanSchema.parse({
    schema_version: "1",
    plan_id: "setup_artifact-1234",
    workspace: {
      display_name: "Example",
      region: "us",
      public_key_fingerprint: "sha256:example",
      tracking_host: "https://events.example.com",
    },
    project: { framework: "react-vite", package_manager: "npm", confidence: 1 },
    operations: [],
    tracking_plan: {
      schema_version: "1",
      plan_id: "plan_artifact-1234",
      identity: [],
      events: [],
      shared_properties: [],
      created_at: "2026-07-11T10:00:00Z",
      wizard_version: "0.11.0",
    },
    checks: [],
    risks: [],
    created_at: "2026-07-11T10:00:00Z",
    wizard_version: "0.11.0",
  });
}

async function project() {
  const root = await mkdtemp(join(tmpdir(), "wizard-artifact-"));
  roots.push(root);
  await mkdir(join(root, "src"));
  return root;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

describe("setup-plan artifacts", () => {
  it("stores a private digest-addressed plan and loads it exactly", async () => {
    const root = await project();
    const reference = await storeSetupPlanArtifact(root, plan());
    const loaded = await loadSetupPlanArtifact(root, reference.plan_digest);

    expect(reference).toMatchObject({
      artifact_kind: "setup_plan",
      plan_id: "setup_artifact-1234",
      operation_count: 0,
    });
    expect(loaded).toEqual(plan());
    expect(
      await readFile(join(root, reference.artifact_path), "utf8"),
    ).toContain("setup_artifact-1234");
  });

  it("rejects a changed artifact instead of trusting its filename", async () => {
    const root = await project();
    const reference = await storeSetupPlanArtifact(root, plan());
    await writeFile(
      join(root, reference.artifact_path),
      JSON.stringify({ ...plan(), risks: ["tampered"] }),
      { mode: 0o600 },
    );

    await expect(
      loadSetupPlanArtifact(root, reference.plan_digest),
    ).rejects.toThrow("digest does not match");
  });
});
