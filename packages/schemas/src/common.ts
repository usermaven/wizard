import { z } from "zod";

export const schemaVersion = z.literal("1");
export const isoDateTime = z.iso.datetime({ offset: true });
export const relativePath = z
  .string()
  .min(1)
  .max(2_000)
  .refine((value) => !value.startsWith("/") && !value.includes(".."), {
    message: "path must be repository-relative and cannot traverse parents",
  });

export const piiClassificationSchema = z.enum([
  "none",
  "quasi_identifier",
  "direct_identifier",
  "sensitive",
]);

export const runtimeSchema = z.enum(["client", "server", "both"]);
export const statusSchema = z.enum([
  "proposed",
  "approved",
  "implemented",
  "verified",
]);

export const safeValueSchema = z.union([
  z.string().max(2_000),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const checkOutcomeSchema = z.enum(["pass", "warn", "fail"]);
