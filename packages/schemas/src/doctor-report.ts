import { z } from "zod";

import { isoDateTime, schemaVersion } from "./common.js";

export const doctorCheckStatusSchema = z.enum(["ok", "warn", "fail"]);

export const doctorCheckSchema = z
  .object({
    id: z.string().min(1).max(128),
    status: doctorCheckStatusSchema,
    detail: z.string().min(1).max(2_000),
  })
  .strict();

export const doctorReportSchema = z
  .object({
    schema_version: schemaVersion,
    overall: doctorCheckStatusSchema,
    checks: z.array(doctorCheckSchema).min(1).max(50),
    generated_at: isoDateTime,
    wizard_version: z.string().min(1).max(64),
  })
  .strict();

export type DoctorCheckStatus = z.infer<typeof doctorCheckStatusSchema>;
export type DoctorCheck = z.infer<typeof doctorCheckSchema>;
export type DoctorReport = z.infer<typeof doctorReportSchema>;
