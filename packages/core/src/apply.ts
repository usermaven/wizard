import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  link,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rmdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import { spawn } from "node:child_process";

import {
  applyResultSchema,
  changeApprovalSchema,
  setupPlanSchema,
  type ApplyResult,
  type ChangeApproval,
  type SetupOperation,
  type SetupPlan,
} from "@usermaven/wizard-schemas";
import { applyPatch } from "diff";

import {
  digestSetupPlan,
  fingerprintApprovalContext,
  fingerprintRepositoryRoot,
  verifyChangeApproval,
} from "./approval.js";

const SNAPSHOT_LIMIT = 5_000_000;
const STATE_DIRECTORY = ".usermaven/apply";

interface Snapshot {
  path: string;
  existed: boolean;
  content: Buffer | null;
  mode: number | null;
}

export interface CommandSpec {
  command: string;
  args: string[];
  cwd: string;
}

export type CommandRunner = (spec: CommandSpec) => Promise<void>;

export interface ApplyChangesInput {
  projectRoot: string;
  plan: SetupPlan;
  approval: ChangeApproval;
}

export interface ApplyChangesOptions {
  now?: () => Date;
  commandRunner?: CommandRunner;
}

function isErrno(error: unknown, code: string): boolean {
  return (error as NodeJS.ErrnoException).code === code;
}

function isWithinRoot(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

function rejectProtectedMutationPath(path: string): void {
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
    throw new Error("Mutation targets a protected local path");
  }
}

async function ensureSafeParentDirectories(
  root: string,
  relativePath: string,
  createdDirectories: string[],
): Promise<string> {
  const candidate = resolve(root, relativePath);
  if (!isWithinRoot(root, candidate))
    throw new Error("Operation path escapes the project root");
  const segments = relativePath.split("/").slice(0, -1);
  let current = root;
  for (const segment of segments) {
    current = join(current, segment);
    try {
      const item = await lstat(current);
      if (item.isSymbolicLink() || !item.isDirectory()) {
        throw new Error("Operation path contains an unsafe parent component");
      }
    } catch (error) {
      if (!isErrno(error, "ENOENT")) throw error;
      await mkdir(current);
      createdDirectories.push(current);
    }
  }
  return candidate;
}

async function snapshot(path: string): Promise<Snapshot> {
  try {
    const item = await lstat(path);
    if (item.isSymbolicLink() || !item.isFile()) {
      throw new Error("Mutation target must be a regular file");
    }
    if (item.size > SNAPSHOT_LIMIT)
      throw new Error("Mutation target exceeds the 5 MB safety limit");
    return {
      path,
      existed: true,
      content: await readFile(path),
      mode: item.mode,
    };
  } catch (error) {
    if (isErrno(error, "ENOENT")) {
      return { path, existed: false, content: null, mode: null };
    }
    throw error;
  }
}

async function atomicCreate(path: string, content: string): Promise<void> {
  const temporary = join(dirname(path), `.${randomUUID()}.usermaven.tmp`);
  await writeFile(temporary, content, { flag: "wx", mode: 0o644 });
  try {
    await link(temporary, path);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

async function atomicReplace(
  path: string,
  content: Buffer,
  mode: number,
): Promise<void> {
  const temporary = join(dirname(path), `.${randomUUID()}.usermaven.tmp`);
  await writeFile(temporary, content, { flag: "wx", mode });
  try {
    await rename(temporary, path);
    await chmod(path, mode);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

async function restoreSnapshots(snapshots: Snapshot[]): Promise<string[]> {
  const warnings: string[] = [];
  for (const item of [...snapshots].reverse()) {
    try {
      if (item.existed) {
        await atomicReplace(item.path, item.content!, item.mode!);
      } else {
        await unlink(item.path).catch((error) => {
          if (!isErrno(error, "ENOENT")) throw error;
        });
      }
    } catch {
      warnings.push(
        "A file snapshot could not be restored; inspect the working tree manually.",
      );
    }
  }
  return warnings;
}

async function defaultCommandRunner(spec: CommandSpec): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: process.env,
      shell: false,
      stdio: ["ignore", "ignore", "ignore"],
    });
    const timeout = setTimeout(() => child.kill("SIGTERM"), 5 * 60 * 1_000);
    child.once("error", rejectPromise);
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      if (code === 0) resolvePromise();
      else
        rejectPromise(
          new Error(`Command failed (${signal ?? code ?? "unknown"})`),
        );
    });
  });
}

