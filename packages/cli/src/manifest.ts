import {
  WIZARD_VERSION,
  wizardManifestSchema,
  type WizardManifest,
} from "@usermaven/wizard-schemas";

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
    readOnly("doctor", "Diagnose configuration and connectivity problems."),
    readOnly(
      "manifest",
      "Print this machine-readable command manifest.",
      "implemented",
    ),
  ],
  local_mcp_tools: [
    readOnly(
      "inspect_project",
      "Inspect the local project and return normalized facts.",
      "implemented",
    ),
    localState(
      "checkpoint_workflow",
      "Persist bounded workflow metadata and artifact digests.",
    ),
    readOnly(
      "resume_workflow",
      "Validate checkpoint recovery state and return the next action.",
      "implemented",
    ),
    readOnly(
      "propose_tracking_plan",
      "Propose versioned identity, event, and property contracts.",
      "implemented",
    ),
    localState(
      "generate_setup_plan",
      "Create approval-ready SDK and source-aware AI instrumentation operations.",
    ),
    readOnly(
      "preview_changes",
      "Render proposed repository changes without applying them.",
      "implemented",
    ),
    mutating(
      "apply_changes",
      "Apply only the operations covered by explicit approval.",
      "implemented",
    ),
    readOnly(
      "prepare_verification",
      "Create a short-lived marker session for evidence collection.",
      "implemented",
    ),
    readOnly(
      "verify_setup",
      "Verify setup without returning raw analytics payloads.",
      "implemented",
    ),
    readOnly("doctor", "Return normalized local diagnostics."),
  ],
});
