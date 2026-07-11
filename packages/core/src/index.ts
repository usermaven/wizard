export { inspectProject, type InspectProjectOptions } from "./inspector.js";
export { previewChanges } from "./change-preview.js";
export {
  approvalConfirmation,
  createChangeApproval,
  digestSetupPlan,
  fingerprintRepositoryRoot,
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
  type CreateVerificationSessionInput,
  type CreateVerificationSessionOptions,
  type VerifySetupInput,
  type VerifySetupOptions,
} from "./verify.js";