function installCommand(
  plan: SetupPlan,
  operation: Extract<SetupOperation, { type: "install_package" }>,
  root: string,
): CommandSpec {
  const dependency = `${operation.package_name}@${operation.version_range}`;
  switch (plan.project.package_manager) {
    case "npm":
      return {
        command: "npm",
        args: [
          "install",
          "--ignore-scripts",
          ...(operation.dev ? ["--save-dev"] : []),
          dependency,
        ],
        cwd: root,
      };
    case "pnpm":
      return {
        command: "pnpm",
        args: [
          "add",
          "--ignore-scripts",
          ...(operation.dev ? ["--save-dev"] : []),
          dependency,
        ],
        cwd: root,
      };
    case "yarn":
      return {
        command: "yarn",
        args: [
          "add",
          "--ignore-scripts",
          ...(operation.dev ? ["--dev"] : []),
          dependency,
        ],
        cwd: root,
      };
    case "bun":
      return {
        command: "bun",
        args: [
          "add",
          "--ignore-scripts",
          ...(operation.dev ? ["--dev"] : []),
          dependency,
        ],
        cwd: root,
      };
    default:
      throw new Error("The setup plan has no executable package manager");
  }
}

function checkCommand(
  operation: Extract<SetupOperation, { type: "run_check" }>,
  root: string,
): CommandSpec {
  const allowed = new Map<string, [string, string[]]>([
    ["npm run build", ["npm", ["run", "build"]]],
    ["pnpm build", ["pnpm", ["build"]]],
    ["yarn build", ["yarn", ["build"]]],
    ["bun run build", ["bun", ["run", "build"]]],
  ]);
  const parsed = allowed.get(operation.command);
  if (!parsed)
    throw new Error(
      "The check command is not allowlisted for shell-free execution",
    );
  return { command: parsed[0], args: parsed[1], cwd: root };
}

function validateSimpleUnifiedDiff(diff: string, expectedPath: string): void {
  if (
    /^(?:diff --git|rename (?:from|to)|copy (?:from|to)|GIT binary patch)/mu.test(
      diff,
    )
  ) {
    throw new Error("Only a single-file textual unified diff can be applied");
  }
  const paths = [...diff.matchAll(/^(?:---|\+\+\+)\s+([^\t\n]+)/gmu)].map(
    (match) => match[1],
  );
  if (paths.length !== 2)
    throw new Error("Edit operation must contain one unified diff file pair");
  const accepted = new Set([
    expectedPath,
    `a/${expectedPath}`,
    `b/${expectedPath}`,
  ]);
  if (paths.some((path) => path !== "/dev/null" && !accepted.has(path!))) {
    throw new Error(
      "Unified diff path does not match the approved operation path",
    );
  }
}

async function safeStateDirectory(root: string): Promise<string> {
  const created: string[] = [];
  return dirname(
    await ensureSafeParentDirectories(
      root,
      `${STATE_DIRECTORY}/state.json`,
      created,
    ),
  );
}

