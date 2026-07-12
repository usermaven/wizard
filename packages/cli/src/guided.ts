import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

import {
  applyChanges,
  approvalConfirmation,
  createBaselineTrackingPlan,
  createChangeApproval,
  digestSetupPlan,
  generateSetupPlan,
  inspectProject,
  saveWorkflowCheckpoint,
  startGuidedSetup,
  storeChangeApproval,
  storeSetupPlanArtifact,
} from "@usermaven/wizard-core";
import type { SetupPlan } from "@usermaven/wizard-schemas";

import { buildSetupReport } from "./report.js";
import { loadCredentials, toApiAuth } from "./credentials.js";
import {
  fingerprintWorkspaceKey,
  WorkspaceApiClient,
  type ApiAuth,
  type WorkspaceSummary,
} from "./workspace-api.js";
import { STARTER_DASHBOARD_NAME, starterTrends } from "./starter-dashboard.js";

const SETUP_SUPPORTED_FRAMEWORKS = new Set([
  "next-app-router",
  "next-pages-router",
  "react-vite",
]);

const DEFAULT_TRACKING_HOST = "https://events.usermaven.com";
const REPORT_FILENAME = "usermaven-setup-report.md";

export interface GuidedSetupIo {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
}

export interface GuidedSetupOptions {
  projectRoot: string;
  io: GuidedSetupIo;
  approvalTtlMinutes?: number;
}

interface Prompter {
  question(query: string): Promise<string>;
  close(): void;
}

function summarizeOperations(plan: SetupPlan): string {
  return plan.operations
    .map(
      (operation) =>
        `  - [${operation.requires_approval ? "needs approval" : "manual"}] ${operation.id}: ${operation.summary}`,
    )
    .join("\n");
}

async function promptWithDefault(
  prompter: Prompter,
  label: string,
  fallback?: string,
): Promise<string> {
  const suffix = fallback ? ` [${fallback}]` : "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const answer = (await prompter.question(`${label}${suffix}: `)).trim();
    if (answer) return answer;
    if (fallback) return fallback;
  }
  throw new Error(`${label} is required`);
}

async function promptFingerprint(
  prompter: Prompter,
  write: (text: string) => void,
): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const answer = (
      await prompter.question("Workspace key fingerprint (sha256:…): ")
    ).trim();
    if (/^sha256:[a-f0-9]{16,}$/u.test(answer)) return answer;
    write(
      "That does not look like a fingerprint. The wizard never accepts the key value itself.\n" +
        "Compute the fingerprint with:\n  printf '%s' \"YOUR_WORKSPACE_KEY\" | sha256sum | awk '{print \"sha256:\" $1}'\n",
    );
  }
  throw new Error("A sha256:… workspace key fingerprint is required");
}

/**
 * Runs the interactive guided setup: inspect, baseline plan, setup plan,
 * typed approval, apply, and a final report offer. The caller must confirm
 * the session is attached to an interactive terminal before invoking this.
 */
