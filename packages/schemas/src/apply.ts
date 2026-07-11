import { z } from "zod";

import { isoDateTime, relativePath, schemaVersion } from "./common.js";

export const sha256DigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);

export const changeApprovalSchema = z
  .object({
    schema_version: schemaVersion,
    approval_id: z.string().regex(/^approval_[a-zA-Z0-9-]{8,120}$/u),
    plan_id: z.string().min(8).max(128),
    plan_digest: sha256DigestSchema,
    repository_root_fingerprint: sha256DigestSchema,
    operation_ids: z.array(z.string().min(1).max(128)).min(1).max(100),
    approved_by: z.literal("interactive_local_user"),
    confirmed_at: isoDateTime,
    expires_at: isoDateTime,
    signature: sha256DigestSchema,
  })
  .strict()
  .superRefine((approval, context) => {
    if (
      new Set(approval.operation_ids).size !== approval.operation_ids.length
    ) {
      context.addIssue({
        code: "custom",
        message: "operation_ids must be unique",
        path: ["operation_ids"],
      });
    }
    if (Date.parse(approval.expires_at) <= Date.parse(approval.confirmed_at)) {
      context.addIssue({
        code: "custom",
        message: "expires_at must be after confirmed_at",
        path: ["expires_at"],
      });
    }
  });

export const appliedOperationSchema = z
  .object({
    operation_id: z.string().min(1).max(128),
    type: z.enum([
      "install_package",
      "edit_file",
      "create_file",
      "manual_step",
      "run_check",
    ]),
    outcome: z.enum(["applied", "skipped", "failed", "rolled_back"]),
    summary: z.string().min(1).max(2_000),
  })
  .strict();

export const applyResultSchema = z
  .object({
    schema_version: schemaVersion,
    approval_id: z.string().min(8).max(128),
    plan_id: z.string().min(8).max(128),
    plan_digest: sha256DigestSchema,
    repository_root_fingerprint: sha256DigestSchema,
    outcome: z.enum(["succeeded", "rolled_back", "failed"]),
    operations: z.array(appliedOperationSchema).max(100),
    rollback: z
      .object({
        attempted: z.boolean(),
        succeeded: z.boolean(),
        warnings: z.array(z.string().min(1).max(1_000)).max(50),
      })
      .strict(),
    warnings: z.array(z.string().min(1).max(1_000)).max(50),
    state_record: relativePath,
    started_at: isoDateTime,
    completed_at: isoDateTime,
  })
  .strict();

export type ChangeApproval = z.infer<typeof changeApprovalSchema>;
export type ApplyResult = z.infer<typeof applyResultSchema>;