export async function applyChanges(
  input: ApplyChangesInput,
  options: ApplyChangesOptions = {},
): Promise<ApplyResult> {
  const plan = setupPlanSchema.parse(input.plan);
  const root = await realpath(input.projectRoot);
  const approval = await verifyChangeApproval(
    root,
    changeApprovalSchema.parse(input.approval),
  );
  const now = options.now ?? (() => new Date());
  const startedAt = now();
  const planDigest = digestSetupPlan(plan);
  const rootFingerprint = await fingerprintRepositoryRoot(root);

  if (
    approval.plan_id !== plan.plan_id ||
    approval.plan_digest !== planDigest
  ) {
    throw new Error("Approval does not match the exact setup plan");
  }
  if (approval.repository_root_fingerprint !== rootFingerprint) {
    throw new Error("Approval does not match this repository root");
  }
  const stateRecord = `${STATE_DIRECTORY}/${approval.approval_id}.json`;
  const recordPath = join(root, stateRecord);
  try {
    await lstat(recordPath);
    throw new Error("Approval has already been consumed");
  } catch (error) {
    if (!isErrno(error, "ENOENT")) throw error;
  }
  if (
    approval.approval_context_digest !==
    (await fingerprintApprovalContext(root, plan))
  ) {
    throw new Error(
      "Repository package or check context changed after approval",
    );
  }
  if (Date.parse(approval.expires_at) <= startedAt.getTime()) {
    throw new Error("Approval has expired");
  }
  const approvedIds = new Set(approval.operation_ids);
  const operations = plan.operations.filter((operation) =>
    approvedIds.has(operation.id),
  );
  if (operations.length !== approvedIds.size)
    throw new Error("Approval references an unknown operation");

  const stateDirectory = await safeStateDirectory(root);
  const lockPath = join(stateDirectory, `${approval.approval_id}.lock`);
  await writeFile(lockPath, JSON.stringify({ plan_digest: planDigest }), {
    flag: "wx",
    mode: 0o600,
  }).catch((error) => {
    if (isErrno(error, "EEXIST"))
      throw new Error("Approval is already in progress or consumed");
    throw error;
  });

  const snapshots: Snapshot[] = [];
  const rollbackSnapshots: Snapshot[] = [];
  const createdDirectories: string[] = [];
  const operationResults: ApplyResult["operations"] = [];
  let failure: Error | null = null;
  let installRan = false;
  const runner = options.commandRunner ?? defaultCommandRunner;

  try {
    const snapshotPaths = new Set<string>();
    for (const operation of operations) {
      if (operation.type === "create_file" || operation.type === "edit_file") {
        rejectProtectedMutationPath(operation.path);
        snapshotPaths.add(
          await ensureSafeParentDirectories(
            root,
            operation.path,
            createdDirectories,
          ),
        );
      }
      if (operation.type === "install_package") {
        for (const file of [
          "package.json",
          "package-lock.json",
          "pnpm-lock.yaml",
          "yarn.lock",
          "bun.lock",
          "bun.lockb",
        ]) {
          snapshotPaths.add(join(root, file));
        }
      }
    }
    for (const path of snapshotPaths) snapshots.push(await snapshot(path));

    for (const operation of operations) {
      try {
        if (operation.type === "manual_step") {
          operationResults.push({
            operation_id: operation.id,
            type: operation.type,
            outcome: "skipped",
            summary:
              "Manual step retained for the user; no action was executed",
          });
          continue;
        }
        if (operation.type === "create_file") {
          const target = resolve(root, operation.path);
          const original = snapshots.find((item) => item.path === target)!;
          if (original.existed) throw new Error("Create target already exists");
          await atomicCreate(target, operation.content);
          rollbackSnapshots.push(original);
        } else if (operation.type === "edit_file") {
          const target = resolve(root, operation.path);
          const currentBuffer = await readFile(target);
          const current = currentBuffer.toString("utf8");
          const currentHash = `sha256:${createHash("sha256")
            .update(currentBuffer)
            .digest("hex")}`;
          if (currentHash !== operation.before_hash)
            throw new Error("Edit target changed after planning");
          validateSimpleUnifiedDiff(operation.unified_diff, operation.path);
          const patched = applyPatch(current, operation.unified_diff);
          if (patched === false)
            throw new Error("Unified diff no longer applies cleanly");
          const mode = (await lstat(target)).mode;
          await atomicReplace(target, Buffer.from(patched), mode);
          rollbackSnapshots.push(
            snapshots.find((item) => item.path === target)!,
          );
        } else if (operation.type === "install_package") {
          for (const item of snapshots.filter((snapshotItem) =>
            [
              "package.json",
              "package-lock.json",
              "pnpm-lock.yaml",
              "yarn.lock",
              "bun.lock",
              "bun.lockb",
            ].some((name) => snapshotItem.path === join(root, name)),
          )) {
            if (!rollbackSnapshots.includes(item)) rollbackSnapshots.push(item);
          }
          installRan = true;
          await runner(installCommand(plan, operation, root));
        } else if (operation.type === "run_check") {
          await runner(checkCommand(operation, root));
        }
        operationResults.push({
          operation_id: operation.id,
          type: operation.type,
          outcome: "applied",
          summary: operation.summary,
        });
      } catch (error) {
        failure =
          error instanceof Error ? error : new Error("Operation failed");
        operationResults.push({
          operation_id: operation.id,
          type: operation.type,
          outcome: "failed",
          summary:
            "Operation failed; details were withheld to avoid leaking local data",
        });
        break;
      }
    }
  } catch (error) {
    failure =
      error instanceof Error ? error : new Error("Apply preparation failed");
  }

  const rollbackWarnings: string[] = [];
  let rollbackSucceeded = true;
  if (failure) {
    rollbackWarnings.push(...(await restoreSnapshots(rollbackSnapshots)));
    for (const directory of [...createdDirectories].reverse()) {
      await rmdir(directory).catch(() => undefined);
    }
    if (installRan) {
      rollbackWarnings.push(
        "Package manifests and lockfiles were restored, but package-manager cache or node_modules changes may remain.",
      );
    }
    rollbackSucceeded = rollbackWarnings.every((warning) =>
      warning.includes("node_modules"),
    );
    for (const result of operationResults) {
      if (result.outcome === "applied") result.outcome = "rolled_back";
    }
  }

  const result = applyResultSchema.parse({
    schema_version: "1",
    approval_id: approval.approval_id,
    plan_id: plan.plan_id,
    plan_digest: planDigest,
    repository_root_fingerprint: rootFingerprint,
    outcome: failure
      ? rollbackSucceeded
        ? "rolled_back"
        : "failed"
      : "succeeded",
    operations: operationResults,
    rollback: {
      attempted: failure !== null,
      succeeded: failure === null || rollbackSucceeded,
      warnings: rollbackWarnings,
    },
    warnings: [
      "Package installation disables lifecycle scripts and may leave node_modules or package-manager cache changes after rollback.",
      "Approved build checks execute repository-defined scripts; generated build artifacts are not included in rollback snapshots.",
    ],
    state_record: stateRecord,
    started_at: startedAt.toISOString(),
    completed_at: now().toISOString(),
  });
  const temporaryRecord = `${recordPath}.${randomUUID()}.tmp`;
  await writeFile(temporaryRecord, JSON.stringify(result, null, 2), {
    flag: "wx",
    mode: 0o600,
  });
  await rename(temporaryRecord, recordPath);
  await unlink(lockPath).catch(() => undefined);
  return result;
}
