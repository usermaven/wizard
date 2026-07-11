import {
  WIZARD_VERSION,
  wizardManifestSchema,
  type WizardManifest,
} from "@usermaven/wizard-schemas";

export const MCP_TOOLS = {
  inspectProject: "inspect_project",
  checkpointWorkflow: "checkpoint_workflow",
  resumeWorkflow: "resume_workflow",
  proposeTrackingPlan: "propose_tracking_plan",
  generateSetupPlan: "generate_setup_plan",
  previewChanges: "preview_changes",
  applyChanges: "apply_changes",
  prepareVerification: "prepare_verification",
  verifySetup: "verify_setup",
} as const;

const readOnly = (
  name: string,
  description: string,
  availability: "implemented" | "planned" = "planned",
) => ({
  name,
  description,
  mutates_repository: false,
  requires_approval: false,
  agent_safe: true,
  availability,
});

const mutating = (
  name: string,
  description: string,
  availability: "implemented" | "planned" = "planned",
  agentSafe = true,
) => ({
  name,
  description,
  mutates_repository: true,
  requires_approval: true,
  agent_safe: agentSafe,
  availability,
});

const localState = (name: string, description: string, agentSafe = true) => ({
  name,
  description,
  mutates_repository: false,
  mutates_local_state: true,
  requires_approval: false,
  agent_safe: agentSafe,
  availability: "implemented" as const,
});

export const manifest: WizardManifest = wizardManifestSchema.parse({
  schema_version: "1",
  product: "@usermaven/wizard",
  version: WIZARD_VERSION,
  node: ">=20",
  commands: [
    readOnly(
      "inspect",
      "Detect the framework and existing analytics instrumentation.",
      "implemented",
    ),
    readOnly(
      "plan",
      "Validate and stamp an AI-generated tracking plan without changing files.",
      "implemented",
    ),
    localState(
      "setup-plan",
      "Generate approval-ready SDK and AI instrumentation operations without changing files.",
    ),
    readOnly(
      "preview",
      "Render a saved setup plan without executing its operations.",
      "implemented",
    ),
    localState(
      "approve",
      "Interactively approve exact setup-plan operations and create an expiring artifact.",
      false,
    ),
    mutating(
      "apply",
      "Apply explicitly approved package and file operations.",
      "implemented",
    ),
    readOnly(
      "verification-session",
      "Create a short-lived marker session for one setup plan and environment.",
      "implemented",
    ),
    readOnly(
      "verify",
      "Run static, runtime, transport, and receipt checks without raw payloads.",
      "implemented",
    ),
    localState(
      "checkpoint",
      "Persist digest-bound setup workflow progress in private local state.",
    ),
    readOnly(
      "resume",
      "Validate workflow state and return one deterministic next action.",
      "implemented",
    ),
    localState(
      "setup",
      "Inspect a project, start a private workflow, and return the exact next action.",
    ),
    readOnly(
      "next",
      "Validate workflow state and print the exact next command.",
      "implemented",
    ),
    readOnly(
      "apply-lock",
      "Inspect one apply lock, owning-process state, and safe recovery eligibility.",
      "implemented",
    ),
    localState(
      "recover-lock",
      "Convert a stale orphaned apply lock into a terminal consumed record without replaying it.",
      false,
    ),
    readOnly("doctor", "Diagnose configuration and connectivity problems."),
    readOnly(
      "manifest",
      "Print this machine-readable command manifest.",
      "implemented",
    ),
  ],
  local_mcp_tools: [
    readOnly(
      MCP_TOOLS.inspectProject,
      "Inspect the local project and return normalized facts.",
      "implemented",
    ),
    localState(
      MCP_TOOLS.checkpointWorkflow,
      "Persist bounded workflow metadata and artifact digests.",
    ),
    readOnly(
      MCP_TOOLS.resumeWorkflow,
      "Validate checkpoint recovery state and return the next action.",
      "implemented",
    ),
    readOnly(
      MCP_TOOLS.proposeTrackingPlan,
      "Propose versioned identity, event, and property contracts.",
      "implemented",
    ),
    localState(
      MCP_TOOLS.generateSetupPlan,
      "Create approval-ready SDK and source-aware AI instrumentation operations.",
    ),
    readOnly(
      MCP_TOOLS.previewChanges,
      "Render proposed repository changes without applying them.",
      "implemented",
    ),
    mutating(
      MCP_TOOLS.applyChanges,
      "Apply only the operations covered by explicit approval.",
      "implemented",
    ),
    readOnly(
      MCP_TOOLS.prepareVerification,
      "Create a short-lived marker session for evidence collection.",
      "implemented",
    ),
    readOnly(
      MCP_TOOLS.verifySetup,
      "Verify setup without returning raw analytics payloads.",
      "implemented",
    ),
    readOnly("doctor", "Return normalized local diagnostics."),
  ],
});
