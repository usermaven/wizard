import { z } from "zod";

import { schemaVersion } from "./common.js";

export const commandManifestItemSchema = z
  .object({
    name: z.string().min(1).max(128),
    description: z.string().min(1).max(1_000),
    mutates_repository: z.boolean(),
    requires_approval: z.boolean(),
    agent_safe: z.boolean(),
    availability: z.enum(["implemented", "planned"]).optional(),
  })
  .strict();

export const wizardManifestSchema = z
  .object({
    schema_version: schemaVersion,
    product: z.literal("@usermaven/wizard"),
    version: z.string().min(1).max(64),
    node: z.string().min(1).max(64),
    commands: z.array(commandManifestItemSchema),
    local_mcp_tools: z.array(commandManifestItemSchema),
  })
  .strict();

export type WizardManifest = z.infer<typeof wizardManifestSchema>;
