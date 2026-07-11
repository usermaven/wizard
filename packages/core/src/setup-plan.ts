import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";

import {
  aiInstrumentationProposalSchema,
  setupPlanSchema,
  trackingPlanSchema,
  workspacePublicConfigSchema,
  type AiInstrumentationChange,
  type AiInstrumentationProposal,
  type ProjectInspection,
  type SetupOperation,
  type SetupPlan,
  type TrackingPlan,
  type WorkspacePublicConfig,
} from "@usermaven/wizard-schemas";

import { inspectProject } from "./inspector.js";

const WIZARD_VERSION = "0.10.0";
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
  instrumentationProposal: AiInstrumentationProposal;
}

function trackingItemKey(item: {
  kind: "identity" | "event";
  identity_kind?: "user" | "company";
  identifier?: string;
  event_id?: string;
}): string {
  return item.kind === "identity"
    ? `identity:${item.identity_kind}:${item.identifier}`
    : `event:${item.event_id}`;
}

function isWithinRoot(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

function rejectSensitivePath(path: string): void {
  const segments = path.split("/").map((segment) => segment.toLowerCase());
  const name = basename(path).toLowerCase();
  if (
    segments.some((segment) =>
      [".git", ".usermaven", "node_modules"].includes(segment),
    ) ||
    /^\.env(?:\.|$)/u.test(name) ||
    /^(?:id_rsa|id_ed25519|credentials|secrets?\.json)$/u.test(name) ||
    [
      ".npmrc",
      "package.json",
      "package-lock.json",
      "pnpm-lock.yaml",
      "yarn.lock",
      "bun.lock",
      "bun.lockb",
    ].includes(name)
  ) {
    throw new Error("AI instrumentation targets a protected local path");
  }
}

function validateUnifiedDiffPath(diff: string, expectedPath: string): void {
  if (
    /^(?:diff --git|rename (?:from|to)|copy (?:from|to)|GIT binary patch)/mu.test(
      diff,
    )
  ) {
    throw new Error("AI instrumentation must use a single-file textual diff");
  }
  const paths = [...diff.matchAll(/^(?:---|\+\+\+)\s+([^\t\n]+)/gmu)].map(
    (match) => match[1],
  );
  const accepted = new Set([
    expectedPath,
    `a/${expectedPath}`,
    `b/${expectedPath}`,
  ]);
  if (
    paths.length !== 2 ||
    paths.some((path) => path !== "/dev/null" && !accepted.has(path!))
  ) {
    throw new Error("AI instrumentation diff path does not match its target");
  }
}

async function validateInstrumentationChange(
  root: string,
  change: AiInstrumentationChange,
): Promise<void> {
  rejectSensitivePath(change.path);
  const target = resolve(root, change.path);
  if (!isWithinRoot(root, target)) {
    throw new Error("AI instrumentation path escapes the project root");
  }
  let current = root;
  for (const segment of change.path.split("/").slice(0, -1)) {
    current = join(current, segment);
    try {
      const item = await lstat(current);
      if (item.isSymbolicLink() || !item.isDirectory()) {
        throw new Error("AI instrumentation path has an unsafe parent");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
      throw error;
    }
  }

  if (change.type === "create_file") {
    try {
      await lstat(target);
      throw new Error("AI instrumentation create target already exists");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return;
  }

  const item = await lstat(target);
  if (item.isSymbolicLink() || !item.isFile() || item.size > 5_000_000) {
    throw new Error(
      "AI instrumentation edit target is not a safe regular file",
    );
  }
  const content = await readFile(target);
  const hash = `sha256:${createHash("sha256").update(content).digest("hex")}`;
  if (hash !== change.before_hash) {
    throw new Error("AI instrumentation edit hash is stale");
  }
  validateUnifiedDiffPath(change.unified_diff, change.path);
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

export function usermavenVerificationProperties() {
  const value = (globalThis as Record<string, unknown>)[
    "__USERMAVEN_VERIFICATION_ID__"
  ];
  return typeof value === "string"
    ? { _usermaven_verification_id: value }
    : {};
}
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
  const instrumentation = aiInstrumentationProposalSchema.parse(
    input.instrumentationProposal,
  );
  if (instrumentation.tracking_plan_id !== trackingPlan.plan_id) {
    throw new Error(
      "AI instrumentation proposal does not match the tracking plan",
    );
  }
  const requiredItems = new Set([
    ...trackingPlan.identity.map((identity) =>
      trackingItemKey({
        kind: "identity",
        identity_kind: identity.kind,
        identifier: identity.identifier,
      }),
    ),
    ...trackingPlan.events.map((event) =>
      trackingItemKey({ kind: "event", event_id: event.id }),
    ),
  ]);
  const coveredItems = new Set<string>();
  for (const change of instrumentation.changes) {
    for (const item of change.covers) {
      const key = trackingItemKey(item);
      if (!requiredItems.has(key)) {
        throw new Error(
          "AI instrumentation covers an unknown tracking-plan item",
        );
      }
      coveredItems.add(key);
    }
  }
  const deferredItems = new Set<string>();
  for (const deferred of instrumentation.deferred) {
    const key = trackingItemKey(deferred.item);
    if (!requiredItems.has(key)) {
      throw new Error(
        "AI instrumentation defers an unknown tracking-plan item",
      );
    }
    if (deferredItems.has(key)) {
      throw new Error("AI instrumentation defers the same item more than once");
    }
    if (coveredItems.has(key)) {
      throw new Error(
        "AI instrumentation cannot both implement and defer an item",
      );
    }
    deferredItems.add(key);
  }
  const missingItems = [...requiredItems].filter(
    (item) => !coveredItems.has(item) && !deferredItems.has(item),
  );
  if (missingItems.length > 0) {
    throw new Error(
      "AI instrumentation must implement or explicitly defer every tracking-plan item",
    );
  }
  const root = await realpath(input.projectRoot);
  await Promise.all(
    instrumentation.changes.map((change) =>
      validateInstrumentationChange(root, change),
    ),
  );
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

  const generatedMutationPaths = new Set(
    operations.flatMap((operation) =>
      operation.type === "create_file" || operation.type === "edit_file"
        ? [operation.path]
        : [],
    ),
  );
  for (const change of instrumentation.changes) {
    if (generatedMutationPaths.has(change.path)) {
      throw new Error(
        "AI instrumentation conflicts with a generated setup operation",
      );
    }
    if (change.type === "edit_file") {
      operations.push({
        id: boundedId("instrument-", change.id),
        type: "edit_file",
        summary: change.summary,
        path: change.path,
        before_hash: change.before_hash,
        unified_diff: change.unified_diff,
        requires_approval: true,
      });
    } else {
      operations.push({
        id: boundedId("instrument-", change.id),
        type: "create_file",
        summary: change.summary,
        path: change.path,
        content: change.content,
        requires_approval: true,
      });
    }
  }
  for (const deferred of instrumentation.deferred) {
    const key = trackingItemKey(deferred.item);
    operations.push({
      id: boundedId("deferred-", key),
      type: "manual_step",
      summary: `Complete deferred instrumentation for ${key}`,
      instructions: deferred.reason,
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
  risks.push(...instrumentation.warnings);
  if (instrumentation.deferred.length > 0) {
    risks.push(
      `${instrumentation.deferred.length} tracking-plan item(s) remain explicitly deferred and require manual implementation.`,
    );
  }
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
    instrumentation: {
      generated_by: instrumentation.generated_by,
      coverage: instrumentation.changes.map((change) => ({
        operation_id: boundedId("instrument-", change.id),
        items: change.covers,
      })),
      deferred: instrumentation.deferred,
      warnings: instrumentation.warnings,
    },
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
