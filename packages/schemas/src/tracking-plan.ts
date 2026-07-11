import { z } from "zod";

import {
  isoDateTime,
  piiClassificationSchema,
  relativePath,
  runtimeSchema,
  schemaVersion,
  statusSchema,
} from "./common.js";

export const propertyDefinitionSchema = z
  .object({
    name: z.string().min(1).max(128),
    description: z.string().min(1).max(1_000),
    data_type: z.enum([
      "string",
      "number",
      "boolean",
      "datetime",
      "array",
      "object",
    ]),
    required: z.boolean(),
    example: z
      .union([z.string(), z.number(), z.boolean(), z.null()])
      .optional(),
    pii: piiClassificationSchema,
  })
  .strict();

export const triggerSchema = z
  .object({
    description: z.string().min(1).max(2_000),
    runtime: runtimeSchema,
    file: relativePath.optional(),
    symbol: z.string().min(1).max(256).optional(),
  })
  .strict();

export const identityItemSchema = z
  .object({
    kind: z.enum(["user", "company"]),
    identifier: z.string().min(1).max(128),
    trigger: triggerSchema,
    properties: z.array(propertyDefinitionSchema),
    status: statusSchema,
  })
  .strict();

export const eventCandidateSchema = z
  .object({
    id: z.string().min(1).max(128),
    event_name: z.string().min(1).max(128),
    description: z.string().min(1).max(2_000),
    business_question: z.string().min(1).max(2_000),
    category: z.enum([
      "acquisition",
      "activation",
      "engagement",
      "collaboration",
      "monetization",
      "reliability",
    ]),
    trigger: triggerSchema,
    properties: z.array(propertyDefinitionSchema),
    pii: piiClassificationSchema,
    authority: z.enum(["client", "server", "either"]),
    deduplication_key: z.string().min(1).max(128).nullable(),
    owner: z.string().min(1).max(256).nullable(),
    status: statusSchema,
    revenue: z.boolean().default(false),
  })
  .strict()
  .superRefine((event, context) => {
    if (!event.revenue) return;
    const propertyNames = new Set(
      event.properties.map((property) => property.name),
    );
    for (const required of ["amount", "currency", "transaction_id"]) {
      if (!propertyNames.has(required)) {
        context.addIssue({
          code: "custom",
          message: `revenue events require the ${required} property`,
          path: ["properties"],
        });
      }
    }
    if (event.authority === "client") {
      context.addIssue({
        code: "custom",
        message: "authoritative revenue events cannot be client-only",
        path: ["authority"],
      });
    }
  });

export const trackingPlanSchema = z
  .object({
    schema_version: schemaVersion,
    plan_id: z.string().min(8).max(128),
    identity: z.array(identityItemSchema),
    events: z.array(eventCandidateSchema),
    shared_properties: z.array(propertyDefinitionSchema),
    created_at: isoDateTime,
    wizard_version: z.string().min(1).max(64),
  })
  .strict();

export type PropertyDefinition = z.infer<typeof propertyDefinitionSchema>;
export type EventCandidate = z.infer<typeof eventCandidateSchema>;
export type TrackingPlan = z.infer<typeof trackingPlanSchema>;
