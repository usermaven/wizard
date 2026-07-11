#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";

import {
  applyChanges,
  approvalConfirmation,
  createAiTrackingPlan,
  createChangeApproval,
  createVerificationSession,
  digestSetupPlan,
  generateSetupPlan,
  inspectProject,
  inspectApplyLock,
  loadChangeApproval,
  loadSetupPlanArtifact,
  previewChanges,
  recoverStaleApplyLock,
  resumeWorkflow,
  saveWorkflowCheckpoint,
  storeChangeApproval,
  storeSetupPlanArtifact,
  startGuidedSetup,
  verifySetup,
} from "@usermaven/wizard-core";
import {
  aiTrackingProposalSchema,
  aiInstrumentationProposalSchema,
  businessContextSchema,
  changeApprovalSchema,
  setupPlanSchema,
  verificationEvidenceSchema,
  verificationSessionSchema,
  workflowStepSchema,
} from "@usermaven/wizard-schemas";

import { manifest } from "./manifest.js";
import { integerOption, parseArguments } from "./arguments.js";

const help = `Usermaven Wizard

Usage:
  usermaven-wizard inspect [path] [--compact]
  usermaven-wizard plan [path] --business-context <context.json>
    --ai-proposal <proposal.json> [--compact]
  usermaven-wizard setup-plan [path] --workspace-name <name> --region <region>
    --key-fingerprint <sha256:fingerprint> --tracking-host <https-url>
    --tracking-plan <tracking-plan.json> --ai-instrumentation <changes.json>
    [--key-env-var <name>] [--tracking-host-env-var <name>] [--compact]
  usermaven-wizard preview [<setup-plan.json> | --plan-digest <digest>]
    [--root <path>] [--compact]
  usermaven-wizard approve [<setup-plan.json> | --plan-digest <digest>]
    --operations <id,id> [--root <path>]
    [--ttl-minutes <1-60>] [--output <approval.json>]
  usermaven-wizard apply [<setup-plan.json> | --plan-digest <digest>]
    (--approval <approval.json> | --approval-id <id>)
    [--root <path>] [--compact]
  usermaven-wizard verification-session [<setup-plan.json> | --plan-digest <digest>]
    --environment <name> [--ttl-minutes <1-60>] [--compact]
  usermaven-wizard verify [<setup-plan.json> | --plan-digest <digest>]
    --session <session.json>
    --evidence <evidence.json> [--root <path>] [--compact]
  usermaven-wizard checkpoint [path] --step <workflow-step>
    [--workflow-id <id>] [--tracking-plan <path>] [--setup-plan <path>]
    [--approval <path>] [--apply-result <path>] [--session <path>]
    [--verification-result <path>] [--compact]
  usermaven-wizard resume [path] --workflow-id <id> [--compact]
  usermaven-wizard setup [path] [--compact]
  usermaven-wizard next [path] --workflow-id <id> [--compact]
  usermaven-wizard apply-lock [path] --approval-id <id> [--compact]
  usermaven-wizard recover-lock [path] --approval-id <id>
    --confirm "RECOVER <id>" [--compact]
  usermaven-wizard manifest [--compact]
  usermaven-wizard --help

Inspection, planning, and preview are read-only. Approve requires an interactive
terminal confirmation. Apply executes only the exact operations bound to that
unexpired approval artifact.`;

const [command, ...flags] = process.argv.slice(2);

