import { z } from "zod";

import { isoDateTime, relativePath, schemaVersion } from "./common.js";

export const uninstallReportSchema = z
  .object({
    schema_version: schemaVersion,
    sdk_dependency_declared: z.boolean(),
    generated_files: z.array(relativePath).max(50),
    instrumentation_paths: z.array(relativePath).max(200),
    instructions: z.array(z.string().min(1).max(2_000)).min(1).max(50),
    generated_at: isoDateTime,
    wizard_version: z.string().min(1).max(64),
  })
  .strict();

export type UninstallReport = z.infer<typeof uninstallReportSchema>;
