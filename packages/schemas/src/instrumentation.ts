import { z } from "zod";

import { relativePath, schemaVersion } from "./common.js";
import { sha256DigestSchema } from "./apply.js";

export const trackingItemReferenceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("identity"),
      identity_kind: z.enum(["user", "company"]),
      identifier: z.string().min(1).max(128),
    })
    .strict(),
  z
    .object({
      kind: z.literal("event"),
      event_id: z.string().min(1).max(128),
    })
    .strict(),
]);

const instrumentationChangeBase = z.object({
  id: z.string().min(1).max(128),
  summary: z.string().min(1).max(2_000),
  covers: z.array(trackingItemReferenceSchema).min(1).max(100),
});

export const aiInstrumentationChangeSchema = z.discriminatedUnion("type", [
  instrumentationChangeBase
    .extend({
      type: z.literal("edit_file"),
      path: relativePath,
      before_hash: sha256DigestSchema,
      unified_diff: z.string().min(1).max(500_000),
    })
    .strict(),
  instrumentationChangeBase
    .extend({
      type: z.literal("create_file"),
      path: relativePath,
      content: z.string().max(500_000),
    })
    .strict(),
]);

export const deferredTrackingItemSchema = z
  .object({
    item: trackingItemReferenceSchema,
    reason: z.string().min(1).max(2_000),
  })
  .strict();

export const aiInstrumentationProposalSchema = z
  .object({
    schema_version: schemaVersion,
    tracking_plan_id: z.string().min(8).max(128),
    changes: z.array(aiInstrumentationChangeSchema).max(100),
    deferred: z.array(deferredTrackingItemSchema).max(100),
    warnings: z.array(z.string().min(1).max(1_000)).max(50),
    generated_by: z
      .object({
        provider: z.string().min(1).max(128),
        model: z.string().min(1).max(256),
      })
      .strict(),
  })
  .strict()
  .superRefine((proposal, context) => {
    if (proposal.changes.length + proposal.deferred.length > 90) {
      context.addIssue({
        code: "custom",
        message:
          "AI instrumentation changes and deferrals must total at most 90 operations",
        path: ["changes"],
      });
    }
    const ids = proposal.changes.map((change) => change.id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        message: "AI instrumentation change IDs must be unique",
        path: ["changes"],
      });
    }
    const paths = proposal.changes.map((change) => change.path);
    if (new Set(paths).size !== paths.length) {
      context.addIssue({
        code: "custom",
        message: "AI instrumentation may change each path only once",
        path: ["changes"],
      });
    }
  });

export type TrackingItemReference = z.infer<typeof trackingItemReferenceSchema>;
export type AiInstrumentationChange = z.infer<
  typeof aiInstrumentationChangeSchema
>;
export type DeferredTrackingItem = z.infer<typeof deferredTrackingItemSchema>;
export type AiInstrumentationProposal = z.infer<
  typeof aiInstrumentationProposalSchema
>;
