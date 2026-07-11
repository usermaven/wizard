import { z } from "zod";

import {
  isoDateTime,
  piiClassificationSchema,
  relativePath,
  runtimeSchema,
  schemaVersion,
  statusSchema,
} from "./common.js";

export const proposalBasisSchema = z
  .object({
    confidence: z.number().min(0).max(1),
    rationale: z.array(z.string().min(1).max(1_000)).min(1).max(10),
    review_required: z.literal(true),
  })
  .strict();

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
    properties: z.array(propertyDefinitionSchema).max(100),
    status: statusSchema,
    proposal: proposalBasisSchema.optional(),
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
    properties: z.array(propertyDefinitionSchema).max(100),
    pii: piiClassificationSchema,
    authority: z.enum(["client", "server", "either"]),
    deduplication_key: z.string().min(1).max(128).nullable(),
    owner: z.string().min(1).max(256).nullable(),
    status: statusSchema,
    revenue: z.boolean().default(false),
    proposal: proposalBasisSchema.optional(),
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
    if (event.deduplication_key === null) {
      context.addIssue({
        code: "custom",
        message: "revenue events require a deduplication key",
        path: ["deduplication_key"],
      });
    }
  });

export const businessContextSchema = z
  .object({
    product_name: z.string().min(1).max(256),
    product_description: z.string().min(20).max(10_000),
    business_goals: z.array(z.string().min(1).max(1_000)).min(1).max(20),
    key_user_journeys: z.array(z.string().min(1).max(2_000)).min(1).max(50),
    revenue: z
      .object({
        enabled: z.boolean(),
        description: z.string().min(1).max(2_000),
        authoritative_source: z.string().min(1).max(1_000),
      })
      .strict()
      .optional(),
    data_policy: z.array(z.string().min(1).max(1_000)).max(30).default([]),
  })
  .strict();

export const aiTrackingProposalSchema = z
  .object({
    identity: z.array(identityItemSchema).max(20),
    events: z.array(eventCandidateSchema).min(1).max(75),
    shared_properties: z.array(propertyDefinitionSchema).max(100),
    assumptions: z.array(z.string().min(1).max(1_000)).max(50),
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
    for (const [index, identity] of proposal.identity.entries()) {
      if (identity.status !== "proposed" || !identity.proposal) {
        context.addIssue({
          code: "custom",
          message:
            "AI-generated identity items must be proposed with review rationale",
          path: ["identity", index],
        });
      }
    }
    for (const [index, event] of proposal.events.entries()) {
      if (event.status !== "proposed" || !event.proposal) {
        context.addIssue({
          code: "custom",
          message: "AI-generated events must be proposed with review rationale",
          path: ["events", index],
        });
      }
    }
    const eventNames = proposal.events.map((event) => event.event_name);
    if (new Set(eventNames).size !== eventNames.length) {
      context.addIssue({
        code: "custom",
        message: "AI-generated event names must be unique",
        path: ["events"],
      });
    }
    const eventIds = proposal.events.map((event) => event.id);
    if (new Set(eventIds).size !== eventIds.length) {
      context.addIssue({
        code: "custom",
        message: "AI-generated event IDs must be unique",
        path: ["events"],
      });
    }
    const identityKeys = proposal.identity.map(
      (identity) => `${identity.kind}:${identity.identifier}`,
    );
    if (new Set(identityKeys).size !== identityKeys.length) {
      context.addIssue({
        code: "custom",
        message: "AI-generated identity definitions must be unique",
        path: ["identity"],
      });
    }
    const sharedPropertyNames = proposal.shared_properties.map(
      (property) => property.name,
    );
    if (new Set(sharedPropertyNames).size !== sharedPropertyNames.length) {
      context.addIssue({
        code: "custom",
        message: "AI-generated shared property names must be unique",
        path: ["shared_properties"],
      });
    }
    for (const [index, event] of proposal.events.entries()) {
      const names = event.properties.map((property) => property.name);
      if (new Set(names).size !== names.length) {
        context.addIssue({
          code: "custom",
          message: "AI-generated event property names must be unique",
          path: ["events", index, "properties"],
        });
      }
    }
  });

export const trackingPlanSchema = z
  .object({
    schema_version: schemaVersion,
    plan_id: z.string().min(8).max(128),
    identity: z.array(identityItemSchema).max(20),
    events: z.array(eventCandidateSchema).max(100),
    shared_properties: z.array(propertyDefinitionSchema).max(100),
    proposal: z
      .object({
        mode: z.enum(["ai_generated", "deterministic_baseline"]),
        review_required: z.literal(true),
        generated_by: z
          .object({
            provider: z.string().min(1).max(128),
            model: z.string().min(1).max(256),
            prompt_version: z.string().min(1).max(64),
          })
          .strict()
          .optional(),
        business_context_digest: z
          .string()
          .regex(/^sha256:[a-f0-9]{64}$/u)
          .optional(),
        assumptions: z.array(z.string().min(1).max(1_000)).max(50),
        warnings: z.array(z.string().min(1).max(1_000)).max(50),
        source: z
          .object({
            framework: z.string().min(1).max(128),
            inspected_at: isoDateTime,
            inspection_truncated: z.boolean(),
          })
          .strict(),
      })
      .strict()
      .superRefine((proposal, context) => {
        if (
          proposal.mode === "ai_generated" &&
          (!proposal.generated_by || !proposal.business_context_digest)
        ) {
          context.addIssue({
            code: "custom",
            message:
              "AI-generated plans require model provenance and a business-context digest",
          });
        }
      })
      .optional(),
    created_at: isoDateTime,
    wizard_version: z.string().min(1).max(64),
  })
  .strict();

export type PropertyDefinition = z.infer<typeof propertyDefinitionSchema>;
export type ProposalBasis = z.infer<typeof proposalBasisSchema>;
export type EventCandidate = z.infer<typeof eventCandidateSchema>;
export type BusinessContext = z.infer<typeof businessContextSchema>;
export type AiTrackingProposal = z.infer<typeof aiTrackingProposalSchema>;
export type TrackingPlan = z.infer<typeof trackingPlanSchema>;
