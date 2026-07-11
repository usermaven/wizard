import {
  createHash,
  generateKeyPairSync,
  sign as signPayload,
} from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  setupPlanSchema,
  verificationResultSchema,
  type SetupPlan,
  type VerificationEvidence,
} from "@usermaven/wizard-schemas";
import { afterEach, describe, expect, it } from "vitest";

import {
  createVerificationSession,
  verifySetup,
  workspaceReceiptAttestationPayload,
} from "./verify.js";

const roots: string[] = [];
const oldAction = "export function complete() { return true; }\n";
const newAction =
  'export function complete() { usermaven?.track("link_created", { workspace_id: "private-payload-value" }); return true; }\n';
const client = `const key = import.meta.env.VITE_USERMAVEN_KEY;
const host = import.meta.env.VITE_USERMAVEN_TRACKING_HOST ?? "https://events.example.com";
export const usermaven = { key, host };
`;
const receiptKeys = generateKeyPairSync("ed25519");
const receiptKeyId = "test-workspace-key";
const trustedWorkspaceKeys = {
  [receiptKeyId]: receiptKeys.publicKey.export({
    type: "spki",
    format: "pem",
  }) as string,
};

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "wizard-verify-"));
  roots.push(root);
  await mkdir(join(root, "src"));
  await mkdir(join(root, "node_modules", "@usermaven", "sdk-js"), {
    recursive: true,
  });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "verify-fixture",
      dependencies: { "@usermaven/sdk-js": "^1.5.15" },
    }),
  );
  await writeFile(join(root, "src", "usermaven.ts"), client);
  await writeFile(join(root, "src", "action.ts"), newAction);
  await writeFile(
    join(root, "node_modules", "@usermaven", "sdk-js", "package.json"),
    JSON.stringify({ name: "@usermaven/sdk-js", version: "1.5.15" }),
  );
  return root;
}

function plan(): SetupPlan {
  return setupPlanSchema.parse({
    schema_version: "1",
    plan_id: "setup_verify-1234",
    workspace: {
      display_name: "Example workspace",
      region: "us",
      public_key_fingerprint: "sha256:workspace-example",
      tracking_host: "https://events.example.com",
      key_env_var: "VITE_USERMAVEN_KEY",
      tracking_host_env_var: "VITE_USERMAVEN_TRACKING_HOST",
    },
    project: {
      framework: "react-vite",
      package_manager: "npm",
      confidence: 1,
    },
    operations: [
      {
        id: "create-usermaven-client",
        type: "create_file",
        summary: "Create Usermaven client",
        path: "src/usermaven.ts",
        content: client,
        requires_approval: true,
      },
      {
        id: "instrument-link-created",
        type: "edit_file",
        summary: "Track link creation",
        path: "src/action.ts",
        before_hash: `sha256:${createHash("sha256").update(oldAction).digest("hex")}`,
        unified_diff: `--- a/src/action.ts
+++ b/src/action.ts
@@ -1 +1 @@
-${oldAction}+${newAction}`,
        requires_approval: true,
      },
    ],
    tracking_plan: {
      schema_version: "1",
      plan_id: "plan_verify-1234",
      identity: [
        {
          kind: "user",
          identifier: "user_id",
          trigger: { description: "After authentication", runtime: "client" },
          properties: [],
          status: "proposed",
          proposal: {
            confidence: 0.8,
            rationale: ["Attribute activation"],
            review_required: true,
          },
        },
      ],
      events: [
        {
          id: "link-created",
          event_name: "link_created",
          description: "A link was created",
          business_question: "Do users activate?",
          category: "activation",
          trigger: { description: "After API confirmation", runtime: "server" },
          properties: [
            {
              name: "workspace_id",
              description: "Stable workspace ID",
              data_type: "string",
              required: true,
              pii: "none",
            },
          ],
          pii: "none",
          authority: "server",
          deduplication_key: "link_id",
          owner: null,
          status: "proposed",
          revenue: false,
          proposal: {
            confidence: 0.8,
            rationale: ["Core activation journey"],
            review_required: true,
          },
        },
      ],
      shared_properties: [],
      proposal: {
        mode: "ai_generated",
        review_required: true,
        generated_by: {
          provider: "test",
          model: "test-model",
          prompt_version: "ai-tracking-plan-v1",
        },
        business_context_digest: `sha256:${"a".repeat(64)}`,
        assumptions: [],
        warnings: [],
        source: {
          framework: "react-vite",
          inspected_at: "2026-07-11T14:00:00Z",
          inspection_truncated: false,
        },
      },
      created_at: "2026-07-11T14:00:00Z",
      wizard_version: "0.9.0",
    },
    instrumentation: {
      generated_by: { provider: "test", model: "test-coding-model" },
      coverage: [
        {
          operation_id: "instrument-link-created",
          items: [
            {
              kind: "identity",
              identity_kind: "user",
              identifier: "user_id",
            },
            { kind: "event", event_id: "link-created" },
          ],
        },
      ],
      deferred: [],
      warnings: [],
    },
    checks: [],
    risks: [],
    created_at: "2026-07-11T14:00:00Z",
    wizard_version: "0.9.0",
  });
}

