import {
  changePreviewSchema,
  setupPlanSchema,
  type ChangePreview,
  type SetupPlan,
} from "@usermaven/wizard-schemas";

function installPreview(
  plan: SetupPlan,
  operation: Extract<
    SetupPlan["operations"][number],
    { type: "install_package" }
  >,
): string {
  const dependency = `${operation.package_name}@${operation.version_range}`;
  switch (plan.project.package_manager) {
    case "npm":
      return `npm install ${operation.dev ? "--save-dev " : ""}${dependency}`;
    case "pnpm":
      return `pnpm add ${operation.dev ? "--save-dev " : ""}${dependency}`;
    case "yarn":
      return `yarn add ${operation.dev ? "--dev " : ""}${dependency}`;
    case "bun":
      return `bun add ${operation.dev ? "--dev " : ""}${dependency}`;
    default:
      return `Install ${dependency} as a ${operation.dev ? "development" : "production"} dependency`;
  }
}

export function previewChanges(input: SetupPlan): ChangePreview {
  const plan = setupPlanSchema.parse(input);
  const items: ChangePreview["items"] = plan.operations.map((operation) => {
    switch (operation.type) {
      case "install_package":
        return {
          operation_id: operation.id,
          type: operation.type,
          summary: operation.summary,
          path: null,
          preview: installPreview(plan, operation),
          requires_approval: operation.requires_approval,
          contains_repository_source: false,
        };
      case "edit_file":
        return {
          operation_id: operation.id,
          type: operation.type,
          summary: operation.summary,
          path: operation.path,
          preview: operation.unified_diff,
          requires_approval: operation.requires_approval,
          contains_repository_source: true,
        };
      case "create_file":
        return {
          operation_id: operation.id,
          type: operation.type,
          summary: operation.summary,
          path: operation.path,
          preview: operation.content,
          requires_approval: operation.requires_approval,
          contains_repository_source: false,
        };
      case "manual_step":
        return {
          operation_id: operation.id,
          type: operation.type,
          summary: operation.summary,
          path: null,
          preview: operation.instructions,
          requires_approval: operation.requires_approval,
          contains_repository_source: false,
        };
      case "run_check":
        return {
          operation_id: operation.id,
          type: operation.type,
          summary: operation.summary,
          path: null,
          preview: operation.command,
          requires_approval: operation.requires_approval,
          contains_repository_source: false,
        };
    }
  });
  const mutations = items.filter((item) =>
    ["install_package", "edit_file", "create_file"].includes(item.type),
  ).length;
  const includesSource = items.some((item) => item.contains_repository_source);

  return changePreviewSchema.parse({
    schema_version: "1",
    plan_id: plan.plan_id,
    items,
    summary: {
      total: items.length,
      mutations,
      manual_steps: items.filter((item) => item.type === "manual_step").length,
      checks: items.filter((item) => item.type === "run_check").length,
    },
    warnings: [
      "Preview only: no package, file, command, or environment operation was executed.",
      "Mutation operations still require explicit approval before a future apply tool may execute them.",
      ...(includesSource
        ? [
            "Edit previews may contain repository source context and must remain local.",
          ]
        : []),
    ],
  });
}
