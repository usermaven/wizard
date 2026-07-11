import { z } from "zod";

import { isoDateTime, relativePath, schemaVersion } from "./common.js";

export const frameworkSchema = z.enum([
  "next-app-router",
  "next-pages-router",
  "react-vite",
  "react",
  "node",
  "unknown",
]);

export const packageManagerSchema = z.enum([
  "npm",
  "pnpm",
  "yarn",
  "bun",
  "none",
]);

export const analyticsProviderSchema = z.enum([
  "usermaven",
  "amplitude",
  "posthog",
  "segment",
  "mixpanel",
  "google-analytics",
  "google-tag-manager",
]);

export const inspectionEvidenceSchema = z
  .object({
    kind: z.enum(["dependency", "directory", "file", "source_token"]),
    path: relativePath,
    detail: z.string().min(1).max(256),
  })
  .strict();

export const analyticsDependencySchema = z
  .object({
    provider: analyticsProviderSchema,
    package_name: z.string().min(1).max(214),
    version_range: z.string().min(1).max(128),
    dependency_type: z.enum(["production", "development"]),
  })
  .strict();

export const instrumentationOccurrenceSchema = z
  .object({
    provider: analyticsProviderSchema,
    kind: z.enum(["import", "initialize", "track", "identify", "script"]),
    path: relativePath,
    line: z.number().int().positive(),
    matched_token: z.string().min(1).max(128),
  })
  .strict();

export const entryPointSchema = z
  .object({
    path: relativePath,
    role: z.enum(["app_layout", "pages_app", "client_entry"]),
    sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  })
  .strict();

export const projectInspectionSchema = z
  .object({
    schema_version: schemaVersion,
    project: z
      .object({
        framework: frameworkSchema,
        package_manager: packageManagerSchema,
        confidence: z.number().min(0).max(1),
      })
      .strict(),
    evidence: z.array(inspectionEvidenceSchema).max(100),
    analytics_dependencies: z.array(analyticsDependencySchema).max(1_000),
    instrumentation: z.array(instrumentationOccurrenceSchema).max(10_000),
    entry_points: z.array(entryPointSchema).max(20).default([]),
    available_scripts: z.array(z.string().min(1).max(128)).max(100).default([]),
    scan: z
      .object({
        files_considered: z.number().int().nonnegative(),
        files_scanned: z.number().int().nonnegative(),
        bytes_scanned: z.number().int().nonnegative(),
        truncated: z.boolean(),
        skipped_symlinks: z.number().int().nonnegative(),
      })
      .strict(),
    warnings: z.array(z.string().min(1).max(1_000)).max(100),
    inspected_at: isoDateTime,
    wizard_version: z.string().min(1).max(64),
  })
  .strict();

export type Framework = z.infer<typeof frameworkSchema>;
export type AnalyticsProvider = z.infer<typeof analyticsProviderSchema>;
export type ProjectInspection = z.infer<typeof projectInspectionSchema>;