function evidence(sessionId: string): VerificationEvidence {
  const result: VerificationEvidence = {
    session_id: sessionId,
    runtime: {
      source: "e2e_test",
      observed_at: "2026-07-11T15:02:00Z",
      event_names: ["link_created"],
      property_names: ["workspace_id"],
      identified_user: true,
      identified_company: false,
      verification_marker_matched: true,
    },
    transport: {
      source: "browser_observer",
      observed_at: "2026-07-11T15:02:01Z",
      tracking_host: "https://events.example.com/",
      accepted: true,
      status_code: 202,
      event_names: ["link_created"],
      verification_marker_matched: true,
    },
    workspace_receipt: {
      source: "remote_usermaven_mcp",
      observed_at: "2026-07-11T15:03:00Z",
      public_key_fingerprint: "sha256:workspace-example",
      event_names: ["link_created"],
      property_names: ["workspace_id"],
      identified_user: true,
      identified_company: false,
      verification_marker_matched: true,
      attestation: {
        algorithm: "ed25519",
        key_id: receiptKeyId,
        signature: "placeholder-signature-that-is-long-enough-for-schema",
      },
    },
  };
  result.workspace_receipt!.attestation.signature = signPayload(
    null,
    Buffer.from(
      workspaceReceiptAttestationPayload(sessionId, result.workspace_receipt!),
    ),
    receiptKeys.privateKey,
  ).toString("base64url");
  return result;
}

