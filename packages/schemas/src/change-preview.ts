import { z } from "zod";

import { relativePath, schemaVersion } from "./common.js";

export const previewItemSchema = z
  .object({
    operation_id: z.string().min(1).max(128),
    type: z.enum([
      "install_package",
      "edit_file",
      "create_file",
      "manual_step",
      "run_check",
    ]),
    summary: z.string().min(1).max(2_000),
    path: relativePath.nullable(),
    preview: z.string().max(500_000),
    requires_approval: z.boolean(),
    contains_repository_source: z.boolean(),
  })
  .strict();

export const changePreviewSchema = z
  .object({
    schema_version: schemaVersion,
    plan_id: z.string().min(8).max(128),
    items: z.array(previewItemSchema).max(100),
    summary: z
      .object({
        total: z.number().int().nonnegative(),
        mutations: z.number().int().nonnegative(),
        manual_steps: z.number().int().nonnegative(),
        checks: z.number().int().nonnegative(),
      })
      .strict(),
    warnings: z.array(z.string().min(1).max(1_000)).max(50),
  })
  .strict();

export type PreviewItem = z.infer<typeof previewItemSchema>;
export type ChangePreview = z.infer<typeof changePreviewSchema>;
