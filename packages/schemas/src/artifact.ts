import { z } from "zod";

import { sha256DigestSchema } from "./common.js";
import { relativePath, schemaVersion } from "./common.js";

export const setupPlanArtifactReferenceSchema = z
  .object({
    schema_version: schemaVersion,
    artifact_kind: z.literal("setup_plan"),
    plan_id: z.string().min(8).max(128),
    plan_digest: sha256DigestSchema,
    artifact_path: relativePath,
    operation_count: z.number().int().nonnegative().max(100),
    risk_count: z.number().int().nonnegative().max(100),
  })
  .strict();

export const wizardToolErrorSchema = z
  .object({
    error: z
      .object({
        code: z.enum([
          "approval_required",
          "approval_expired",
          "approval_replayed",
          "approval_invalid",
          "artifact_not_found",
          "artifact_stale",
          "coverage_missing",
          "plan_mismatch",
          "stale_file_hash",
          "unsupported_framework",
          "validation_failed",
          "invalid_project_path",
          "operation_failed",
        ]),
        message: z.string().min(1).max(2_000),
        retryable: z.boolean(),
        details: z
          .record(
            z.string().max(128),
            z.union([
              z.string().max(2_000),
              z.number(),
              z.boolean(),
              z.array(z.string().max(256)).max(100),
            ]),
          )
          .default({}),
      })
      .strict(),
  })
  .strict();

export type SetupPlanArtifactReference = z.infer<
  typeof setupPlanArtifactReferenceSchema
>;
export type WizardToolError = z.infer<typeof wizardToolErrorSchema>;
