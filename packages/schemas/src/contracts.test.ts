import { describe, expect, it } from "vitest";

import {
  agentEventSchema,
  aiInstrumentationProposalSchema,
  eventCandidateSchema,
  projectInspectionSchema,
  relativePath,
  setupPlanSchema,
  verificationResultSchema,
} from "./index.js";

const property = (name: string) => ({
  name,
  description: `${name} value`,
  data_type: name === "amount" ? ("number" as const) : ("string" as const),
  required: true,
  pii: "none" as const,
});

const baseEvent = {
  id: "checkout-completed",
  event_name: "checkout_completed",
  description: "A checkout was completed",
  business_question: "How much revenue is being generated?",
  category: "monetization" as const,
  trigger: {
    description: "After the payment provider confirms the charge",
    runtime: "server" as const,
    file: "src/payments/confirm.ts",
  },
  properties: [
    property("amount"),
    property("currency"),
    property("transaction_id"),
  ],
  pii: "none" as const,
  authority: "server" as const,
  deduplication_key: "transaction_id",
  owner: "growth",
  status: "proposed" as const,
  revenue: true,
};

const trackingPlan = {
  schema_version: "1" as const,
  plan_id: "plan_12345678",
  identity: [],
  events: [baseEvent],
  shared_properties: [],
  created_at: "2026-07-11T10:00:00Z",
  wizard_version: "0.1.0",
};

describe("public contracts", () => {
  it("requires unique bounded AI instrumentation targets", () => {
    const change = {
      id: "wire-checkout",
      type: "create_file" as const,
      summary: "Wire checkout tracking",
      path: "src/checkout-tracking.ts",
      content: "export {};",
      covers: [{ kind: "event" as const, event_id: "checkout-completed" }],
    };
    const proposal = {
      schema_version: "1",
      tracking_plan_id: "plan_12345678",
      changes: [change],
      deferred: [],
      warnings: [],
      generated_by: { provider: "test", model: "test-model" },
    };

    expect(aiInstrumentationProposalSchema.safeParse(proposal).success).toBe(
      true,
    );
    expect(
      aiInstrumentationProposalSchema.safeParse({
        ...proposal,
        changes: [change, { ...change, id: "wire-checkout-again" }],
      }).success,
    ).toBe(false);
  });

  it("accepts a complete setup plan", () => {
    const result = setupPlanSchema.safeParse({
      schema_version: "1",
      plan_id: "plan_12345678",
      workspace: {
        display_name: "Example workspace",
        region: "us",
        public_key_fingerprint: "sha256:abcdef1234567890",
        tracking_host: "https://events.example.com",
      },
      project: {
        framework: "next-app-router",
        package_manager: "npm",
        confidence: 0.98,
      },
      operations: [
        {
          id: "install-sdk",
          type: "install_package",
          summary: "Install the browser SDK",
          package_name: "@usermaven/sdk-js",
          version_range: "^1.0.0",
          requires_approval: true,
        },
      ],
      tracking_plan: trackingPlan,
      checks: [
        {
          id: "sdk-import",
          layer: "static",
          description: "SDK is imported once",
          required: true,
        },
      ],
      risks: [],
      created_at: "2026-07-11T10:00:00Z",
      wizard_version: "0.1.0",
    });

    expect(result.success).toBe(true);
  });

  it("rejects repository mutation without explicit approval", () => {
    const result = setupPlanSchema.safeParse({
      schema_version: "1",
      plan_id: "plan_12345678",
      workspace: {
        display_name: "Example workspace",
        region: "us",
        public_key_fingerprint: "sha256:abcdef1234567890",
        tracking_host: "https://events.example.com",
      },
      project: {
        framework: "vite-react",
        package_manager: "npm",
        confidence: 1,
      },
      operations: [
        {
          id: "create-config",
          type: "create_file",
          summary: "Create analytics configuration",
          path: "src/usermaven.ts",
          content: "export {};",
          requires_approval: false,
        },
      ],
      tracking_plan: trackingPlan,
      checks: [],
      risks: [],
      created_at: "2026-07-11T10:00:00Z",
      wizard_version: "0.1.0",
    });

    expect(result.success).toBe(false);
  });

  it("requires authoritative revenue properties", () => {
    expect(
      eventCandidateSchema.safeParse({
        ...baseEvent,
        authority: "client",
        properties: [property("amount")],
      }).success,
    ).toBe(false);
    expect(eventCandidateSchema.safeParse(baseEvent).success).toBe(true);
  });

  it("rejects path traversal", () => {
    expect(relativePath.safeParse("../secrets.env").success).toBe(false);
    expect(relativePath.safeParse("C:\\secrets.env").success).toBe(false);
    expect(relativePath.safeParse("src\\analytics.ts").success).toBe(false);
    expect(relativePath.safeParse("src/analytics.ts").success).toBe(true);
  });

  it("does not accept raw event payloads in verification output", () => {
    const result = verificationResultSchema.safeParse({
      schema_version: "1",
      session_id: "session_12345678",
      plan_id: "plan_12345678",
      environment: "development",
      sdk_version: "1.2.3",
      started_at: "2026-07-11T10:00:00Z",
      completed_at: "2026-07-11T10:01:00Z",
      outcome: "pass",
      checks: [],
      received: {
        event_names: ["checkout_completed"],
        property_names: ["amount", "currency", "transaction_id"],
        identified_user: true,
        identified_company: false,
        raw_payload: { email: "person@example.com" },
      },
    });

    expect(result.success).toBe(false);
  });

  it("keeps agent events strict and versioned", () => {
    const valid = {
      schema_version: "1",
      run_id: "run_12345678",
      sequence: 3,
      timestamp: "2026-07-11T10:00:00Z",
      type: "approval_required",
      approval_id: "approval_12345678",
      operation_ids: ["install-sdk"],
      summary: "Approve installing @usermaven/sdk-js",
    };

    expect(agentEventSchema.safeParse(valid).success).toBe(true);
    expect(
      agentEventSchema.safeParse({ ...valid, shell: "npm install" }).success,
    ).toBe(false);
  });

  it("keeps project inspection normalized and rejects source snippets", () => {
    const occurrence: Record<string, unknown> = {
      provider: "usermaven",
      kind: "track",
      path: "src/analytics.ts",
      line: 4,
      matched_token: "usermaven.track",
      source: "usermaven.track('checkout', { email })",
    };
    const inspection = {
      schema_version: "1",
      project: {
        framework: "react-vite",
        package_manager: "npm",
        confidence: 1,
      },
      evidence: [{ kind: "dependency", path: "package.json", detail: "vite" }],
      analytics_dependencies: [],
      instrumentation: [occurrence],
      scan: {
        files_considered: 1,
        files_scanned: 1,
        bytes_scanned: 100,
        truncated: false,
        skipped_symlinks: 0,
      },
      warnings: [],
      inspected_at: "2026-07-11T10:00:00Z",
      wizard_version: "0.2.0",
    };

    expect(projectInspectionSchema.safeParse(inspection).success).toBe(false);
    delete occurrence.source;
    expect(projectInspectionSchema.safeParse(inspection).success).toBe(true);
  });
});
