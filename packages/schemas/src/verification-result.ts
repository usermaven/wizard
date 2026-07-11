import { z } from "zod";

import {
  checkOutcomeSchema,
  isoDateTime,
  safeValueSchema,
  schemaVersion,
} from "./common.js";
import { sha256DigestSchema } from "./common.js";

const observedNames = z.array(z.string().min(1).max(128)).max(1_000);

export const verificationSessionSchema = z
  .object({
    schema_version: schemaVersion,
    session_id: z.string().regex(/^verify_[a-zA-Z0-9-]{8,120}$/u),
    plan_id: z.string().min(8).max(128),
    plan_digest: sha256DigestSchema,
    environment: z.string().min(1).max(64),
    marker_property: z.literal("_usermaven_verification_id"),
    created_at: isoDateTime,
    expires_at: isoDateTime,
  })
  .strict()
  .superRefine((session, context) => {
    const duration =
      Date.parse(session.expires_at) - Date.parse(session.created_at);
    if (duration <= 0 || duration > 60 * 60 * 1_000) {
      context.addIssue({
        code: "custom",
        message:
          "verification session expiry must be after creation and within one hour",
        path: ["expires_at"],
      });
    }
  });

export const runtimeVerificationEvidenceSchema = z
  .object({
    source: z.enum(["browser_observer", "e2e_test"]),
    observed_at: isoDateTime,
    event_names: observedNames,
    property_names: observedNames,
    identified_user: z.boolean(),
    identified_company: z.boolean(),
    verification_marker_matched: z.boolean(),
  })
  .strict();

export const transportVerificationEvidenceSchema = z
  .object({
    source: z.enum(["browser_observer", "e2e_test"]),
    observed_at: isoDateTime,
    tracking_host: z.url().max(2_000),
    accepted: z.boolean(),
    status_code: z.number().int().min(100).max(599).nullable(),
    event_names: observedNames,
    verification_marker_matched: z.boolean(),
  })
  .strict();

export const workspaceReceiptEvidenceSchema = z
  .object({
    source: z.literal("remote_usermaven_mcp"),
    observed_at: isoDateTime,
    public_key_fingerprint: z.string().startsWith("sha256:").max(128),
    event_names: observedNames,
    property_names: observedNames,
    identified_user: z.boolean(),
    identified_company: z.boolean(),
    verification_marker_matched: z.boolean(),
    attestation: z
      .object({
        algorithm: z.literal("ed25519"),
        key_id: z.string().regex(/^[a-zA-Z0-9._-]{1,128}$/u),
        signature: z.string().regex(/^[a-zA-Z0-9_-]{40,512}$/u),
      })
      .strict(),
  })
  .strict();

export const verificationEvidenceSchema = z
  .object({
    session_id: z.string().regex(/^verify_[a-zA-Z0-9-]{8,120}$/u),
    runtime: runtimeVerificationEvidenceSchema.optional(),
    transport: transportVerificationEvidenceSchema.optional(),
    workspace_receipt: workspaceReceiptEvidenceSchema.optional(),
  })
  .strict();

export const verificationCheckSchema = z
  .object({
    id: z.string().min(1).max(128),
    layer: z.enum(["static", "runtime", "transport", "workspace_receipt"]),
    outcome: checkOutcomeSchema,
    summary: z.string().min(1).max(2_000),
    observed_at: isoDateTime,
    normalized_details: z.record(z.string(), safeValueSchema).default({}),
    suggested_fix: z.string().min(1).max(5_000).nullable(),
  })
  .strict();

export const verificationResultSchema = z
  .object({
    schema_version: schemaVersion,
    session_id: z.string().min(8).max(128),
    plan_id: z.string().min(8).max(128),
    environment: z.string().min(1).max(64),
    sdk_version: z.string().min(1).max(64).nullable(),
    started_at: isoDateTime,
    completed_at: isoDateTime,
    outcome: checkOutcomeSchema,
    checks: z.array(verificationCheckSchema).max(250),
    received: z
      .object({
        event_names: observedNames,
        property_names: observedNames,
        identified_user: z.boolean(),
        identified_company: z.boolean(),
      })
      .strict(),
  })
  .strict()
  .superRefine((result, context) => {
    if (Date.parse(result.completed_at) < Date.parse(result.started_at)) {
      context.addIssue({
        code: "custom",
        message: "verification cannot complete before it starts",
        path: ["completed_at"],
      });
    }
    const expected = result.checks.some((item) => item.outcome === "fail")
      ? "fail"
      : result.checks.some((item) => item.outcome === "warn")
        ? "warn"
        : "pass";
    if (result.outcome !== expected) {
      context.addIssue({
        code: "custom",
        message: "verification outcome must reflect its checks",
        path: ["outcome"],
      });
    }
  });

export type VerificationCheck = z.infer<typeof verificationCheckSchema>;
export type VerificationResult = z.infer<typeof verificationResultSchema>;
export type VerificationSession = z.infer<typeof verificationSessionSchema>;
export type RuntimeVerificationEvidence = z.infer<
  typeof runtimeVerificationEvidenceSchema
>;
export type TransportVerificationEvidence = z.infer<
  typeof transportVerificationEvidenceSchema
>;
export type WorkspaceReceiptEvidence = z.infer<
  typeof workspaceReceiptEvidenceSchema
>;
export type VerificationEvidence = z.infer<typeof verificationEvidenceSchema>;
