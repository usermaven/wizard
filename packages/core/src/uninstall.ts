import { lstat, realpath } from "node:fs/promises";
import { join } from "node:path";

import {
  uninstallReportSchema,
  WIZARD_VERSION,
  type UninstallReport,
} from "@usermaven/wizard-schemas";

import { inspectProject } from "./inspector.js";

const GENERATED_FILE_CANDIDATES = [
  "app/usermaven-provider.tsx",
  "src/app/usermaven-provider.tsx",
  "lib/usermaven-client.ts",
  "src/lib/usermaven-client.ts",
  "src/usermaven.ts",
];

function removeCommand(packageManager: string): string {
  switch (packageManager) {
    case "pnpm":
      return "pnpm remove @usermaven/sdk-js";
    case "yarn":
      return "yarn remove @usermaven/sdk-js";
    case "bun":
      return "bun remove @usermaven/sdk-js";
    default:
      return "npm uninstall @usermaven/sdk-js";
  }
}

export interface PlanUninstallInput {
  projectRoot: string;
}

export interface PlanUninstallOptions {
  now?: () => Date;
}

/**
 * Produces a read-only removal checklist. It never modifies the repository;
 * removal itself stays a human action because generated files may have been
 * customized since they were applied.
 */
export async function planUninstall(
  input: PlanUninstallInput,
  options: PlanUninstallOptions = {},
): Promise<UninstallReport> {
  const root = await realpath(input.projectRoot);
  const inspection = await inspectProject(root);

  const sdkDeclared = inspection.analytics_dependencies.some(
    (dependency) => dependency.provider === "usermaven",
  );
  const generatedFiles: string[] = [];
  for (const candidate of GENERATED_FILE_CANDIDATES) {
    try {
      const item = await lstat(join(root, candidate));
      if (item.isFile() && !item.isSymbolicLink())
        generatedFiles.push(candidate);
    } catch {
      // absent candidates are simply not reported
    }
  }
  const instrumentationPaths = [
    ...new Set(
      inspection.instrumentation
        .filter((occurrence) => occurrence.provider === "usermaven")
        .map((occurrence) => occurrence.path),
    ),
  ].sort();

  const instructions: string[] = [];
  if (generatedFiles.length > 0) {
    instructions.push(
      `Delete the generated client file(s): ${generatedFiles.join(", ")}.`,
    );
  }
  for (const path of instrumentationPaths) {
    if (!generatedFiles.includes(path)) {
      instructions.push(
        `Remove Usermaven imports and calls from ${path} (review the diff before committing).`,
      );
    }
  }
  if (sdkDeclared) {
    instructions.push(
      `Uninstall the SDK: ${removeCommand(inspection.project.package_manager)}.`,
    );
  }
  instructions.push(
    "Remove the Usermaven environment variables from .env files and your hosting platform.",
    "Delete the private .usermaven/ state directory if you no longer need setup artifacts.",
  );
  if (!sdkDeclared && generatedFiles.length === 0) {
    instructions.unshift(
      "No Usermaven SDK dependency or generated files were detected; there may be nothing to remove.",
    );
  }

  return uninstallReportSchema.parse({
    schema_version: "1",
    sdk_dependency_declared: sdkDeclared,
    generated_files: generatedFiles,
    instrumentation_paths: instrumentationPaths,
    instructions,
    generated_at: (options.now ?? (() => new Date()))().toISOString(),
    wizard_version: WIZARD_VERSION,
  });
}
