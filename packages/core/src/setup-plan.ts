import { randomUUID } from "node:crypto";
import { lstat } from "node:fs/promises";
import { join } from "node:path";

import {
  setupPlanSchema,
  workspacePublicConfigSchema,
  type ProjectInspection,
  type SetupOperation,
  type SetupPlan,
  type WorkspacePublicConfig,
} from "@usermaven/wizard-schemas";

import { inspectProject } from "./inspector.js";
import { proposeTrackingPlan } from "./tracking-plan.js";

const WIZARD_VERSION = "0.5.0";
const SDK_VERSION_RANGE = "^1.5.15";

export interface GenerateSetupPlanInput {
  projectRoot: string;
  workspace: WorkspacePublicConfig;
}

export interface GenerateSetupPlanOptions {
  now?: () => Date;
  idFactory?: () => string;
  trackingPlanIdFactory?: () => string;
}

function environmentDefaults(
  framework: ProjectInspection["project"]["framework"],
) {
  if (framework === "react-vite") {
    return {
      key: "VITE_USERMAVEN_KEY",
      host: "VITE_USERMAVEN_TRACKING_HOST",
    };
  }
  if (framework === "next-app-router" || framework === "next-pages-router") {
    return {
      key: "NEXT_PUBLIC_USERMAVEN_KEY",
      host: "NEXT_PUBLIC_USERMAVEN_TRACKING_HOST",
    };
  }
  return { key: "USERMAVEN_PUBLIC_KEY", host: "USERMAVEN_TRACKING_HOST" };
}

function integrationTarget(
  framework: ProjectInspection["project"]["framework"],
): string {
  switch (framework) {
    case "next-app-router":
      return "app/usermaven-client.ts";
    case "next-pages-router":
      return "lib/usermaven-client.ts";
    default:
      return "src/usermaven.ts";
  }
}

function environmentExpression(
  framework: ProjectInspection["project"]["framework"],
  name: string,
) {
  return framework === "react-vite"
    ? `import.meta.env.${name}`
    : `process.env.${name}`;
}

