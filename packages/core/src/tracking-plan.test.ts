import {
  aiTrackingProposalSchema,
  businessContextSchema,
  projectInspectionSchema,
  trackingPlanSchema,
  type AiTrackingProposal,
  type BusinessContext,
  type ProjectInspection,
} from "@usermaven/wizard-schemas";
import { describe, expect, it } from "vitest";

import { createAiTrackingPlan } from "./tracking-plan.js";

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
    wizard_version: "0.6.0",
    ...overrides,
  });
}

function context(overrides: Partial<BusinessContext> = {}): BusinessContext {
  return businessContextSchema.parse({
    product_name: "Example SaaS",
    product_description:
      "A collaborative link management product for marketing teams.",
    business_goals: ["Improve activation and retained collaboration"],
    key_user_journeys: [
      "A new user creates a branded link and invites a teammate",
    ],
    data_policy: ["Do not capture link destinations or free-form text"],
    ...overrides,
  });
}

function proposal(
  overrides: Partial<AiTrackingProposal> = {},
): AiTrackingProposal {
  return aiTrackingProposalSchema.parse({
    identity: [
      {
        kind: "user",
        identifier: "user_id",
        trigger: {
          description: "When an authenticated session becomes available",
          runtime: "client",
        },
        properties: [],
        status: "proposed",
        proposal: {
          confidence: 0.8,
          rationale: ["Required to measure activation by signed-in user"],
          review_required: true,
        },
      },
    ],
    events: [
      {
        id: "link-created",
        event_name: "link_created",
        description: "A user created a shortened link",
        business_question: "How many users reach the first value moment?",
        category: "activation",
        trigger: {
          description: "After the API confirms a new link",
          runtime: "server",
        },
        properties: [
          {
            name: "workspace_id",
            description: "Stable workspace identifier",
            data_type: "string",
            required: true,
            pii: "none",
          },
        ],
        pii: "none",
        authority: "server",
        deduplication_key: "link_id",
        owner: "growth",
        status: "proposed",
        revenue: false,
        proposal: {
          confidence: 0.86,
          rationale: ["The journey identifies link creation as activation"],
          review_required: true,
        },
      },
    ],
    shared_properties: [],
    assumptions: ["API confirmation represents successful creation"],
    warnings: ["Confirm the canonical workspace identifier"],
    generated_by: { provider: "mcp-client", model: "example-model" },
    ...overrides,
  });
}

describe("createAiTrackingPlan", () => {
  it("validates and stamps a custom AI-generated plan", () => {
    const plan = createAiTrackingPlan(
      {
        inspection: inspection(),
        businessContext: context(),
        aiProposal: proposal(),
      },
      options,
    );

    expect(trackingPlanSchema.safeParse(plan).success).toBe(true);
    expect(plan.plan_id).toBe("plan_test-12345678");
    expect(plan.events.map((event) => event.event_name)).toEqual([
      "link_created",
    ]);
    expect(plan.proposal).toMatchObject({
      mode: "ai_generated",
      review_required: true,
      generated_by: {
        provider: "mcp-client",
        model: "example-model",
        prompt_version: "ai-tracking-plan-v1",
      },
    });
    expect(plan.proposal?.business_context_digest).toMatch(
      /^sha256:[a-f0-9]{64}$/u,
    );
    expect(JSON.stringify(plan)).not.toContain("link destinations");
  });

  it("adds inspection limitations without exposing source", () => {
    const plan = createAiTrackingPlan(
      {
        inspection: inspection({
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
        businessContext: context(),
        aiProposal: proposal(),
      },
      options,
    );

    expect(plan.proposal?.warnings.join(" ")).toContain("truncated");
    expect(plan.proposal?.warnings.join(" ")).toContain("posthog");
    expect(plan.proposal?.warnings.join(" ")).toContain("framework is unknown");
  });

  it("rejects revenue inference without explicit revenue context", () => {
    const revenueEvent = {
      ...proposal().events[0]!,
      event_name: "subscription_paid",
      revenue: true,
      properties: [
        {
          name: "amount",
          description: "Paid amount in minor units",
          data_type: "number" as const,
          required: true,
          pii: "none" as const,
        },
        {
          name: "currency",
          description: "ISO currency code",
          data_type: "string" as const,
          required: true,
          pii: "none" as const,
        },
        {
          name: "transaction_id",
          description: "Payment transaction identifier",
          data_type: "string" as const,
          required: true,
          pii: "none" as const,
        },
      ],
    };

    expect(() =>
      createAiTrackingPlan({
        inspection: inspection(),
        businessContext: context(),
        aiProposal: proposal({ events: [revenueEvent] }),
      }),
    ).toThrow("explicit enabled revenue context");

    const accepted = createAiTrackingPlan({
      inspection: inspection(),
      businessContext: context({
        revenue: {
          enabled: true,
          description: "Subscription payments",
          authoritative_source: "Verified payment-provider webhook",
        },
      }),
      aiProposal: proposal({ events: [revenueEvent] }),
    });
    expect(accepted.events[0]?.revenue).toBe(true);
  });

  it("rejects AI items that bypass proposal review", () => {
    expect(() =>
      aiTrackingProposalSchema.parse({
        ...proposal(),
        events: [
          {
            ...proposal().events[0],
            status: "approved",
            proposal: undefined,
          },
        ],
      }),
    ).toThrow("review rationale");
  });
});
