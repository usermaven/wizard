#!/usr/bin/env node

import { inspectProject, proposeTrackingPlan } from "@usermaven/wizard-core";

import { manifest } from "./manifest.js";

const help = `Usermaven Wizard (contract preview)

Usage:
  usermaven-wizard inspect [path] [--compact]
  usermaven-wizard plan [path] [--compact]
  usermaven-wizard manifest [--compact]
  usermaven-wizard --help

Inspect and plan are read-only. Plan produces a deterministic page-view and user
identity baseline that always requires review. Applying, verification, and local
MCP commands will be implemented incrementally.`;

const [command, ...flags] = process.argv.slice(2);

async function main(): Promise<void> {
  const compact = flags.includes("--compact");
  const spacing = compact ? undefined : 2;
  const unknownFlags = flags.filter(
    (flag) => flag.startsWith("-") && flag !== "--compact",
  );
  if (unknownFlags.length > 0) {
    throw new Error(`Unknown option: ${unknownFlags[0]}`);
  }

  if (command === "manifest") {
    process.stdout.write(`${JSON.stringify(manifest, null, spacing)}\n`);
    return;
  }
  if (command === "inspect") {
    const paths = flags.filter((flag) => !flag.startsWith("-"));
    if (paths.length > 1)
      throw new Error("Inspect accepts at most one project path");
    const result = await inspectProject(paths[0] ?? process.cwd());
    process.stdout.write(`${JSON.stringify(result, null, spacing)}\n`);
    return;
  }
  if (command === "plan") {
    const paths = flags.filter((flag) => !flag.startsWith("-"));
    if (paths.length > 1)
      throw new Error("Plan accepts at most one project path");
    const inspection = await inspectProject(paths[0] ?? process.cwd());
    const result = proposeTrackingPlan(inspection);
    process.stdout.write(`${JSON.stringify(result, null, spacing)}\n`);
    return;
  }
  if (command === undefined || command === "--help" || command === "-h") {
    process.stdout.write(`${help}\n`);
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unexpected failure";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
