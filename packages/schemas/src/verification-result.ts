import { z } from "zod";

import {
  checkOutcomeSchema,
  isoDateTime,
  safeValueSchema,
  schemaVersion,
} from "./common.js";

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
    checks: z.array(verificationCheckSchema),
    received: z
      .object({
        event_names: z.array(z.string().min(1).max(128)),
        property_names: z.array(z.string().min(1).max(128)),
        identified_user: z.boolean(),
        identified_company: z.boolean(),
      })
      .strict(),
  })
  .strict();

export type VerificationCheck = z.infer<typeof verificationCheckSchema>;
export type VerificationResult = z.infer<typeof verificationResultSchema>;
