import { createHash, randomUUID } from "node:crypto";
import { lstat } from "node:fs/promises";
import { join } from "node:path";

import {
  setupPlanSchema,
  trackingPlanSchema,
  workspacePublicConfigSchema,
  type ProjectInspection,
  type SetupOperation,
  type SetupPlan,
  type TrackingPlan,
  type WorkspacePublicConfig,
} from "@usermaven/wizard-schemas";

import { inspectProject } from "./inspector.js";
const WIZARD_VERSION = "0.7.0";
const SDK_VERSION_RANGE = "^1.5.15";

function boundedId(prefix: string, value: string): string {
  const candidate = `${prefix}${value}`;
  if (candidate.length <= 128) return candidate;
  const suffix = createHash("sha256").update(value).digest("hex").slice(0, 12);
  return `${candidate.slice(0, 115)}-${suffix}`;
}

export interface GenerateSetupPlanInput {
  projectRoot: string;
  workspace: WorkspacePublicConfig;
  trackingPlan: TrackingPlan;
}

export interface GenerateSetupPlanOptions {
  now?: () => Date;
  idFactory?: () => string;
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
  const trackingPlan = trackingPlanSchema.parse(input.trackingPlan);
  if (trackingPlan.proposal?.mode !== "ai_generated") {
    throw new Error("Setup generation requires an AI-generated tracking plan");
  }
  if (trackingPlan.proposal.source.framework !== inspection.project.framework) {
    throw new Error(
      "Tracking plan framework does not match the inspected setup project",
    );
  }
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
      instructions: `The target already exists and will not be overwritten. Merge a singleton usermavenClient configuration using ${workspace.key_env_var} and ${workspace.tracking_host_env_var}, then rerun planning.`,
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

  operations.push({
    id: "configure-public-environment",
    type: "manual_step",
    summary: "Configure the selected workspace public environment values",
    instructions: `Set ${workspace.key_env_var} to the selected workspace public key and ${workspace.tracking_host_env_var} to ${workspace.tracking_host}. Do not commit populated environment files.`,
    requires_approval: false,
  });

  for (const identity of trackingPlan.identity) {
    operations.push({
      id: `wire-${identity.kind}-identity-${operations.length + 1}`,
      type: "manual_step",
      summary: `Wire reviewed ${identity.kind} identity`,
      instructions: `At the reviewed trigger (${identity.trigger.description}), identify by ${identity.identifier} and include only these approved properties: ${identity.properties.map((item) => item.name).join(", ") || "none"}. Runtime: ${identity.trigger.runtime}.`,
      requires_approval: false,
    });
  }
  for (const event of trackingPlan.events) {
    operations.push({
      id: boundedId("wire-event-", event.id),
      type: "manual_step",
      summary: `Wire reviewed ${event.event_name} event`,
      instructions: `Track ${event.event_name} when ${event.trigger.description}. Include only these approved properties: ${event.properties.map((item) => item.name).join(", ") || "none"}. Runtime: ${event.trigger.runtime}; authority: ${event.authority}${event.revenue ? "; authoritative revenue confirmation is required" : ""}.`,
      requires_approval: false,
    });
  }

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
    tracking_plan: trackingPlan,
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
      ...trackingPlan.identity.map((identity, index) => ({
        id: `identity-runtime-${index + 1}`,
        layer: "runtime" as const,
        description: `Reviewed ${identity.kind} identity executes at its approved trigger`,
        required: true,
      })),
      ...trackingPlan.events.map((event) => ({
        id: boundedId("event-runtime-", event.id),
        layer: "runtime" as const,
        description: `${event.event_name} executes once at its approved trigger`,
        required: true,
      })),
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