async function writePrivateOutput(
  path: string,
  content: string,
): Promise<void> {
  try {
    const item = await lstat(path);
    if (item.isSymbolicLink() || !item.isFile())
      throw new Error("Approval output target must be a regular file");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const temporary = join(dirname(path), `.${randomUUID()}.wizard.tmp`);
  await writeFile(temporary, content, { flag: "wx", mode: 0o600 });
  try {
    await rename(temporary, path);
    await chmod(path, 0o600);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
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

async function readSetupPlan(
  positionals: string[],
  options: Map<string, string>,
  commandName: string,
) {
  const digest = options.get("--plan-digest");
  if (positionals.length > 1 || (positionals.length === 1 && digest))
    throw new Error(
      `${commandName} accepts exactly one setup-plan path or --plan-digest`,
    );
  if (digest)
    return loadSetupPlanArtifact(
      options.get("--root") ?? process.cwd(),
      digest,
    );
  if (positionals.length !== 1)
    throw new Error(
      `${commandName} requires a setup-plan path or --plan-digest`,
    );
  return setupPlanSchema.parse(await readJson(positionals[0]!, 5_000_000));
}

function parseTrustedWorkspaceKeys(value: unknown): Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Trusted workspace keys must be a JSON object");
  const entries = Object.entries(value);
  if (
    entries.length > 20 ||
    entries.some(
      ([key, publicKey]) =>
        !/^[a-zA-Z0-9._-]{1,128}$/u.test(key) ||
        typeof publicKey !== "string" ||
        publicKey.length > 10_000,
    )
  ) {
    throw new Error("Trusted workspace keys contain an invalid entry");
  }
  return Object.fromEntries(entries) as Record<string, string>;
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
          ? [
              "--root",
              "--operations",
              "--ttl-minutes",
              "--output",
              "--plan-digest",
            ]
          : command === "apply"
            ? ["--root", "--approval", "--approval-id", "--plan-digest"]
            : command === "verification-session"
              ? ["--environment", "--ttl-minutes", "--root", "--plan-digest"]
              : command === "verify"
                ? [
                    "--root",
                    "--session",
                    "--evidence",
                    "--trusted-workspace-keys",
                    "--plan-digest",
                  ]
                : command === "preview"
                  ? ["--root", "--plan-digest"]
                  : command === "checkpoint"
                    ? [
                        "--step",
                        "--workflow-id",
                        "--tracking-plan",
                        "--setup-plan",
                        "--approval",
                        "--apply-result",
                        "--session",
                        "--verification-result",
                      ]
                    : command === "resume"
                      ? ["--workflow-id"]
                      : command === "next"
                        ? ["--workflow-id"]
                        : command === "apply-lock"
                          ? ["--approval-id"]
                          : command === "recover-lock"
                            ? ["--approval-id", "--confirm"]
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
    const projectRoot = parsed.positionals[0] ?? process.cwd();
    const result = await generateSetupPlan({
      projectRoot,
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
    await storeSetupPlanArtifact(projectRoot, result);
    process.stdout.write(`${JSON.stringify(result, null, spacing)}\n`);
    return;
  }
  if (command === "preview") {
    const plan = await readSetupPlan(
      parsed.positionals,
      parsed.options,
      "Preview",
    );
    const result = previewChanges(plan);
    process.stdout.write(`${JSON.stringify(result, null, spacing)}\n`);
    return;
  }
  if (command === "approve") {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error("Approve requires an interactive terminal");
    }
    const plan = await readSetupPlan(
      parsed.positionals,
      parsed.options,
      "Approve",
    );
    const operationIds = requiredOption(parsed.options, "--operations")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const root = parsed.options.get("--root") ?? process.cwd();
    const ttlMinutes = integerOption(
      parsed.options,
      "--ttl-minutes",
      15,
      1,
      60,
    );
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
    const registryPath = await storeChangeApproval(root, result);
    const serialized = `${JSON.stringify(result, null, spacing)}\n`;
    const output = parsed.options.get("--output");
    if (output) {
      await writePrivateOutput(output, serialized);
      process.stdout.write(
        `Approval ${result.approval_id} written to ${output} and registered at ${registryPath}\n`,
      );
    } else {
      process.stdout.write(
        `Approval ${result.approval_id} registered at ${registryPath}\n`,
      );
    }
    return;
  }
  if (command === "apply") {
    const plan = await readSetupPlan(
      parsed.positionals,
      parsed.options,
      "Apply",
    );
    const approvalPath = parsed.options.get("--approval");
    const approvalId = parsed.options.get("--approval-id");
    if ((approvalPath ? 1 : 0) + (approvalId ? 1 : 0) !== 1)
      throw new Error("Apply requires exactly one --approval or --approval-id");
    const root = parsed.options.get("--root") ?? process.cwd();
    const approval = approvalId
      ? await loadChangeApproval(root, approvalId)
      : changeApprovalSchema.parse(await readJson(approvalPath!, 1_000_000));
    const result = await applyChanges({
      projectRoot: root,
      plan,
      approval,
    });
    process.stdout.write(`${JSON.stringify(result, null, spacing)}\n`);
    return;
  }
  if (command === "verification-session") {
    const plan = await readSetupPlan(
      parsed.positionals,
      parsed.options,
      "Verification-session",
    );
    const ttlMinutes = integerOption(
      parsed.options,
      "--ttl-minutes",
      30,
      1,
      60,
    );
    const result = createVerificationSession(
      {
        plan,
        environment: requiredOption(parsed.options, "--environment"),
      },
      { ttlMs: ttlMinutes * 60 * 1_000 },
    );
    process.stdout.write(`${JSON.stringify(result, null, spacing)}\n`);
    return;
  }
  if (command === "verify") {
    const plan = await readSetupPlan(
      parsed.positionals,
      parsed.options,
      "Verify",
    );
    const session = verificationSessionSchema.parse(
      await readJson(requiredOption(parsed.options, "--session"), 1_000_000),
    );
    const evidence = verificationEvidenceSchema.parse(
      await readJson(requiredOption(parsed.options, "--evidence"), 2_000_000),
    );
    const result = await verifySetup(
      {
        projectRoot: parsed.options.get("--root") ?? process.cwd(),
        plan,
        session,
        evidence,
      },
      {
        trustedWorkspaceKeys: parsed.options.get("--trusted-workspace-keys")
          ? parseTrustedWorkspaceKeys(
              await readJson(
                parsed.options.get("--trusted-workspace-keys")!,
                1_000_000,
              ),
            )
          : {},
      },
    );
    process.stdout.write(`${JSON.stringify(result, null, spacing)}\n`);
    if (result.outcome === "fail") process.exitCode = 1;
    return;
  }
  if (command === "checkpoint") {
    if (parsed.positionals.length > 1)
      throw new Error("Checkpoint accepts at most one project path");
    const artifactOptionNames = {
      tracking_plan: "--tracking-plan",
      setup_plan: "--setup-plan",
      approval: "--approval",
      apply_result: "--apply-result",
      verification_session: "--session",
      verification_result: "--verification-result",
    } as const;
    const artifactPaths = Object.fromEntries(
      Object.entries(artifactOptionNames)
        .map(([kind, option]) => [kind, parsed.options.get(option)])
        .filter((entry): entry is [string, string] => entry[1] !== undefined),
    );
    const workflowId = parsed.options.get("--workflow-id");
    const result = await saveWorkflowCheckpoint({
      projectRoot: parsed.positionals[0] ?? process.cwd(),
      completedStep: workflowStepSchema.parse(
        requiredOption(parsed.options, "--step"),
      ),
      ...(workflowId ? { workflowId } : {}),
      artifactPaths,
    });
    process.stdout.write(`${JSON.stringify(result, null, spacing)}\n`);
    return;
  }
  if (command === "resume") {
    if (parsed.positionals.length > 1)
      throw new Error("Resume accepts at most one project path");
    const result = await resumeWorkflow(
      parsed.positionals[0] ?? process.cwd(),
      requiredOption(parsed.options, "--workflow-id"),
    );
    process.stdout.write(`${JSON.stringify(result, null, spacing)}\n`);
    return;
  }
  if (command === "setup") {
    if (parsed.positionals.length > 1)
      throw new Error("Setup accepts at most one project path");
    const result = await startGuidedSetup(
      parsed.positionals[0] ?? process.cwd(),
    );
    process.stdout.write(`${JSON.stringify(result, null, spacing)}\n`);
    return;
  }
  if (command === "next") {
    if (parsed.positionals.length > 1)
      throw new Error("Next accepts at most one project path");
    const result = await resumeWorkflow(
      parsed.positionals[0] ?? process.cwd(),
      requiredOption(parsed.options, "--workflow-id"),
    );
    process.stdout.write(`${JSON.stringify(result, null, spacing)}\n`);
    return;
  }
  if (command === "apply-lock") {
    if (parsed.positionals.length > 1)
      throw new Error("Apply-lock accepts at most one project path");
    const result = await inspectApplyLock(
      parsed.positionals[0] ?? process.cwd(),
      requiredOption(parsed.options, "--approval-id"),
    );
    process.stdout.write(`${JSON.stringify(result, null, spacing)}\n`);
    return;
  }
  if (command === "recover-lock") {
    if (parsed.positionals.length > 1)
      throw new Error("Recover-lock accepts at most one project path");
    const result = await recoverStaleApplyLock(
      parsed.positionals[0] ?? process.cwd(),
      requiredOption(parsed.options, "--approval-id"),
      requiredOption(parsed.options, "--confirm"),
    );
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
