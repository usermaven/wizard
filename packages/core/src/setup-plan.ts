import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";

import {
  aiInstrumentationProposalSchema,
  setupPlanSchema,
  trackingPlanSchema,
  workspacePublicConfigSchema,
  WIZARD_VERSION,
  type AiInstrumentationChange,
  type AiInstrumentationProposal,
  type ProjectInspection,
  type SetupOperation,
  type SetupPlan,
  type TrackingPlan,
  type WorkspacePublicConfig,
} from "@usermaven/wizard-schemas";
import { createTwoFilesPatch } from "diff";

import { inspectProject } from "./inspector.js";
import { validateSingleFileUnifiedDiff } from "./diff-validation.js";

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
  instrumentationProposal?: AiInstrumentationProposal;
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
  validateSingleFileUnifiedDiff(diff, expectedPath);
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

function usesSrcDirectory(inspection: ProjectInspection): boolean {
  return inspection.evidence.some(
    (item) =>
      item.kind === "directory" &&
      (item.path === "src/app" || item.path === "src/pages"),
  );
}

function integrationTarget(inspection: ProjectInspection): string {
  const framework = inspection.project.framework;
  const prefix = usesSrcDirectory(inspection) ? "src/" : "";
  switch (framework) {
    case "next-app-router":
      return `${prefix}app/usermaven-provider.tsx`;
    case "next-pages-router":
      return `${prefix}lib/usermaven-client.ts`;
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
      autoPageview: true,
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
${framework === "next-app-router" ? "\nexport function UsermavenBootstrap() {\n  return null;\n}\n" : ""}
`;
}

function entryPoint(
  inspection: ProjectInspection,
  role: ProjectInspection["entry_points"][number]["role"],
) {
  return inspection.entry_points.find((entry) => entry.role === role);
}

function editOperation(
  id: string,
  summary: string,
  path: string,
  beforeHash: string,
  before: string,
  after: string,
): SetupOperation {
  return {
    id,
    type: "edit_file",
    summary,
    path,
    before_hash: beforeHash,
    unified_diff: createTwoFilesPatch(path, path, before, after, "", ""),
    requires_approval: true,
  };
}

async function deterministicWiringOperation(
  root: string,
  inspection: ProjectInspection,
): Promise<SetupOperation | null> {
  if (inspection.project.framework === "react-vite") {
    const entry = entryPoint(inspection, "client_entry");
    if (!entry)
      throw new Error("React/Vite setup requires a src/main entry file");
    const before = await readFile(join(root, entry.path), "utf8");
    if (/^\s*import\s+["']\.\/usermaven["']/mu.test(before)) return null;
    const after = `import "./usermaven";\n${before}`;
    return editOperation(
      "wire-usermaven-entry",
      "Initialize Usermaven from the React/Vite entry point",
      entry.path,
      entry.sha256,
      before,
      after,
    );
  }

  if (inspection.project.framework === "next-app-router") {
    const entry = entryPoint(inspection, "app_layout");
    if (!entry) throw new Error("Next.js App Router setup requires app/layout");
    const before = await readFile(join(root, entry.path), "utf8");
    if (before.includes("<UsermavenBootstrap")) return null;
    const body = /<body(?:\s[^>]*)?>/u.exec(before);
    if (!body)
      throw new Error("Next.js root layout must contain a body element");
    const withImport = `import { UsermavenBootstrap } from "./usermaven-provider";\n${before}`;
    const bodyEnd =
      body.index + body[0].length + (withImport.length - before.length);
    const after = `${withImport.slice(0, bodyEnd)}<UsermavenBootstrap />${withImport.slice(bodyEnd)}`;
    return editOperation(
      "wire-usermaven-layout",
      "Mount Usermaven from the Next.js root layout",
      entry.path,
      entry.sha256,
      before,
      after,
    );
  }

  const prefix = usesSrcDirectory(inspection) ? "src/" : "";
  const entry = entryPoint(inspection, "pages_app");
  if (!entry) {
    return {
      id: "wire-usermaven-pages-app",
      type: "create_file",
      summary: "Create the Next.js Pages Router application entry",
      path: `${prefix}pages/_app.tsx`,
      content: `import "../lib/usermaven-client";

import type { AppProps } from "next/app";

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
`,
      requires_approval: true,
    };
  }
  const before = await readFile(join(root, entry.path), "utf8");
  if (before.includes('"../lib/usermaven-client"')) return null;
  const after = `import "../lib/usermaven-client";\n${before}`;
  return editOperation(
    "wire-usermaven-pages-app",
    "Initialize Usermaven from the Next.js Pages Router application entry",
    entry.path,
    entry.sha256,
    before,
    after,
  );
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
  if (
    !["next-app-router", "next-pages-router", "react-vite"].includes(
      inspection.project.framework,
    )
  ) {
    throw new Error(
      `Unsupported framework for browser setup: ${
        inspection.unsupported_frameworks.length > 0
          ? inspection.unsupported_frameworks.join(", ")
          : inspection.project.framework
      }`,
    );
  }
  const trackingPlan = trackingPlanSchema.parse(input.trackingPlan);
  const proposal = trackingPlan.proposal;
  const planMode = proposal?.mode;
  if (
    !proposal ||
    (planMode !== "ai_generated" && planMode !== "deterministic_baseline")
  ) {
    throw new Error(
      "Setup generation requires an AI-generated or deterministic baseline tracking plan",
    );
  }
  if (proposal.source.framework !== inspection.project.framework) {
    throw new Error(
      "Tracking plan framework does not match the inspected setup project",
    );
  }
  if (planMode === "deterministic_baseline") {
    if (input.instrumentationProposal !== undefined) {
      throw new Error(
        "Baseline tracking plans do not accept an AI instrumentation proposal",
      );
    }
    if (trackingPlan.identity.length > 0 || trackingPlan.events.length > 0) {
      throw new Error(
        "Baseline tracking plans cannot contain tracking items; use an AI-generated plan with instrumentation",
      );
    }
  }
  if (
    planMode === "ai_generated" &&
    input.instrumentationProposal === undefined
  ) {
    throw new Error(
      "AI-generated tracking plans require an AI instrumentation proposal",
    );
  }
  const instrumentation =
    input.instrumentationProposal === undefined
      ? null
      : aiInstrumentationProposalSchema.parse(input.instrumentationProposal);
  if (instrumentation) {
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
        throw new Error(
          "AI instrumentation defers the same item more than once",
        );
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
  }
  const root = await realpath(input.projectRoot);
  if (instrumentation) {
    await Promise.all(
      instrumentation.changes.map((change) =>
        validateInstrumentationChange(root, change),
      ),
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
  const target = integrationTarget(inspection);

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

  const wiring = await deterministicWiringOperation(root, inspection);
  if (wiring) operations.push(wiring);

  operations.push({
    id: "configure-public-environment",
    type: "manual_step",
    summary: "Configure the selected workspace public environment values",
    instructions: `Set ${workspace.key_env_var} to the selected workspace public key and ${workspace.tracking_host_env_var} to ${workspace.tracking_host}. Safe .env.example placeholders are ${workspace.key_env_var}= and ${workspace.tracking_host_env_var}=${workspace.tracking_host}. Do not commit populated environment files.`,
    requires_approval: false,
  });

  const generatedMutationPaths = new Set(
    operations.flatMap((operation) =>
      operation.type === "create_file" || operation.type === "edit_file"
        ? [operation.path]
        : [],
    ),
  );
  for (const change of instrumentation?.changes ?? []) {
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
  for (const deferred of instrumentation?.deferred ?? []) {
    const key = trackingItemKey(deferred.item);
    operations.push({
      id: boundedId("deferred-", key),
      type: "manual_step",
      summary: `Complete deferred instrumentation for ${key}`,
      instructions: deferred.reason,
      requires_approval: false,
    });
  }

  const command = inspection.available_scripts.includes("build")
    ? buildCommand(inspection.project.package_manager)
    : null;
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
  if (instrumentation) {
    risks.push(...instrumentation.warnings);
    if (instrumentation.deferred.length > 0) {
      risks.push(
        `${instrumentation.deferred.length} tracking-plan item(s) remain explicitly deferred and require manual implementation.`,
      );
    }
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
    ...(instrumentation
      ? {
          instrumentation: {
            generated_by: instrumentation.generated_by,
            coverage: instrumentation.changes.map((change) => ({
              operation_id: boundedId("instrument-", change.id),
              items: change.covers,
            })),
            deferred: instrumentation.deferred,
            warnings: instrumentation.warnings,
          },
        }
      : {}),
    checks: [
      {
        id: "sdk-declared",
        layer: "static",
        description: "The approved Usermaven SDK dependency is declared",
        required: true,
      },
      {
        id: "sdk-installed",
        layer: "static",
        description: "The approved Usermaven SDK is installed locally",
        required: true,
      },
      {
        id: "public-config-references",
        layer: "static",
        description:
          "Generated source references the selected public configuration",
        required: true,
      },
      {
        id: "runtime-observation",
        layer: "runtime",
        description: "Every reviewed runtime tracking signal is observed",
        required: true,
      },
      {
        id: "collector-transport",
        layer: "transport",
        description: "The configured collector accepts every reviewed event",
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
