import { z } from "zod";

import { isoDateTime, relativePath, schemaVersion } from "./common.js";
import { trackingPlanSchema } from "./tracking-plan.js";

const operationBase = z.object({
  id: z.string().min(1).max(128),
  summary: z.string().min(1).max(2_000),
});

export const operationSchema = z.discriminatedUnion("type", [
  operationBase
    .extend({
      type: z.literal("install_package"),
      package_name: z
        .string()
        .min(1)
        .max(214)
        .regex(/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/iu),
      version_range: z
        .string()
        .min(1)
        .max(64)
        .regex(/^[a-z0-9.*+^~<>=| -]+$/iu),
      dev: z.boolean().default(false),
      requires_approval: z.literal(true),
    })
    .strict(),
  operationBase
    .extend({
      type: z.literal("edit_file"),
      path: relativePath,
      before_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
      unified_diff: z.string().min(1).max(500_000),
      requires_approval: z.literal(true),
    })
    .strict(),
  operationBase
    .extend({
      type: z.literal("create_file"),
      path: relativePath,
      content: z.string().max(500_000),
      requires_approval: z.literal(true),
    })
    .strict(),
  operationBase
    .extend({
      type: z.literal("manual_step"),
      instructions: z.string().min(1).max(10_000),
      requires_approval: z.literal(false),
    })
    .strict(),
  operationBase
    .extend({
      type: z.literal("run_check"),
      check_id: z.string().min(1).max(128),
      command: z.string().min(1).max(2_000),
      requires_approval: z.boolean(),
    })
    .strict(),
]);

export const plannedCheckSchema = z
  .object({
    id: z.string().min(1).max(128),
    layer: z.enum(["static", "runtime", "transport", "workspace_receipt"]),
    description: z.string().min(1).max(2_000),
    required: z.boolean(),
  })
  .strict();

export const workspacePublicConfigSchema = z
  .object({
    display_name: z.string().min(1).max(255),
    region: z.string().min(1).max(32),
    public_key_fingerprint: z.string().startsWith("sha256:").max(128),
    tracking_host: z
      .url()
      .max(2_000)
      .refine(
        (value) =>
          /^https:\/\//iu.test(value) ||
          /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/iu.test(
            value,
          ),
        "tracking_host must use HTTPS unless it is a loopback development host",
      ),
    key_env_var: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]*$/u)
      .max(128)
      .optional(),
    tracking_host_env_var: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]*$/u)
      .max(128)
      .optional(),
  })
  .strict();

export const setupPlanSchema = z
  .object({
    schema_version: schemaVersion,
    plan_id: z.string().min(8).max(128),
    workspace: workspacePublicConfigSchema,
    project: z
      .object({
        framework: z.string().min(1).max(128),
        package_manager: z.enum(["npm", "pnpm", "yarn", "bun", "none"]),
        confidence: z.number().min(0).max(1),
      })
      .strict(),
    operations: z.array(operationSchema).max(100),
    tracking_plan: trackingPlanSchema,
    checks: z.array(plannedCheckSchema).max(100),
    risks: z.array(z.string().min(1).max(2_000)).max(100),
    created_at: isoDateTime,
    wizard_version: z.string().min(1).max(64),
  })
  .strict()
  .superRefine((plan, context) => {
    const ids = plan.operations.map((operation) => operation.id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        message: "operation IDs must be unique",
        path: ["operations"],
      });
    }
  });

export type SetupOperation = z.infer<typeof operationSchema>;
export type SetupPlan = z.infer<typeof setupPlanSchema>;
export type WorkspacePublicConfig = z.infer<typeof workspacePublicConfigSchema>;
