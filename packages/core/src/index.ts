export { inspectProject, type InspectProjectOptions } from "./inspector.js";
export { previewChanges } from "./change-preview.js";
export { loadSetupPlanArtifact, storeSetupPlanArtifact } from "./artifact.js";
export { canonicalJson, canonicalJsonDigest } from "./canonical.js";
export {
  approvalConfirmation,
  createChangeApproval,
  digestSetupPlan,
  fingerprintApprovalContext,
  fingerprintRepositoryRoot,
  loadChangeApproval,
  storeChangeApproval,
  verifyChangeApproval,
  type CreateChangeApprovalInput,
  type CreateChangeApprovalOptions,
} from "./approval.js";
export {
  applyChanges,
  type ApplyChangesInput,
  type ApplyChangesOptions,
  type CommandRunner,
  type CommandSpec,
} from "./apply.js";
export {
  generateSetupPlan,
  type GenerateSetupPlanInput,
  type GenerateSetupPlanOptions,
} from "./setup-plan.js";
export {
  createAiTrackingPlan,
  type CreateAiTrackingPlanInput,
  type CreateAiTrackingPlanOptions,
} from "./tracking-plan.js";
export {
  createVerificationSession,
  verifySetup,
  workspaceReceiptAttestationPayload,
  type CreateVerificationSessionInput,
  type CreateVerificationSessionOptions,
  type VerifySetupInput,
  type VerifySetupOptions,
} from "./verify.js";
export {
  resumeWorkflow,
  saveWorkflowCheckpoint,
  type SaveWorkflowCheckpointInput,
  type WorkflowOptions,
} from "./workflow.js";
