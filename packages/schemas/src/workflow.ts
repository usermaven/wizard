import { z } from "zod";

import { isoDateTime, relativePath, schemaVersion } from "./common.js";
import { sha256DigestSchema } from "./apply.js";

export const workflowStepSchema = z.enum([
  "inspection_completed",
  "tracking_plan_created",
  "setup_plan_created",
  "preview_completed",
  "approval_created",
  "apply_completed",
  "verification_prepared",
  "verification_completed",
]);

export const workflowArtifactKindSchema = z.enum([
  "tracking_plan",
  "setup_plan",
  "approval",
  "apply_result",
  "verification_session",
  "verification_result",
]);

export const workflowArtifactReferenceSchema = z
  .object({
    path: relativePath,
    digest: sha256DigestSchema,
  })
  .strict();

export const wizardCheckpointSchema = z
  .object({
    schema_version: schemaVersion,
    workflow_id: z.string().regex(/^workflow_[a-zA-Z0-9-]{8,120}$/u),
    repository_root_fingerprint: sha256DigestSchema,
    last_completed_step: workflowStepSchema,
    artifacts: z
      .object({
        tracking_plan: workflowArtifactReferenceSchema.optional(),
        setup_plan: workflowArtifactReferenceSchema.optional(),
        approval: workflowArtifactReferenceSchema.optional(),
        apply_result: workflowArtifactReferenceSchema.optional(),
        verification_session: workflowArtifactReferenceSchema.optional(),
        verification_result: workflowArtifactReferenceSchema.optional(),
      })
      .strict(),
    created_at: isoDateTime,
    updated_at: isoDateTime,
  })
  .strict()
  .superRefine((checkpoint, context) => {
    if (Date.parse(checkpoint.updated_at) < Date.parse(checkpoint.created_at)) {
      context.addIssue({
        code: "custom",
        message: "updated_at cannot be before created_at",
        path: ["updated_at"],
      });
    }
  });

export const workflowNextActionSchema = z.enum([
  "generate_tracking_plan",
  "generate_setup_plan",
  "preview_changes",
  "request_approval",
  "apply_changes",
  "inspect_apply_state",
  "prepare_verification",
  "collect_verification_evidence",
  "remediate_setup",
  "complete",
]);

export const workflowResumeResultSchema = z
  .object({
    schema_version: schemaVersion,
    workflow_id: z.string().min(8).max(128),
    repository_root_fingerprint: sha256DigestSchema,
    checkpoint_status: z.enum([
      "ready",
      "expired",
      "stale",
      "interrupted",
      "complete",
    ]),
    last_completed_step: workflowStepSchema,
    next_action: workflowNextActionSchema,
    reason: z.string().min(1).max(2_000),
    suggested_command: z.string().min(1).max(5_000).nullable(),
    reusable_artifacts: z.array(workflowArtifactKindSchema).max(6),
    invalid_artifacts: z.array(workflowArtifactKindSchema).max(6),
    warnings: z.array(z.string().min(1).max(1_000)).max(20),
    checked_at: isoDateTime,
  })
  .strict();

export type WorkflowStep = z.infer<typeof workflowStepSchema>;
export type WorkflowArtifactKind = z.infer<typeof workflowArtifactKindSchema>;
export type WizardCheckpoint = z.infer<typeof wizardCheckpointSchema>;
export type WorkflowResumeResult = z.infer<typeof workflowResumeResultSchema>;
