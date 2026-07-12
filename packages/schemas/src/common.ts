import { z } from "zod";

export const schemaVersion = z.literal("1");
export const sha256DigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
export const WIZARD_VERSION = "0.14.0";
export const isoDateTime = z.iso.datetime({ offset: true });
export const relativePath = z
  .string()
  .min(1)
  .max(2_000)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.includes("\\") &&
      !value.split("/").includes("..") &&
      !/^[a-z]:/iu.test(value),
    {
      message:
        "path must be a forward-slash repository-relative path and cannot traverse parents",
    },
  );

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
