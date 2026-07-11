import { createHash } from "node:crypto";
import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";

import {
  projectInspectionSchema,
  WIZARD_VERSION,
  type AnalyticsProvider,
  type Framework,
  type ProjectInspection,
} from "@usermaven/wizard-schemas";

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
    token: "usermavenClient",
    pattern: /\b(?:usermaven\s*\.\s*init|usermavenClient)\s*\(/g,
  },
  {
    provider: "usermaven",
    kind: "track",
    token: "usermaven.track",
    pattern: /\busermaven\s*\??\.\s*track\s*\(/g,
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
  scripts: Record<string, string>;
  packageManager: string | null;
}

type UnsupportedFramework = ProjectInspection["unsupported_frameworks"][number];

function unsupportedFrameworks(
  packageJson: PackageJson | null,
  sourceFiles: string[],
): UnsupportedFramework[] {
  const dependencies = {
    ...packageJson?.dependencies,
    ...packageJson?.devDependencies,
  };
  const detected = new Set<UnsupportedFramework>();
  const packages: Array<[string, UnsupportedFramework]> = [
    ["astro", "astro"],
    ["nuxt", "nuxt"],
    ["@remix-run/react", "remix"],
    ["svelte", "svelte"],
    ["@sveltejs/kit", "sveltekit"],
    ["vue", "vue"],
  ];
  for (const [name, framework] of packages)
    if (Object.hasOwn(dependencies, name)) detected.add(framework);
  for (const path of sourceFiles) {
    const extension = extname(path).toLowerCase();
    if (extension === ".vue") detected.add("vue");
    if (extension === ".svelte") detected.add("svelte");
  }
  return [...detected].sort();
}

function normalizeRelative(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}

function lineOffsets(content: string): number[] {
  const offsets = [0];
  for (let index = 0; index < content.length; index += 1)
    if (content.charCodeAt(index) === 10) offsets.push(index + 1);
  return offsets;
}

function lineAt(offsets: number[], index: number): number {
  let low = 0;
  let high = offsets.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (offsets[middle]! <= index) low = middle + 1;
    else high = middle;
  }
  return low;
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
      scripts: stringRecord(record.scripts),
      packageManager:
        typeof record.packageManager === "string"
          ? record.packageManager
          : null,
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
  packageJson: PackageJson | null,
): Promise<ProjectInspection["project"]["package_manager"]> {
  const declared = packageJson?.packageManager?.split("@", 1)[0];
  if (["npm", "pnpm", "yarn", "bun"].includes(declared ?? ""))
    return declared as ProjectInspection["project"]["package_manager"];
  const candidates = [
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
    ["package-lock.json", "npm"],
  ] as const;
  let directory = root;
  for (let depth = 0; depth < 20; depth += 1) {
    for (const [file, manager] of candidates) {
      if (await regularPathExists(join(directory, file), "file"))
        return manager;
    }
    const reachedRepositoryRoot = await regularPathExists(
      join(directory, ".git"),
      "directory",
    );
    const parent = resolve(directory, "..");
    if (reachedRepositoryRoot || parent === directory) break;
    directory = parent;
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
    if (await regularPathExists(join(root, "src", "app"), "directory")) {
      evidence.push({
        kind: "directory",
        path: "src/app",
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
    if (await regularPathExists(join(root, "src", "pages"), "directory")) {
      evidence.push({
        kind: "directory",
        path: "src/pages",
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

async function discoverEntryPoints(
  root: string,
  framework: Framework,
): Promise<ProjectInspection["entry_points"]> {
  const candidates: Array<{
    role: ProjectInspection["entry_points"][number]["role"];
    paths: string[];
  }> =
    framework === "next-app-router"
      ? [
          {
            role: "app_layout",
            paths: [
              "app/layout.tsx",
              "app/layout.jsx",
              "app/layout.ts",
              "app/layout.js",
              "src/app/layout.tsx",
              "src/app/layout.jsx",
              "src/app/layout.ts",
              "src/app/layout.js",
            ],
          },
        ]
      : framework === "next-pages-router"
        ? [
            {
              role: "pages_app",
              paths: [
                "pages/_app.tsx",
                "pages/_app.jsx",
                "pages/_app.ts",
                "pages/_app.js",
                "src/pages/_app.tsx",
                "src/pages/_app.jsx",
                "src/pages/_app.ts",
                "src/pages/_app.js",
              ],
            },
          ]
        : framework === "react-vite"
          ? [
              {
                role: "client_entry",
                paths: [
                  "src/main.tsx",
                  "src/main.jsx",
                  "src/main.ts",
                  "src/main.js",
                ],
              },
            ]
          : [];
  const result: ProjectInspection["entry_points"] = [];
  for (const candidate of candidates) {
    for (const path of candidate.paths) {
      const absolute = join(root, path);
      if (!(await regularPathExists(absolute, "file"))) continue;
      const item = await lstat(absolute);
      if (item.isSymbolicLink() || item.size > DEFAULT_MAX_FILE_BYTES) continue;
      const content = await readFile(absolute);
      result.push({
        path,
        role: candidate.role,
        sha256: `sha256:${createHash("sha256").update(content).digest("hex")}`,
      });
      break;
    }
  }
  return result;
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
  const packageManager = await detectPackageManager(root, packageJson);
  const entryPoints = await discoverEntryPoints(root, detected.framework);
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
  const unsupported = unsupportedFrameworks(packageJson, collected.files);
  warnings.push(...collected.warnings);
  if (unsupported.length > 0)
    warnings.push(
      `Detected unsupported framework adapters: ${unsupported.join(", ")}`,
    );
  const instrumentation: ProjectInspection["instrumentation"] = [];
  const dependencyProviders = new Set(
    analyticsDependencies.map((dependency) => dependency.provider),
  );
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
    const offsets = lineOffsets(content);
    const fileProviders = new Set<AnalyticsProvider>();
    for (const rule of tokenRules) {
      if (rule.kind !== "import" && rule.kind !== "script") continue;
      rule.pattern.lastIndex = 0;
      if (rule.pattern.test(content)) fileProviders.add(rule.provider);
    }
    bytesScanned += Buffer.byteLength(content);
    filesScanned += 1;
    const path = normalizeRelative(root, file);
    for (const rule of tokenRules) {
      if (
        rule.kind !== "import" &&
        rule.kind !== "script" &&
        !dependencyProviders.has(rule.provider) &&
        !fileProviders.has(rule.provider)
      )
        continue;
      rule.pattern.lastIndex = 0;
      for (const match of content.matchAll(rule.pattern)) {
        const line = lineAt(offsets, match.index);
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
    entry_points: entryPoints,
    available_scripts: Object.keys(packageJson?.scripts ?? {}).sort(),
    unsupported_frameworks: unsupported,
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