describe("verification", () => {
  it("creates a bounded marker session", () => {
    const session = createVerificationSession(
      { plan: plan(), environment: "staging" },
      {
        now: () => new Date("2026-07-11T15:00:00Z"),
        idFactory: () => "session-1234",
      },
    );

    expect(session).toMatchObject({
      session_id: "verify_session-1234",
      plan_id: "setup_verify-1234",
      environment: "staging",
      marker_property: "_usermaven_verification_id",
    });
  });

  it("passes exact static state and marker-bound live evidence", async () => {
    const root = await project();
    const setup = plan();
    const session = createVerificationSession(
      { plan: setup, environment: "staging" },
      {
        now: () => new Date("2026-07-11T15:00:00Z"),
        idFactory: () => "session-1234",
      },
    );
    const result = await verifySetup(
      {
        projectRoot: root,
        plan: setup,
        session,
        evidence: evidence(session.session_id),
      },
      {
        now: () => new Date("2026-07-11T15:05:00Z"),
        trustedWorkspaceKeys,
      },
    );

    expect(verificationResultSchema.safeParse(result).success).toBe(true);
    expect(result.outcome).toBe("pass");
    expect(result.checks.every((item) => item.outcome === "pass")).toBe(true);
    expect(result.received).toEqual({
      event_names: ["link_created"],
      property_names: ["workspace_id"],
      identified_user: true,
      identified_company: false,
    });
    expect(JSON.stringify(result)).not.toContain("private-payload-value");
  });

  it("rejects otherwise-valid workspace receipts without a trusted attestation key", async () => {
    const root = await project();
    const setup = plan();
    const session = createVerificationSession(
      { plan: setup, environment: "staging" },
      { now: () => new Date("2026-07-11T15:00:00Z") },
    );
    const result = await verifySetup(
      {
        projectRoot: root,
        plan: setup,
        session,
        evidence: evidence(session.session_id),
      },
      { now: () => new Date("2026-07-11T15:05:00Z") },
    );

    expect(result.outcome).toBe("fail");
    expect(
      result.checks.find((check) => check.id === "workspace-receipt"),
    ).toMatchObject({
      outcome: "fail",
      normalized_details: { attestation_valid: false },
    });
    expect(result.received.event_names).toEqual([]);
  });

  it("warns when live evidence is not yet supplied", async () => {
    const root = await project();
    const setup = plan();
    const session = createVerificationSession(
      { plan: setup, environment: "local" },
      { now: () => new Date("2026-07-11T15:00:00Z") },
    );
    const result = await verifySetup(
      {
        projectRoot: root,
        plan: setup,
        session,
        evidence: { session_id: session.session_id },
      },
      {
        now: () => new Date("2026-07-11T15:05:00Z"),
        trustedWorkspaceKeys,
      },
    );

    expect(result.outcome).toBe("warn");
    expect(
      result.checks.filter((item) => item.outcome === "warn"),
    ).toHaveLength(3);
  });

  it("fails altered files and wrong-workspace evidence without exposing values", async () => {
    const root = await project();
    await writeFile(join(root, "src", "action.ts"), "tampered local value");
    const setup = plan();
    const session = createVerificationSession(
      { plan: setup, environment: "staging" },
      { now: () => new Date("2026-07-11T15:00:00Z") },
    );
    const wrong = evidence(session.session_id);
    wrong.workspace_receipt!.public_key_fingerprint = "sha256:wrong-workspace";
    const result = await verifySetup(
      { projectRoot: root, plan: setup, session, evidence: wrong },
      { now: () => new Date("2026-07-11T15:05:00Z") },
    );

    expect(result.outcome).toBe("fail");
    expect(result.received.event_names).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("tampered local value");
  });

  it("rejects expired or mismatched sessions before verification", async () => {
    const root = await project();
    const setup = plan();
    const session = createVerificationSession(
      { plan: setup, environment: "staging" },
      {
        now: () => new Date("2026-07-11T15:00:00Z"),
        ttlMs: 1_000,
      },
    );

    await expect(
      verifySetup(
        {
          projectRoot: root,
          plan: setup,
          session,
          evidence: { session_id: "verify_another-session" },
        },
        { now: () => new Date("2026-07-11T15:05:00Z") },
      ),
    ).rejects.toThrow("does not match the session");
    await expect(
      verifySetup(
        {
          projectRoot: root,
          plan: setup,
          session,
          evidence: { session_id: session.session_id },
        },
        { now: () => new Date("2026-07-11T15:05:00Z") },
      ),
    ).rejects.toThrow("expired");
  });

  it("rejects a setup plan changed after session creation", async () => {
    const root = await project();
    const setup = plan();
    const session = createVerificationSession(
      { plan: setup, environment: "staging" },
      { now: () => new Date("2026-07-11T15:00:00Z") },
    );
    const changed = setupPlanSchema.parse({
      ...setup,
      risks: [...setup.risks, "Changed after verification session creation"],
    });

    await expect(
      verifySetup(
        {
          projectRoot: root,
          plan: changed,
          session,
          evidence: { session_id: session.session_id },
        },
        { now: () => new Date("2026-07-11T15:05:00Z") },
      ),
    ).rejects.toThrow("exact setup plan");
  });

  it("fails public-key reference checks when optional env names are absent", async () => {
    const root = await project();
    const setup = setupPlanSchema.parse({
      ...plan(),
      workspace: {
        ...plan().workspace,
        key_env_var: undefined,
        tracking_host_env_var: undefined,
      },
    });
    const session = createVerificationSession(
      { plan: setup, environment: "test" },
      { now: () => new Date("2026-07-11T15:00:00Z") },
    );
    const result = await verifySetup(
      {
        projectRoot: root,
        plan: setup,
        session,
        evidence: { session_id: session.session_id },
      },
      { now: () => new Date("2026-07-11T15:05:00Z") },
    );

    expect(
      result.checks.find((check) => check.id === "public-config-references"),
    ).toMatchObject({ outcome: "fail" });
  });
});
