import { lstat, realpath } from "node:fs/promises";
import { join } from "node:path";

import {
  doctorReportSchema,
  WIZARD_VERSION,
  type DoctorCheck,
  type DoctorReport,
} from "@usermaven/wizard-schemas";

import { inspectProject } from "./inspector.js";

const SETUP_SUPPORTED_FRAMEWORKS = new Set([
  "next-app-router",
  "next-pages-router",
  "react-vite",
]);

export interface RunDoctorInput {
  projectRoot: string;
  trackingHost?: string;
}

export interface RunDoctorOptions {
  now?: () => Date;
  nodeVersion?: string;
  fetchImplementation?: typeof fetch;
  connectTimeoutMs?: number;
}

async function safeLstat(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function connectivityCheck(
  trackingHost: string,
  options: RunDoctorOptions,
): Promise<DoctorCheck> {
  let url: URL;
  try {
    url = new URL(trackingHost);
  } catch {
    return {
      id: "tracking-host-connectivity",
      status: "fail",
      detail: "The tracking host is not a valid URL",
    };
  }
  const fetchImplementation = options.fetchImplementation ?? fetch;
  try {
    const response = await fetchImplementation(url, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(options.connectTimeoutMs ?? 3_000),
    });
    return {
      id: "tracking-host-connectivity",
      status: "ok",
      detail: `The tracking host responded with HTTP status ${response.status}`,
    };
  } catch {
    return {
      id: "tracking-host-connectivity",
      status: "fail",
      detail:
        "The tracking host did not respond; check DNS, firewalls, proxies, and content blockers",
    };
  }
}

/**
 * Runs read-only local diagnostics. The report contains normalized statuses
 * and bounded detail strings only — no source text, paths outside the root,
 * environment values, or secrets.
 */
export async function runDoctor(
  input: RunDoctorInput,
  options: RunDoctorOptions = {},
): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];

  const nodeVersion = options.nodeVersion ?? process.version;
  const nodeMajor = Number.parseInt(nodeVersion.replace(/^v/u, ""), 10);
  checks.push(
    Number.isInteger(nodeMajor) && nodeMajor >= 20
      ? {
          id: "node-version",
          status: "ok",
          detail: `Node.js ${nodeVersion} satisfies the >=20 requirement`,
        }
      : {
          id: "node-version",
          status: "fail",
          detail: `Node.js ${nodeVersion} does not satisfy the >=20 requirement`,
        },
  );

  let root: string | null = null;
  try {
    root = await realpath(input.projectRoot);
    const item = await lstat(root);
    if (!item.isDirectory()) throw new Error("not a directory");
    checks.push({
      id: "project-root",
      status: "ok",
      detail: "The project root is a readable canonical directory",
    });
  } catch {
    root = null;
    checks.push({
      id: "project-root",
      status: "fail",
      detail: "The project root does not resolve to a readable directory",
    });
  }

  if (root) {
    const packageJson = await safeLstat(join(root, "package.json"));
    checks.push(
      packageJson?.isFile()
        ? {
            id: "package-json",
            status: "ok",
            detail: "package.json is present",
          }
        : {
            id: "package-json",
            status: "warn",
            detail:
              "package.json was not found; framework detection and SDK installation need a Node.js project",
          },
    );

    const inspection = await inspectProject(root);
    const framework = inspection.project.framework;
    if (SETUP_SUPPORTED_FRAMEWORKS.has(framework)) {
      checks.push({
        id: "framework-support",
        status: "ok",
        detail: `Detected framework ${framework} supports generated setup`,
      });
    } else if (inspection.unsupported_frameworks.length > 0) {
      checks.push({
        id: "framework-support",
        status: "warn",
        detail: `Detected framework(s) not yet supported for generated setup: ${inspection.unsupported_frameworks.join(", ")}`,
      });
    } else {
      checks.push({
        id: "framework-support",
        status: "warn",
        detail: `Detected framework ${framework} requires manual integration review`,
      });
    }

    checks.push(
      inspection.project.package_manager === "none"
        ? {
            id: "package-manager",
            status: "warn",
            detail:
              "No package manager lockfile was detected; SDK installation defaults to npm",
          }
        : {
            id: "package-manager",
            status: "ok",
            detail: `Detected package manager: ${inspection.project.package_manager}`,
          },
    );

    const state = await safeLstat(join(root, ".usermaven"));
    if (state === null) {
      checks.push({
        id: "wizard-state",
        status: "ok",
        detail:
          "No .usermaven state directory yet; it is created on first checkpoint",
      });
    } else if (state.isDirectory() && !state.isSymbolicLink()) {
      checks.push({
        id: "wizard-state",
        status: "ok",
        detail: "The private .usermaven state directory is a safe directory",
      });
    } else {
      checks.push({
        id: "wizard-state",
        status: "fail",
        detail:
          ".usermaven exists but is not a regular directory; move it aside before running the wizard",
      });
    }
  }

  if (input.trackingHost !== undefined) {
    checks.push(await connectivityCheck(input.trackingHost, options));
  }

  const overall = checks.some((check) => check.status === "fail")
    ? "fail"
    : checks.some((check) => check.status === "warn")
      ? "warn"
      : "ok";

  return doctorReportSchema.parse({
    schema_version: "1",
    overall,
    checks,
    generated_at: (options.now ?? (() => new Date()))().toISOString(),
    wizard_version: WIZARD_VERSION,
  });
}
