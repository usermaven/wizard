import {
  projectInspectionSchema,
  trackingPlanSchema,
  type ProjectInspection,
} from "@usermaven/wizard-schemas";
import { describe, expect, it } from "vitest";

import { proposeTrackingPlan } from "./tracking-plan.js";

const now = () => new Date("2026-07-11T13:00:00Z");
const options = { now, idFactory: () => "test-12345678" };

function inspection(
  overrides: Partial<ProjectInspection> = {},
): ProjectInspection {
  return projectInspectionSchema.parse({
    schema_version: "1",
    project: {
      framework: "react-vite",
      package_manager: "npm",
      confidence: 0.99,
    },
    evidence: [{ kind: "dependency", path: "package.json", detail: "vite" }],
    analytics_dependencies: [],
    instrumentation: [],
    scan: {
      files_considered: 3,
      files_scanned: 3,
      bytes_scanned: 500,
      truncated: false,
      skipped_symlinks: 0,
    },
    warnings: [],
    inspected_at: "2026-07-11T12:00:00Z",
    wizard_version: "0.3.0",
    ...overrides,
  });
}

describe("proposeTrackingPlan", () => {
  it("creates a valid conservative baseline", () => {
    const plan = proposeTrackingPlan(inspection(), options);

    expect(trackingPlanSchema.safeParse(plan).success).toBe(true);
    expect(plan.plan_id).toBe("plan_test-12345678");
    expect(plan.created_at).toBe("2026-07-11T13:00:00.000Z");
    expect(plan.events.map((event) => event.event_name)).toEqual(["pageview"]);
    expect(plan.events.every((event) => !event.revenue)).toBe(true);
    expect(plan.identity[0]?.identifier).toBe("user_id");
    expect(plan.proposal?.review_required).toBe(true);
    expect(plan.proposal?.warnings).toContain(
      "No custom business events are inferred in deterministic baseline mode.",
    );
  });

  it("uses an existing identity location as review evidence", () => {
    const plan = proposeTrackingPlan(
      inspection({
        instrumentation: [
          {
            provider: "usermaven",
            kind: "identify",
            path: "src/auth.ts",
            line: 18,
            matched_token: "usermaven.id",
          },
        ],
      }),
      options,
    );

    expect(plan.identity[0]?.trigger.file).toBe("src/auth.ts");
    expect(plan.identity[0]?.proposal?.confidence).toBe(0.95);
    expect(JSON.stringify(plan)).not.toContain("private@example.com");
  });

  it("warns about incomplete inspection and analytics coexistence", () => {
    const plan = proposeTrackingPlan(
      inspection({
        project: {
          framework: "unknown",
          package_manager: "none",
          confidence: 0,
        },
        analytics_dependencies: [
          {
            provider: "posthog",
            package_name: "posthog-js",
            version_range: "1.0.0",
            dependency_type: "production",
          },
        ],
        scan: {
          files_considered: 5,
          files_scanned: 2,
          bytes_scanned: 100,
          truncated: true,
          skipped_symlinks: 0,
        },
      }),
      options,
    );

    expect(plan.events[0]?.proposal?.confidence).toBe(0.55);
    expect(plan.proposal?.warnings.join(" ")).toContain(
      "inspection was truncated",
    );
    expect(plan.proposal?.warnings.join(" ")).toContain("posthog");
    expect(plan.proposal?.warnings.join(" ")).toContain("framework is unknown");
  });
});
