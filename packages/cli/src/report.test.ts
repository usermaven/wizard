import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createBaselineTrackingPlan,
  generateSetupPlan,
  inspectProject,
} from "@usermaven/wizard-core";
import { applyResultSchema } from "@usermaven/wizard-schemas";
import { afterEach, describe, expect, it } from "vitest";

import { buildSetupReport } from "./report.js";

const temporaryRoots: string[] = [];

const workspace = {
  display_name: "Example workspace",
  region: "us",
  public_key_fingerprint: "sha256:abcdef1234567890",
  tracking_host: "https://events.example.com",
};

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

async function baselinePlan() {
  const root = await mkdtemp(join(tmpdir(), "wizard-report-"));
  temporaryRoots.push(root);
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "fixture-react-vite",
      private: true,
      type: "module",
      dependencies: { react: "19.2.7", vite: "8.1.4" },
    }),
  );
  await writeFile(join(root, "src", "main.jsx"), "export {};\n");
  const trackingPlan = createBaselineTrackingPlan({
    inspection: await inspectProject(root),
  });
  return generateSetupPlan({ projectRoot: root, workspace, trackingPlan });
}

describe("buildSetupReport", () => {
  it("renders a plan-only report with env-var guidance", async () => {
    const plan = await baselinePlan();
    const report = buildSetupReport({
      plan,
      generatedAt: "2026-07-11T15:00:00.000Z",
    });

    expect(report).toContain("# Usermaven setup report");
    expect(report).toContain("baseline (automatic page views only)");
    expect(report).toContain("`install-usermaven-sdk`");
    expect(report).toContain("VITE_USERMAVEN_KEY");
    expect(report).toContain("Apply outcome: not applied yet");
    expect(report).not.toContain("sha256:abcdef1234567890");
  });

  it("reflects apply outcomes per operation", async () => {
    const plan = await baselinePlan();
    const digest = `sha256:${"a".repeat(64)}`;
    const applyResult = applyResultSchema.parse({
      schema_version: "1",
      plan_id: plan.plan_id,
      approval_id: "approval_test-1234",
      plan_digest: digest,
      repository_root_fingerprint: digest,
      outcome: "succeeded",
      operations: [
        {
          operation_id: "install-usermaven-sdk",
          type: "install_package",
          outcome: "applied",
          summary: "Install the Usermaven browser SDK",
        },
      ],
      rollback: { attempted: false, succeeded: false, warnings: [] },
      warnings: [],
      state_record: ".usermaven/state/apply.json",
      started_at: "2026-07-11T15:00:00.000Z",
      completed_at: "2026-07-11T15:00:05.000Z",
    });

    const report = buildSetupReport({
      plan,
      applyResult,
      generatedAt: "2026-07-11T15:00:10.000Z",
    });

    expect(report).toContain("Apply outcome: succeeded");
    expect(report).toMatch(
      /`install-usermaven-sdk` \| install_package \| applied/u,
    );
  });
});