function generatedClient(
  framework: ProjectInspection["project"]["framework"],
  workspace: WorkspacePublicConfig,
): string {
  const key = environmentExpression(framework, workspace.key_env_var!);
  const host = environmentExpression(
    framework,
    workspace.tracking_host_env_var!,
  );
  const clientDirective =
    framework === "next-app-router" || framework === "next-pages-router"
      ? '"use client";\n\n'
      : "";
  return `${clientDirective}import { usermavenClient } from "@usermaven/sdk-js";

const key = ${key};
const trackingHost = ${host} ?? ${JSON.stringify(workspace.tracking_host)};

export const usermaven = key
  ? usermavenClient({
      key,
      trackingHost,
      autocapture: false,
      autoPageview: false,
    })
  : null;
`;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

function buildCommand(
  packageManager: ProjectInspection["project"]["package_manager"],
): string | null {
  switch (packageManager) {
    case "npm":
      return "npm run build";
    case "pnpm":
      return "pnpm build";
    case "yarn":
      return "yarn build";
    case "bun":
      return "bun run build";
    default:
      return null;
  }
}

export async function generateSetupPlan(
  input: GenerateSetupPlanInput,
  options: GenerateSetupPlanOptions = {},
): Promise<SetupPlan> {
  const inspection = await inspectProject(input.projectRoot);
  const defaults = environmentDefaults(inspection.project.framework);
  const workspace = workspacePublicConfigSchema.parse({
    ...input.workspace,
    key_env_var: input.workspace.key_env_var ?? defaults.key,
    tracking_host_env_var:
      input.workspace.tracking_host_env_var ?? defaults.host,
  });
  const operations: SetupOperation[] = [];
  const hasSdk = inspection.analytics_dependencies.some(
    (dependency) => dependency.provider === "usermaven",
  );
  const hasInitialization = inspection.instrumentation.some(
    (occurrence) =>
      occurrence.provider === "usermaven" && occurrence.kind === "initialize",
  );
  const target = integrationTarget(inspection.project.framework);

  if (!hasSdk) {
    operations.push({
      id: "install-usermaven-sdk",
      type: "install_package",
      summary: "Install the Usermaven browser SDK",
      package_name: "@usermaven/sdk-js",
      version_range: SDK_VERSION_RANGE,
      dev: false,
      requires_approval: true,
    });
  }

  if (hasInitialization) {
    operations.push({
      id: "review-existing-initialization",
      type: "manual_step",
      summary: "Review the existing Usermaven initialization",
      instructions:
        "Confirm the existing client uses the selected workspace public key and tracking host, disables duplicate automatic page views, and initializes only once.",
      requires_approval: false,
    });
  } else if (await pathExists(join(input.projectRoot, target))) {
    operations.push({
      id: "review-existing-client-file",
      type: "manual_step",
      summary: `Review the existing ${target} file before changing it`,
      instructions: `The deterministic target already exists and will not be overwritten. Merge a singleton usermavenClient configuration using ${workspace.key_env_var} and ${workspace.tracking_host_env_var}, then rerun planning.`,
      requires_approval: false,
    });
  } else {
    operations.push({
      id: "create-usermaven-client",
      type: "create_file",
      summary: "Create a singleton Usermaven browser client",
      path: target,
      content: generatedClient(inspection.project.framework, workspace),
      requires_approval: true,
    });
  }

  operations.push(
    {
      id: "configure-public-environment",
      type: "manual_step",
      summary: "Configure the selected workspace public environment values",
      instructions: `Set ${workspace.key_env_var} to the selected workspace public key and ${workspace.tracking_host_env_var} to ${workspace.tracking_host}. Do not commit populated environment files.`,
      requires_approval: false,
    },
    {
      id: "wire-page-views",
      type: "manual_step",
      summary: "Wire reviewed page-view tracking",
      instructions:
        "Import the singleton client at the framework's client navigation boundary and call usermaven?.pageview() after the initial load and each completed route change. Exclude query strings and fragments unless explicitly approved.",
      requires_approval: false,
    },
    {
      id: "wire-user-identity",
      type: "manual_step",
      summary: "Wire reviewed authenticated user identity",
      instructions:
        "When a stable authenticated session becomes available, call usermaven?.id() with the internal user ID and only the approved identity properties. Reset identity on logout.",
      requires_approval: false,
    },
  );

  const command = buildCommand(inspection.project.package_manager);
  if (command) {
    operations.push({
      id: "run-project-build",
      type: "run_check",
      summary: "Build the project after approved changes",
      check_id: "project-build",
      command,
      requires_approval: true,
    });
  }

  const risks = [
    "The workspace public key value is intentionally absent and must be supplied through the named environment variable.",
    "Route and authentication integration points require human review before changes are applied.",
  ];
  if (inspection.scan.truncated) {
    risks.push(
      "Repository inspection was truncated, so existing setup code may have been missed.",
    );
  }
  if (inspection.project.framework === "unknown") {
    risks.push(
      "The framework is unknown; generated placement is a fallback and requires manual adaptation.",
    );
  }
  const otherProviders = [
    ...new Set(
      inspection.analytics_dependencies
        .map((dependency) => dependency.provider)
        .filter((provider) => provider !== "usermaven"),
    ),
  ].sort();
  if (otherProviders.length > 0) {
    risks.push(
      `Existing analytics providers require a coexistence decision: ${otherProviders.join(", ")}.`,
    );
  }

  const createdAt = (options.now ?? (() => new Date()))().toISOString();
  return setupPlanSchema.parse({
    schema_version: "1",
    plan_id: `setup_${(options.idFactory ?? randomUUID)()}`,
    workspace,
    project: inspection.project,
    operations,
    tracking_plan: proposeTrackingPlan(inspection, {
      now: () => new Date(createdAt),
      ...(options.trackingPlanIdFactory
        ? { idFactory: options.trackingPlanIdFactory }
        : {}),
    }),
    checks: [
      {
        id: "sdk-present",
        layer: "static",
        description: "The approved Usermaven SDK version is installed",
        required: true,
      },
      {
        id: "single-initialization",
        layer: "static",
        description: "Exactly one browser client is initialized",
        required: true,
      },
      {
        id: "page-view-runtime",
        layer: "runtime",
        description: "Initial and client-navigation page views execute once",
        required: true,
      },
      {
        id: "identity-runtime",
        layer: "runtime",
        description: "Reviewed identity executes for authenticated users",
        required: true,
      },
      {
        id: "collector-accepted",
        layer: "transport",
        description: "The configured collector accepts a sanitized test event",
        required: true,
      },
      {
        id: "workspace-receipt",
        layer: "workspace_receipt",
        description: "The selected workspace reports sanitized event metadata",
        required: true,
      },
    ],
    risks,
    created_at: createdAt,
    wizard_version: WIZARD_VERSION,
  });
}
