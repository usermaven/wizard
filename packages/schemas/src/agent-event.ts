import { z } from "zod";

import { isoDateTime, schemaVersion } from "./common.js";
import { verificationResultSchema } from "./verification-result.js";

const envelope = z.object({
  schema_version: schemaVersion,
  run_id: z.string().min(8).max(128),
  sequence: z.number().int().nonnegative(),
  timestamp: isoDateTime,
});

export const agentEventSchema = z.discriminatedUnion("type", [
  envelope
    .extend({
      type: z.literal("step_started"),
      step: z.string().min(1).max(128),
      message: z.string().min(1).max(2_000),
    })
    .strict(),
  envelope
    .extend({
      type: z.literal("progress"),
      step: z.string().min(1).max(128),
      completed: z.number().int().nonnegative(),
      total: z.number().int().positive().nullable(),
      message: z.string().min(1).max(2_000),
    })
    .strict(),
  envelope
    .extend({
      type: z.literal("approval_required"),
      approval_id: z.string().min(8).max(128),
      operation_ids: z.array(z.string().min(1).max(128)).min(1),
      summary: z.string().min(1).max(5_000),
    })
    .strict(),
  envelope
    .extend({
      type: z.literal("diff"),
      operation_id: z.string().min(1).max(128),
      path: z.string().min(1).max(2_000),
      unified_diff: z.string().max(500_000),
    })
    .strict(),
  envelope
    .extend({
      type: z.literal("verification"),
      result: verificationResultSchema,
    })
    .strict(),
  envelope
    .extend({
      type: z.literal("error"),
      code: z.string().min(1).max(128),
      message: z.string().min(1).max(5_000),
      retryable: z.boolean(),
    })
    .strict(),
  envelope
    .extend({
      type: z.literal("completed"),
      outcome: z.enum(["succeeded", "failed", "cancelled"]),
      summary: z.string().min(1).max(5_000),
    })
    .strict(),
]);

export type AgentEvent = z.infer<typeof agentEventSchema>;
