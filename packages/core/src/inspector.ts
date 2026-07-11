import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";

import {
  projectInspectionSchema,
  type AnalyticsProvider,
  type Framework,
  type ProjectInspection,
} from "@usermaven/wizard-schemas";

const WIZARD_VERSION = "0.10.0";
const DEFAULT_MAX_FILES = 5_000;
const DEFAULT_MAX_FILE_BYTES = 1_000_000;
const DEFAULT_MAX_TOTAL_BYTES = 10_000_000;
const MAX_OCCURRENCES = 10_000;

const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".turbo",
  ".usermaven",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "vendor",
]);

const sourceExtensions = new Set([
  ".cjs",
  ".html",
  ".js",
  ".jsx",
  ".mjs",
  ".svelte",
  ".ts",
  ".tsx",
  ".vue",
]);

const analyticsPackages = new Map<string, AnalyticsProvider>([
  ["@usermaven/sdk-js", "usermaven"],
  ["@usermaven/pixel", "usermaven"],
  ["@amplitude/analytics-browser", "amplitude"],
  ["@amplitude/analytics-node", "amplitude"],
  ["amplitude-js", "amplitude"],
  ["posthog-js", "posthog"],
  ["posthog-node", "posthog"],
  ["@segment/analytics-next", "segment"],
  ["analytics-node", "segment"],
  ["mixpanel-browser", "mixpanel"],
  ["mixpanel", "mixpanel"],
  ["react-ga4", "google-analytics"],
]);

type OccurrenceKind = ProjectInspection["instrumentation"][number]["kind"];

interface TokenRule {
  provider: AnalyticsProvider;
  kind: OccurrenceKind;
  token: string;
  pattern: RegExp;
}

