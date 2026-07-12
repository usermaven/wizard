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
  inspectApplyLock,
  recoverStaleApplyLock,
  type ApplyLockOptions,
  type ApplyLockStatus,
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
  createBaselineTrackingPlan,
  type CreateAiTrackingPlanInput,
  type CreateAiTrackingPlanOptions,
  type CreateBaselineTrackingPlanInput,
} from "./tracking-plan.js";
export {
  runDoctor,
  type RunDoctorInput,
  type RunDoctorOptions,
} from "./doctor.js";
export {
  planUninstall,
  type PlanUninstallInput,
  type PlanUninstallOptions,
} from "./uninstall.js";
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
  startGuidedSetup,
  type SaveWorkflowCheckpointInput,
  type WorkflowOptions,
} from "./workflow.js";