export async function runGuidedSetup(
  options: GuidedSetupOptions,
): Promise<void> {
  const { io } = options;
  const write = (text: string) => void io.output.write(text);
  const prompter: Prompter = createInterface({
    input: io.input,
    output: io.output,
  });
  try {
    write("Usermaven guided setup\n\n");
    const inspection = await inspectProject(options.projectRoot);
    write(
      `Detected framework: ${inspection.project.framework} (package manager: ${inspection.project.package_manager})\n`,
    );
    if (!SETUP_SUPPORTED_FRAMEWORKS.has(inspection.project.framework)) {
      const detected =
        inspection.unsupported_frameworks.length > 0
          ? inspection.unsupported_frameworks.join(", ")
          : inspection.project.framework;
      write(
        `Generated setup does not support ${detected} yet.\n` +
          "Run `usermaven-wizard doctor` for diagnostics, or install the SDK manually: https://usermaven.com/docs\n",
      );
      process.exitCode = 1;
      return;
    }

    const workflow = await startGuidedSetup(options.projectRoot);
    const workflowId = workflow.checkpoint.workflow_id;
    const trackingPlanPath = workflow.default_artifacts.tracking_plan;
    const inputsDirectory = trackingPlanPath.split("/").slice(0, -1).join("/");
    const setupPlanPath = `${inputsDirectory}/setup-plan.json`;
    const approvalPath = `${inputsDirectory}/approval.json`;
    const applyResultPath = `${inputsDirectory}/apply-result.json`;
    const writePrivateArtifact = async (path: string, value: unknown) => {
      await writeFile(
        join(options.projectRoot, path),
        JSON.stringify(value, null, 2),
        { flag: "wx", mode: 0o600 },
      );
    };

    let selectedWorkspace: WorkspaceSummary | null = null;
    let workspaceClient: WorkspaceApiClient | null = null;
    let workspaceAuth: ApiAuth | null = null;
    const credentials = await loadCredentials();
    if (credentials) {
      try {
        const client = new WorkspaceApiClient({
          baseUrl: credentials.base_url,
        });
        const auth = toApiAuth(credentials);
        const workspaces = await client.listWorkspaces(auth);
        if (workspaces.length > 0) {
          const choices = workspaces.slice(0, 9);
          write("\nSigned in to Usermaven — choose a workspace:\n");
          for (const [index, workspace] of choices.entries()) {
            write(
              `  ${index + 1}. ${workspace.name} (${workspace.identifier})\n`,
            );
          }
          write("  0. Enter workspace details manually\n");
          const answer = (await prompter.question("Workspace [1]: ")).trim();
          const choice = answer === "" ? 1 : Number.parseInt(answer, 10);
          if (
            Number.isInteger(choice) &&
            choice >= 1 &&
            choice <= choices.length
          ) {
            selectedWorkspace = choices[choice - 1]!;
            workspaceClient = client;
            workspaceAuth = auth;
          }
        }
      } catch {
        write(
          "Could not load your workspaces (session may have expired); continuing with manual entry.\n",
        );
      }
    }

    let displayName: string;
    let region = "us";
    let trackingHost: string;
    let fingerprint: string;
    if (selectedWorkspace) {
      displayName = selectedWorkspace.name;
      trackingHost = selectedWorkspace.trackingHost;
      fingerprint = fingerprintWorkspaceKey(selectedWorkspace.identifier);
      write(
        `Using workspace "${selectedWorkspace.name}" (tracking host ${trackingHost}).\n`,
      );
    } else {
      write("\nYour workspace details (Usermaven → Workspace settings):\n");
      displayName = await promptWithDefault(prompter, "Workspace name");
      region = await promptWithDefault(prompter, "Region (us/eu)", "us");
      trackingHost = await promptWithDefault(
        prompter,
        "Tracking host",
        DEFAULT_TRACKING_HOST,
      );
      fingerprint = await promptFingerprint(prompter, write);
    }

    const trackingPlan = createBaselineTrackingPlan({ inspection });
    await writePrivateArtifact(trackingPlanPath, trackingPlan);
    await saveWorkflowCheckpoint({
      projectRoot: options.projectRoot,
      workflowId,
      completedStep: "tracking_plan_created",
      artifactPaths: { tracking_plan: trackingPlanPath },
    });
    write(
      "\nUsing the baseline tracking plan: automatic page views only.\n" +
        "Custom events can be added later — see docs/ai-tracking-plans.md.\n",
    );

    const plan = await generateSetupPlan({
      projectRoot: options.projectRoot,
      trackingPlan,
      workspace: {
        display_name: displayName,
        region,
        public_key_fingerprint: fingerprint,
        tracking_host: trackingHost,
      },
    });
    await storeSetupPlanArtifact(options.projectRoot, plan);
    await writePrivateArtifact(setupPlanPath, plan);
    await saveWorkflowCheckpoint({
      projectRoot: options.projectRoot,
      workflowId,
      completedStep: "setup_plan_created",
      artifactPaths: {
        tracking_plan: trackingPlanPath,
        setup_plan: setupPlanPath,
      },
    });

    write(`\nPlanned operations:\n${summarizeOperations(plan)}\n`);
    const approvalIds = plan.operations
      .filter((operation) => operation.requires_approval)
      .map((operation) => operation.id);
    if (approvalIds.length === 0) {
      write("Nothing requires approval; review the manual steps above.\n");
      return;
    }

    const digest = digestSetupPlan(plan);
    const expected = approvalConfirmation(digest, approvalIds);
    write(
      `\nApproving will apply exactly these operations:\n${approvalIds
        .map((id) => `  - ${id}`)
        .join("\n")}\n\nType exactly:\n${expected}\n\n`,
    );
    const answer = await prompter.question("> ");
    if (answer !== expected) {
      throw new Error(
        "Approval confirmation did not match; nothing was applied",
      );
    }
    const approval = await createChangeApproval(
      {
        plan,
        projectRoot: options.projectRoot,
        operationIds: approvalIds,
        confirmedByInteractiveUser: true,
      },
      { ttlMs: (options.approvalTtlMinutes ?? 15) * 60 * 1_000 },
    );
    await storeChangeApproval(options.projectRoot, approval);
    await writePrivateArtifact(approvalPath, approval);
    await saveWorkflowCheckpoint({
      projectRoot: options.projectRoot,
      workflowId,
      completedStep: "approval_created",
      artifactPaths: {
        tracking_plan: trackingPlanPath,
        setup_plan: setupPlanPath,
        approval: approvalPath,
      },
    });

    write("\nApplying approved operations…\n");
    const applyResult = await applyChanges({
      projectRoot: options.projectRoot,
      plan,
      approval,
    });
    await writePrivateArtifact(applyResultPath, applyResult);
    await saveWorkflowCheckpoint({
      projectRoot: options.projectRoot,
      workflowId,
      completedStep: "apply_completed",
      artifactPaths: {
        tracking_plan: trackingPlanPath,
        setup_plan: setupPlanPath,
        apply_result: applyResultPath,
      },
    });
    write(`Apply outcome: ${applyResult.outcome}\n`);
    if (applyResult.outcome !== "succeeded") {
      write(
        "Review the operations output above and run `usermaven-wizard doctor` before retrying.\n",
      );
      process.exitCode = 1;
      return;
    }

    const keyEnvVar = plan.workspace.key_env_var ?? "USERMAVEN_PUBLIC_KEY";
    const hostEnvVar =
      plan.workspace.tracking_host_env_var ?? "USERMAVEN_TRACKING_HOST";
    write(
      `\nDone. Before starting the app, set your environment values in .env.local:\n` +
        `  ${keyEnvVar}=${selectedWorkspace?.identifier ?? "<your workspace public key>"}\n` +
        `  ${hostEnvVar}=${plan.workspace.tracking_host}\n\n` +
        "The wizard never writes environment values; add them yourself and keep\n" +
        "populated env files out of version control.\n",
    );

    if (selectedWorkspace && workspaceClient && workspaceAuth) {
      const dashboardAnswer = (
        await prompter.question(
          `Create a "${STARTER_DASHBOARD_NAME}" dashboard in "${selectedWorkspace.name}"? (y/N) `,
        )
      )
        .trim()
        .toLowerCase();
      if (dashboardAnswer === "y" || dashboardAnswer === "yes") {
        try {
          const existing = await workspaceClient.listDashboardNames(
            workspaceAuth,
            selectedWorkspace.id,
          );
          if (existing.includes(STARTER_DASHBOARD_NAME)) {
            write(
              `A "${STARTER_DASHBOARD_NAME}" dashboard already exists; skipping.\n`,
            );
          } else {
            const created = await workspaceClient.createStarterDashboard(
              workspaceAuth,
              selectedWorkspace.id,
              {
                dashboardName: STARTER_DASHBOARD_NAME,
                trends: starterTrends(),
              },
            );
            write(
              `Created dashboard "${created.dashboardName}" with ${created.trendIds.length} charts.\n`,
            );
          }
        } catch (error) {
          write(
            `Could not create the starter dashboard (${
              error instanceof Error ? error.message : "unexpected failure"
            }); you can retry later with \`usermaven-wizard starter-dashboard\`.\n`,
          );
        }
      }
    }

    const reportAnswer = (
      await prompter.question(
        `Write ${REPORT_FILENAME} to the project root? It overwrites any previous report. (y/N) `,
      )
    )
      .trim()
      .toLowerCase();
    if (reportAnswer === "y" || reportAnswer === "yes") {
      const report = buildSetupReport({
        plan,
        applyResult,
        generatedAt: new Date().toISOString(),
      });
      await writeFile(join(options.projectRoot, REPORT_FILENAME), report);
      write(`Wrote ${REPORT_FILENAME}\n`);
    }
    write(
      "\nNext: start the app and confirm events arrive in your Usermaven\n" +
        "workspace, then see docs/deployment.md before shipping to production.\n",
    );
  } finally {
    prompter.close();
  }
}