const tokenRules: TokenRule[] = [
  {
    provider: "usermaven",
    kind: "import",
    token: "@usermaven/sdk-js",
    pattern: /@usermaven\/sdk-js/g,
  },
  {
    provider: "usermaven",
    kind: "initialize",
    token: "usermaven.init",
    pattern: /\busermaven\s*\.\s*init\s*\(/g,
  },
  {
    provider: "usermaven",
    kind: "track",
    token: "usermaven.track",
    pattern: /\busermaven\s*\.\s*track\s*\(/g,
  },
  {
    provider: "usermaven",
    kind: "identify",
    token: "usermaven.id",
    pattern: /\busermaven\s*\.\s*(?:id|identify)\s*\(/g,
  },
  {
    provider: "amplitude",
    kind: "import",
    token: "@amplitude/analytics",
    pattern: /@amplitude\/analytics-(?:browser|node)/g,
  },
  {
    provider: "amplitude",
    kind: "initialize",
    token: "amplitude.init",
    pattern: /\bamplitude\s*\.\s*init\s*\(/g,
  },
  {
    provider: "amplitude",
    kind: "track",
    token: "amplitude.track",
    pattern: /\bamplitude\s*\.\s*track\s*\(/g,
  },
  {
    provider: "amplitude",
    kind: "identify",
    token: "amplitude.setUserId",
    pattern: /\bamplitude\s*\.\s*(?:identify|setUserId)\s*\(/g,
  },
  {
    provider: "posthog",
    kind: "import",
    token: "posthog-js",
    pattern: /\bposthog-js\b/g,
  },
  {
    provider: "posthog",
    kind: "initialize",
    token: "posthog.init",
    pattern: /\bposthog\s*\.\s*init\s*\(/g,
  },
  {
    provider: "posthog",
    kind: "track",
    token: "posthog.capture",
    pattern: /\bposthog\s*\.\s*capture\s*\(/g,
  },
  {
    provider: "posthog",
    kind: "identify",
    token: "posthog.identify",
    pattern: /\bposthog\s*\.\s*identify\s*\(/g,
  },
  {
    provider: "segment",
    kind: "import",
    token: "@segment/analytics-next",
    pattern: /@segment\/analytics-next/g,
  },
  {
    provider: "segment",
    kind: "initialize",
    token: "analytics.load",
    pattern: /\banalytics\s*\.\s*load\s*\(/g,
  },
  {
    provider: "segment",
    kind: "track",
    token: "analytics.track",
    pattern: /\banalytics\s*\.\s*track\s*\(/g,
  },
  {
    provider: "segment",
    kind: "identify",
    token: "analytics.identify",
    pattern: /\banalytics\s*\.\s*identify\s*\(/g,
  },
  {
    provider: "mixpanel",
    kind: "import",
    token: "mixpanel-browser",
    pattern: /\bmixpanel-browser\b/g,
  },
  {
    provider: "mixpanel",
    kind: "initialize",
    token: "mixpanel.init",
    pattern: /\bmixpanel\s*\.\s*init\s*\(/g,
  },
  {
    provider: "mixpanel",
    kind: "track",
    token: "mixpanel.track",
    pattern: /\bmixpanel\s*\.\s*track\s*\(/g,
  },
  {
    provider: "mixpanel",
    kind: "identify",
    token: "mixpanel.identify",
    pattern: /\bmixpanel\s*\.\s*identify\s*\(/g,
  },
  {
    provider: "google-analytics",
    kind: "track",
    token: "gtag",
    pattern: /\bgtag\s*\(/g,
  },
  {
    provider: "google-tag-manager",
    kind: "script",
    token: "googletagmanager.com/gtm.js",
    pattern: /googletagmanager\.com\/gtm\.js/g,
  },
];

export interface InspectProjectOptions {
  maxFiles?: number;
  maxFileBytes?: number;
  maxTotalBytes?: number;
  now?: () => Date;
}

interface PackageJson {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

function normalizeRelative(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}

function lineAt(content: string, index: number): number {
  let line = 1;
  for (let position = 0; position < index; position += 1) {
    if (content.charCodeAt(position) === 10) line += 1;
  }
  return line;
}

function stringRecord(value: unknown): Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

async function readPackageJson(
  root: string,
  warnings: string[],
): Promise<PackageJson | null> {
  try {
    const packagePath = join(root, "package.json");
    const packageStat = await lstat(packagePath);
    if (packageStat.isSymbolicLink() || !packageStat.isFile()) {
      warnings.push("package.json is not a regular local file and was skipped");
      return null;
    }
    const raw = await readFile(packagePath, "utf8");
    if (Buffer.byteLength(raw) > DEFAULT_MAX_FILE_BYTES) {
      warnings.push(
        "package.json exceeds the safe inspection size and was skipped",
      );
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      warnings.push("package.json does not contain an object");
      return null;
    }
    const record = parsed as Record<string, unknown>;
    return {
      dependencies: stringRecord(record.dependencies),
      devDependencies: stringRecord(record.devDependencies),
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") warnings.push("package.json could not be parsed");
    return null;
  }
}

async function regularPathExists(
  path: string,
  expected: "file" | "directory",
): Promise<boolean> {
  try {
    const pathStat = await lstat(path);
    return expected === "file" ? pathStat.isFile() : pathStat.isDirectory();
  } catch {
    return false;
  }
}

async function detectPackageManager(
  root: string,
): Promise<ProjectInspection["project"]["package_manager"]> {
  const candidates = [
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
    ["package-lock.json", "npm"],
  ] as const;
  for (const [file, manager] of candidates) {
    if (await regularPathExists(join(root, file), "file")) return manager;
  }
  return (await regularPathExists(join(root, "package.json"), "file"))
    ? "npm"
    : "none";
}

async function detectFramework(
  root: string,
  packageJson: PackageJson | null,
): Promise<{
  framework: Framework;
  confidence: number;
  evidence: ProjectInspection["evidence"];
}> {
  const dependencies = {
    ...packageJson?.dependencies,
    ...packageJson?.devDependencies,
  };
  const evidence: ProjectInspection["evidence"] = [];
  const has = (name: string) => Object.hasOwn(dependencies, name);

  if (has("next")) {
    evidence.push({ kind: "dependency", path: "package.json", detail: "next" });
    if (await regularPathExists(join(root, "app"), "directory")) {
      evidence.push({
        kind: "directory",
        path: "app",
        detail: "Next.js App Router",
      });
      return { framework: "next-app-router", confidence: 0.99, evidence };
    }
    if (await regularPathExists(join(root, "pages"), "directory")) {
      evidence.push({
        kind: "directory",
        path: "pages",
        detail: "Next.js Pages Router",
      });
      return { framework: "next-pages-router", confidence: 0.99, evidence };
    }
    return { framework: "node", confidence: 0.75, evidence };
  }
  if (has("vite") && has("react")) {
    evidence.push(
      { kind: "dependency", path: "package.json", detail: "vite" },
      { kind: "dependency", path: "package.json", detail: "react" },
    );
    return { framework: "react-vite", confidence: 0.99, evidence };
  }
  if (has("react")) {
    evidence.push({
      kind: "dependency",
      path: "package.json",
      detail: "react",
    });
    return { framework: "react", confidence: 0.85, evidence };
  }
  if (packageJson) {
    evidence.push({
      kind: "file",
      path: "package.json",
      detail: "Node.js package",
    });
    return { framework: "node", confidence: 0.65, evidence };
  }
  return { framework: "unknown", confidence: 0, evidence };
}

async function collectSourceFiles(
  root: string,
  maxFiles: number,
): Promise<{
  files: string[];
  skippedSymlinks: number;
  truncated: boolean;
  warnings: string[];
}> {
  const files: string[] = [];
  const warnings: string[] = [];
  let skippedSymlinks = 0;
  let truncated = false;

  async function visit(directory: string): Promise<void> {
    if (truncated) return;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      const display = normalizeRelative(root, directory) || ".";
      warnings.push(`Could not read directory: ${display}`);
      return;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        skippedSymlinks += 1;
        continue;
      }
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) await visit(absolute);
      } else if (
        entry.isFile() &&
        sourceExtensions.has(extname(entry.name).toLowerCase())
      ) {
        if (files.length >= maxFiles) {
          truncated = true;
          return;
        }
        files.push(absolute);
      }
    }
  }

  await visit(root);
  return { files, skippedSymlinks, truncated, warnings };
}

export async function inspectProject(
  projectRoot: string,
  options: InspectProjectOptions = {},
): Promise<ProjectInspection> {
  const requestedRoot = resolve(projectRoot);
  const root = await realpath(requestedRoot);
  const rootStat = await stat(root);
  if (!rootStat.isDirectory())
    throw new Error("Project root must be a directory");

  const requestedLimits = [
    options.maxFiles ?? DEFAULT_MAX_FILES,
    options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES,
    options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES,
  ];
  if (requestedLimits.some((limit) => !Number.isInteger(limit) || limit < 1)) {
    throw new Error("Inspection limits must be positive integers");
  }
  const maxFiles = Math.min(requestedLimits[0]!, DEFAULT_MAX_FILES);
  const maxFileBytes = Math.min(requestedLimits[1]!, DEFAULT_MAX_FILE_BYTES);
  const maxTotalBytes = Math.min(requestedLimits[2]!, DEFAULT_MAX_TOTAL_BYTES);

  const warnings: string[] = [];
  const packageJson = await readPackageJson(root, warnings);
  const detected = await detectFramework(root, packageJson);
  const packageManager = await detectPackageManager(root);
  const analyticsDependencies: ProjectInspection["analytics_dependencies"] = [];

  for (const [dependencyType, dependencies] of [
    ["production", packageJson?.dependencies ?? {}],
    ["development", packageJson?.devDependencies ?? {}],
  ] as const) {
    for (const [packageName, versionRange] of Object.entries(
      dependencies,
    ).sort()) {
      const provider = analyticsPackages.get(packageName);
      if (provider) {
        analyticsDependencies.push({
          provider,
          package_name: packageName,
          version_range: versionRange,
          dependency_type: dependencyType,
        });
      }
    }
  }

  const collected = await collectSourceFiles(root, maxFiles);
  warnings.push(...collected.warnings);
  const instrumentation: ProjectInspection["instrumentation"] = [];
  const seen = new Set<string>();
  let filesScanned = 0;
  let bytesScanned = 0;
  let truncated = collected.truncated;

  fileLoop: for (const file of collected.files) {
    const fileStat = await lstat(file);
    if (fileStat.isSymbolicLink() || !fileStat.isFile()) continue;
    if (fileStat.size > maxFileBytes) {
      warnings.push(
        `Skipped oversized source file: ${normalizeRelative(root, file)}`,
      );
      continue;
    }
    if (bytesScanned + fileStat.size > maxTotalBytes) {
      truncated = true;
      warnings.push("Stopped after reaching the total source scan byte limit");
      break;
    }
    const content = await readFile(file, "utf8");
    bytesScanned += Buffer.byteLength(content);
    filesScanned += 1;
    const path = normalizeRelative(root, file);
    for (const rule of tokenRules) {
      rule.pattern.lastIndex = 0;
      for (const match of content.matchAll(rule.pattern)) {
        const line = lineAt(content, match.index);
        const key = `${rule.provider}:${rule.kind}:${path}:${line}:${rule.token}`;
        if (seen.has(key)) continue;
        seen.add(key);
        instrumentation.push({
          provider: rule.provider,
          kind: rule.kind,
          path,
          line,
          matched_token: rule.token,
        });
        if (instrumentation.length >= MAX_OCCURRENCES) {
          truncated = true;
          warnings.push(
            "Stopped after reaching the instrumentation occurrence limit",
          );
          break fileLoop;
        }
      }
    }
  }

  instrumentation.sort((left, right) =>
    `${left.path}:${left.line}:${left.provider}:${left.kind}`.localeCompare(
      `${right.path}:${right.line}:${right.provider}:${right.kind}`,
    ),
  );

  return projectInspectionSchema.parse({
    schema_version: "1",
    project: {
      framework: detected.framework,
      package_manager: packageManager,
      confidence: detected.confidence,
    },
    evidence: detected.evidence,
    analytics_dependencies: analyticsDependencies,
    instrumentation,
    scan: {
      files_considered: collected.files.length,
      files_scanned: filesScanned,
      bytes_scanned: bytesScanned,
      truncated,
      skipped_symlinks: collected.skippedSymlinks,
    },
    warnings: [...new Set(warnings)].slice(0, 100),
    inspected_at: (options.now ?? (() => new Date()))().toISOString(),
    wizard_version: WIZARD_VERSION,
  });
}
