import {
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
) => ({
  name,
  description,
  mutates_repository: true,
  requires_approval: true,
  agent_safe: true,
  availability,
});

export const manifest: WizardManifest = wizardManifestSchema.parse({
  schema_version: "1",
  product: "@usermaven/wizard",
  version: "0.4.0",
  node: ">=20",
  commands: [
    readOnly(
      "inspect",
      "Detect the framework and existing analytics instrumentation.",
      "implemented",
    ),
    readOnly(
      "plan",
      "Generate a deterministic baseline tracking plan without changing files.",
      "implemented",
    ),
    mutating("apply", "Apply explicitly approved package and file operations."),
    readOnly("verify", "Run static, runtime, transport, and receipt checks."),
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
    readOnly(
      "propose_tracking_plan",
      "Propose versioned identity, event, and property contracts.",
      "implemented",
    ),
    readOnly("generate_setup_plan", "Create an approval-ready setup plan."),
    readOnly(
      "preview_changes",
      "Render proposed repository changes without applying them.",
    ),
    mutating(
      "apply_changes",
      "Apply only the operations covered by explicit approval.",
    ),
    readOnly(
      "verify_setup",
      "Verify setup without returning raw analytics payloads.",
    ),
    readOnly("doctor", "Return normalized local diagnostics."),
  ],
});
