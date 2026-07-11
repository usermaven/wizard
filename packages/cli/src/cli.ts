#!/usr/bin/env node

import { readFile, stat, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";

import {
  applyChanges,
  approvalConfirmation,
  createAiTrackingPlan,
  createChangeApproval,
  digestSetupPlan,
  generateSetupPlan,
  inspectProject,
  previewChanges,
} from "@usermaven/wizard-core";
import {
  aiTrackingProposalSchema,
  aiInstrumentationProposalSchema,
  businessContextSchema,
  changeApprovalSchema,
  setupPlanSchema,
} from "@usermaven/wizard-schemas";

import { manifest } from "./manifest.js";

const help = `Usermaven Wizard

Usage:
  usermaven-wizard inspect [path] [--compact]
  usermaven-wizard plan [path] --business-context <context.json>
    --ai-proposal <proposal.json> [--compact]
  usermaven-wizard setup-plan [path] --workspace-name <name> --region <region>
    --key-fingerprint <sha256:fingerprint> --tracking-host <https-url>
    --tracking-plan <tracking-plan.json> --ai-instrumentation <changes.json>
    [--key-env-var <name>] [--tracking-host-env-var <name>] [--compact]
  usermaven-wizard preview <setup-plan.json> [--compact]
  usermaven-wizard approve <setup-plan.json> --operations <id,id> [--root <path>]
    [--ttl-minutes <1-60>] [--output <approval.json>]
  usermaven-wizard apply <setup-plan.json> --approval <approval.json>
    [--root <path>] [--compact]
  usermaven-wizard manifest [--compact]
  usermaven-wizard --help

Inspection, planning, and preview are read-only. Approve requires an interactive
terminal confirmation. Apply executes only the exact operations bound to that
unexpired approval artifact.`;

const [command, ...flags] = process.argv.slice(2);

function parseArguments(arguments_: string[], allowedOptions: string[]) {
  const options = new Map<string, string>();
  const positionals: string[] = [];
  let compact = false;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!;
    if (argument === "--compact") {
      compact = true;
    } else if (argument.startsWith("--")) {
      if (!allowedOptions.includes(argument)) {
        throw new Error(`Unknown option: ${argument}`);
      }
      const value = arguments_[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a value`);
      }
      if (options.has(argument))
        throw new Error(`${argument} may be provided only once`);
      options.set(argument, value);
      index += 1;
    } else {
      positionals.push(argument);
    }
  }
  return { compact, options, positionals };
}

function requiredOption(options: Map<string, string>, name: string): string {
  const value = options.get(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function readJson(path: string, maximumBytes: number): Promise<unknown> {
  if ((await stat(path)).size > maximumBytes) {
    throw new Error(
      `JSON input exceeds the ${maximumBytes / 1_000_000} MB limit`,
    );
  }
  return JSON.parse(await readFile(path, "utf8"));
}

async function main(): Promise<void> {
  const allowedOptions =
    command === "setup-plan"
      ? [
          "--workspace-name",
          "--region",
          "--key-fingerprint",
          "--tracking-host",
          "--key-env-var",
          "--tracking-host-env-var",
          "--tracking-plan",
          "--ai-instrumentation",
        ]
      : command === "plan"
        ? ["--business-context", "--ai-proposal"]
        : command === "approve"
          ? ["--root", "--operations", "--ttl-minutes", "--output"]
          : command === "apply"
            ? ["--root", "--approval"]
            : [];
  const parsed = parseArguments(flags, allowedOptions);
  const spacing = parsed.compact ? undefined : 2;

  if (command === "manifest") {
    if (parsed.positionals.length > 0)
      throw new Error("Manifest accepts no paths");
    process.stdout.write(`${JSON.stringify(manifest, null, spacing)}\n`);
    return;
  }
  if (command === "inspect") {
    if (parsed.positionals.length > 1)
      throw new Error("Inspect accepts at most one project path");
    const result = await inspectProject(parsed.positionals[0] ?? process.cwd());
    process.stdout.write(`${JSON.stringify(result, null, spacing)}\n`);
    return;
  }
  if (command === "plan") {
    if (parsed.positionals.length > 1)
      throw new Error("Plan accepts at most one project path");
    const inspection = await inspectProject(
      parsed.positionals[0] ?? process.cwd(),
    );
    const businessContext = businessContextSchema.parse(
      await readJson(
        requiredOption(parsed.options, "--business-context"),
        1_000_000,
      ),
    );
    const aiProposal = aiTrackingProposalSchema.parse(
      await readJson(
        requiredOption(parsed.options, "--ai-proposal"),
        5_000_000,
      ),
    );
    const result = createAiTrackingPlan({
      inspection,
      businessContext,
      aiProposal,
    });
    process.stdout.write(`${JSON.stringify(result, null, spacing)}\n`);
    return;
  }
  if (command === "setup-plan") {
    if (parsed.positionals.length > 1)
      throw new Error("Setup-plan accepts at most one project path");
    const keyEnvVar = parsed.options.get("--key-env-var");
    const trackingHostEnvVar = parsed.options.get("--tracking-host-env-var");
    const result = await generateSetupPlan({
      projectRoot: parsed.positionals[0] ?? process.cwd(),
      trackingPlan: setupPlanSchema.shape.tracking_plan.parse(
        await readJson(
          requiredOption(parsed.options, "--tracking-plan"),
          5_000_000,
        ),
      ),
      instrumentationProposal: aiInstrumentationProposalSchema.parse(
        await readJson(
          requiredOption(parsed.options, "--ai-instrumentation"),
          5_000_000,
        ),
      ),
      workspace: {
        display_name: requiredOption(parsed.options, "--workspace-name"),
        region: requiredOption(parsed.options, "--region"),
        public_key_fingerprint: requiredOption(
          parsed.options,
          "--key-fingerprint",
        ),
        tracking_host: requiredOption(parsed.options, "--tracking-host"),
        ...(keyEnvVar ? { key_env_var: keyEnvVar } : {}),
        ...(trackingHostEnvVar
          ? { tracking_host_env_var: trackingHostEnvVar }
          : {}),
      },
    });
    process.stdout.write(`${JSON.stringify(result, null, spacing)}\n`);
    return;
  }
  if (command === "preview") {
    if (parsed.positionals.length !== 1)
      throw new Error("Preview requires one setup-plan JSON path");
    const planPath = parsed.positionals[0]!;
    const plan = setupPlanSchema.parse(await readJson(planPath, 5_000_000));
    const result = previewChanges(plan);
    process.stdout.write(`${JSON.stringify(result, null, spacing)}\n`);
    return;
  }
  if (command === "approve") {
    if (parsed.positionals.length !== 1)
      throw new Error("Approve requires one setup-plan JSON path");
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error("Approve requires an interactive terminal");
    }
    const plan = setupPlanSchema.parse(
      await readJson(parsed.positionals[0]!, 5_000_000),
    );
    const operationIds = requiredOption(parsed.options, "--operations")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const root = parsed.options.get("--root") ?? process.cwd();
    const ttlMinutes = Number.parseInt(
      parsed.options.get("--ttl-minutes") ?? "15",
      10,
    );
    if (!Number.isInteger(ttlMinutes) || ttlMinutes < 1 || ttlMinutes > 60) {
      throw new Error("--ttl-minutes must be an integer from 1 to 60");
    }
    const digest = digestSetupPlan(plan);
    const expected = approvalConfirmation(digest, operationIds);
    process.stdout.write(
      `Plan: ${plan.plan_id}\nDigest: ${digest}\nOperations:\n${operationIds
        .map((id) => `  - ${id}`)
        .join("\n")}\n\nType exactly:\n${expected}\n\n`,
    );
    const readline = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const answer = await readline.question("> ");
    readline.close();
    if (answer !== expected)
      throw new Error("Approval confirmation did not match");
    const result = await createChangeApproval(
      {
        plan,
        projectRoot: root,
        operationIds,
        confirmedByInteractiveUser: true,
      },
      { ttlMs: ttlMinutes * 60 * 1_000 },
    );
    const serialized = `${JSON.stringify(result, null, 2)}\n`;
    const output = parsed.options.get("--output");
    if (output) {
      await writeFile(output, serialized, { flag: "wx", mode: 0o600 });
      process.stdout.write(`Approval written to ${output}\n`);
    } else {
      process.stdout.write(serialized);
    }
    return;
  }
  if (command === "apply") {
    if (parsed.positionals.length !== 1)
      throw new Error("Apply requires one setup-plan JSON path");
    const plan = setupPlanSchema.parse(
      await readJson(parsed.positionals[0]!, 5_000_000),
    );
    const approval = changeApprovalSchema.parse(
      await readJson(requiredOption(parsed.options, "--approval"), 1_000_000),
    );
    const result = await applyChanges({
      projectRoot: parsed.options.get("--root") ?? process.cwd(),
      plan,
      approval,
    });
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
