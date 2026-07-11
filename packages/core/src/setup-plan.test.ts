import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  setupPlanSchema,
  trackingPlanSchema,
  type AiInstrumentationProposal,
} from "@usermaven/wizard-schemas";
import { afterEach, describe, expect, it } from "vitest";
import { applyPatch } from "diff";
import { JsxEmit, ModuleKind, ScriptTarget, transpileModule } from "typescript";

import { previewChanges } from "./change-preview.js";
import { generateSetupPlan } from "./setup-plan.js";

const fixtures = fileURLToPath(new URL("../../../fixtures/", import.meta.url));
const temporaryRoots: string[] = [];
const now = () => new Date("2026-07-11T14:00:00Z");
const options = {
  now,
  idFactory: () => "setup-test-1234",
};
const workspace = {
  display_name: "Example workspace",
  region: "us",
  public_key_fingerprint: "sha256:abcdef1234567890",
  tracking_host: "https://events.example.com",
};
const trackingPlan = trackingPlanSchema.parse({
  schema_version: "1",
  plan_id: "plan_ai-test-1234",
  identity: [
    {
      kind: "user",
      identifier: "user_id",
      trigger: { description: "After authentication", runtime: "client" },
      properties: [],
      status: "proposed",
      proposal: {
        confidence: 0.8,
        rationale: ["Measure signed-in activation"],
        review_required: true,
      },
    },
  ],
  events: [
    {
      id: "link-created",
      event_name: "link_created",
      description: "A link was created",
      business_question: "Do users activate?",
      category: "activation",
      trigger: { description: "After API confirmation", runtime: "server" },
      properties: [],
      pii: "none",
      authority: "server",
      deduplication_key: "link_id",
      owner: "growth",
      status: "proposed",
      revenue: false,
      proposal: {
        confidence: 0.8,
        rationale: ["Core activation journey"],
        review_required: true,
      },
    },
  ],
  shared_properties: [],
  proposal: {
    mode: "ai_generated",
    review_required: true,
    generated_by: {
      provider: "test",
      model: "test-model",
      prompt_version: "ai-tracking-plan-v1",
    },
    business_context_digest: `sha256:${"a".repeat(64)}`,
    assumptions: [],
    warnings: [],
    source: {
      framework: "react-vite",
      inspected_at: "2026-07-11T12:00:00Z",
      inspection_truncated: false,
    },
  },
  created_at: "2026-07-11T13:00:00Z",
  wizard_version: "0.9.0",
});
function instrumentationProposal(
  plan = trackingPlan,
  path = "src/generated-usermaven-tracking.ts",
): AiInstrumentationProposal {
  return {
    schema_version: "1" as const,
    tracking_plan_id: plan.plan_id,
    changes: [
      {
        id: "generate-tracking-hooks",
        type: "create_file" as const,
        summary: "Create reviewed Usermaven tracking hooks",
        path,
        content: 'export const trackingEvents = ["link_created"] as const;\n',
        covers: [
          {
            kind: "identity" as const,
            identity_kind: "user" as const,
            identifier: "user_id",
          },
          { kind: "event" as const, event_id: "link-created" },
        ],
      },
    ],
    deferred: [],
    warnings: [],
    generated_by: { provider: "test", model: "test-coding-model" },
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

describe("generateSetupPlan", () => {
  it("generates an approval-ready React/Vite plan without a key value", async () => {
    const plan = await generateSetupPlan(
      {
        projectRoot: join(fixtures, "react-vite"),
        workspace,
        trackingPlan,
        instrumentationProposal: instrumentationProposal(),
      },
      options,
    );

    expect(setupPlanSchema.safeParse(plan).success).toBe(true);
    expect(plan.workspace.key_env_var).toBe("VITE_USERMAVEN_KEY");
    expect(plan.operations.map((operation) => operation.type)).toEqual([
      "install_package",
      "create_file",
      "edit_file",
      "manual_step",
      "create_file",
      "run_check",
    ]);
    expect(
      plan.operations.find((operation) => operation.type === "create_file"),
    ).toMatchObject({
      path: "src/usermaven.ts",
      requires_approval: true,
    });
    const serialized = JSON.stringify(plan);
    expect(serialized).toContain("VITE_USERMAVEN_KEY");
    expect(serialized).not.toContain("actual-workspace-key");
    expect(
      plan.operations.filter((operation) => operation.requires_approval),
    ).toHaveLength(5);
    expect(plan.instrumentation?.generated_by.model).toBe("test-coding-model");
    expect(plan.instrumentation?.coverage).toEqual([
      expect.objectContaining({
        operation_id: "instrument-generate-tracking-hooks",
        items: expect.arrayContaining([
          { kind: "event", event_id: "link-created" },
        ]),
      }),
    ]);
    const client = plan.operations.find(
      (operation) =>
        operation.type === "create_file" &&
        operation.path === "src/usermaven.ts",
    );
    const wiring = plan.operations.find(
      (operation) => operation.id === "wire-usermaven-entry",
    );
    expect(client && "content" in client ? client.content : "").toContain(
      "autoPageview: true",
    );
    expect(wiring).toMatchObject({
      type: "edit_file",
      path: "src/main.jsx",
    });
    const entrySource = await readFile(
      join(fixtures, "react-vite", "src", "main.jsx"),
      "utf8",
    );
    const wired =
      wiring?.type === "edit_file"
        ? applyPatch(entrySource, wiring.unified_diff)
        : false;
    expect(wired).not.toBe(false);
    expect(wired).toContain('import "./usermaven";');
    const compilation = transpileModule(
      client && "content" in client ? client.content : "",
      {
        compilerOptions: {
          target: ScriptTarget.ES2022,
          module: ModuleKind.ESNext,
          jsx: JsxEmit.ReactJSX,
        },
        reportDiagnostics: true,
      },
    );
    expect(compilation.diagnostics ?? []).toEqual([]);
  });

  it("uses Next.js public environment names and an App Router target", async () => {
    const nextTrackingPlan = trackingPlanSchema.parse({
      ...trackingPlan,
      proposal: {
        ...trackingPlan.proposal,
        source: {
          ...trackingPlan.proposal!.source,
          framework: "next-app-router",
        },
      },
    });
    const plan = await generateSetupPlan(
      {
        projectRoot: join(fixtures, "next-app-router"),
        workspace,
        trackingPlan: nextTrackingPlan,
        instrumentationProposal: instrumentationProposal(
          nextTrackingPlan,
          "app/generated-usermaven-tracking.ts",
        ),
      },
      options,
    );
    const create = plan.operations.find(
      (operation) => operation.type === "create_file",
    );

    expect(plan.workspace.key_env_var).toBe("NEXT_PUBLIC_USERMAVEN_KEY");
    expect(create).toMatchObject({ path: "app/usermaven-provider.tsx" });
    expect(create && "content" in create ? create.content : "").toContain(
      '"use client"',
    );
    expect(plan.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "wire-usermaven-layout",
          type: "edit_file",
          path: "app/layout.jsx",
        }),
      ]),
    );
  });

  it("wires a Next.js src App Router layout with exact file binding", async () => {
    const nextTrackingPlan = trackingPlanSchema.parse({
      ...trackingPlan,
      proposal: {
        ...trackingPlan.proposal,
        source: {
          ...trackingPlan.proposal!.source,
          framework: "next-app-router",
        },
      },
    });
    const plan = await generateSetupPlan(
      {
        projectRoot: join(fixtures, "next-src-app-router"),
        workspace,
        trackingPlan: nextTrackingPlan,
        instrumentationProposal: instrumentationProposal(
          nextTrackingPlan,
          "src/app/generated-usermaven-tracking.ts",
        ),
      },
      options,
    );

    expect(plan.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "create-usermaven-client",
          type: "create_file",
          path: "src/app/usermaven-provider.tsx",
        }),
        expect.objectContaining({
          id: "wire-usermaven-layout",
          type: "edit_file",
          path: "src/app/layout.tsx",
          before_hash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
        }),
      ]),
    );
    expect(JSON.stringify(plan)).toContain("<UsermavenBootstrap />");
    const wiring = plan.operations.find(
      (operation) => operation.id === "wire-usermaven-layout",
    );
    const layout = await readFile(
      join(fixtures, "next-src-app-router", "src", "app", "layout.tsx"),
      "utf8",
    );
    const wired =
      wiring?.type === "edit_file"
        ? applyPatch(layout, wiring.unified_diff)
        : false;
    expect(wired).not.toBe(false);
    expect(wired).toContain("<UsermavenBootstrap />");
    expect(
      transpileModule(typeof wired === "string" ? wired : "", {
        compilerOptions: {
          target: ScriptTarget.ES2022,
          module: ModuleKind.ESNext,
          jsx: JsxEmit.ReactJSX,
        },
        reportDiagnostics: true,
      }).diagnostics ?? [],
    ).toEqual([]);
  });

  it("refuses unsupported generic React projects", async () => {
    const root = await mkdtemp(join(tmpdir(), "wizard-unsupported-"));
    temporaryRoots.push(root);
    await mkdir(join(root, "src"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ dependencies: { react: "19.2.7" } }),
    );

    await expect(
      generateSetupPlan({
        projectRoot: root,
        workspace,
        trackingPlan,
        instrumentationProposal: instrumentationProposal(),
      }),
    ).rejects.toThrow("Unsupported framework for browser setup: react");
  });

  it("never overwrites an existing target", async () => {
    const root = await mkdtemp(join(tmpdir(), "wizard-setup-"));
    temporaryRoots.push(root);
    await mkdir(join(root, "src"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ dependencies: { react: "19.2.7", vite: "8.1.4" } }),
    );
    await writeFile(
      join(root, "src", "usermaven.ts"),
      "private customer source",
    );
    await writeFile(join(root, "src", "main.ts"), "export {};\n");

    const plan = await generateSetupPlan(
      {
        projectRoot: root,
        workspace,
        trackingPlan,
        instrumentationProposal: instrumentationProposal(),
      },
      options,
    );

    expect(
      plan.operations.some(
        (operation) =>
          operation.type === "create_file" &&
          operation.path === "src/usermaven.ts",
      ),
    ).toBe(false);
    expect(plan.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "review-existing-client-file",
          type: "manual_step",
        }),
      ]),
    );
    expect(JSON.stringify(plan)).not.toContain("private customer source");
  });

  it("rejects workspace objects containing a raw key", async () => {
    await expect(
      generateSetupPlan(
        {
          projectRoot: join(fixtures, "react-vite"),
          trackingPlan,
          instrumentationProposal: instrumentationProposal(),
          workspace: {
            ...workspace,
            key: "actual-workspace-key",
          } as typeof workspace,
        },
        options,
      ),
    ).rejects.toThrow();
  });

  it("rejects a remote plaintext tracking host", async () => {
    await expect(
      generateSetupPlan(
        {
          projectRoot: join(fixtures, "react-vite"),
          trackingPlan,
          instrumentationProposal: instrumentationProposal(),
          workspace: {
            ...workspace,
            tracking_host: "http://events.example.com",
          },
        },
        options,
      ),
    ).rejects.toThrow("tracking_host must use HTTPS");
  });

  it("rejects legacy deterministic plans for new setup generation", async () => {
    const legacy = trackingPlanSchema.parse({
      ...trackingPlan,
      proposal: {
        ...trackingPlan.proposal,
        mode: "deterministic_baseline",
        generated_by: undefined,
        business_context_digest: undefined,
      },
    });

    await expect(
      generateSetupPlan(
        {
          projectRoot: join(fixtures, "react-vite"),
          workspace,
          trackingPlan: legacy,
          instrumentationProposal: instrumentationProposal(legacy),
        },
        options,
      ),
    ).rejects.toThrow("requires an AI-generated tracking plan");
  });

  it("requires every AI tracking item to be implemented or deferred", async () => {
    await expect(
      generateSetupPlan(
        {
          projectRoot: join(fixtures, "react-vite"),
          workspace,
          trackingPlan,
          instrumentationProposal: {
            ...instrumentationProposal(),
            changes: [],
          },
        },
        options,
      ),
    ).rejects.toThrow("implement or explicitly defer every");
  });

  it("rejects stale and protected AI instrumentation targets", async () => {
    const stale = instrumentationProposal();
    stale.changes = [
      {
        id: "edit-main",
        type: "edit_file",
        summary: "Instrument the application entry",
        path: "src/main.jsx",
        before_hash: `sha256:${"0".repeat(64)}`,
        unified_diff:
          "--- a/src/main.jsx\n+++ b/src/main.jsx\n@@ -1 +1 @@\n-old\n+new\n",
        covers: instrumentationProposal().changes[0]!.covers,
      },
    ];
    await expect(
      generateSetupPlan(
        {
          projectRoot: join(fixtures, "react-vite"),
          workspace,
          trackingPlan,
          instrumentationProposal: stale,
        },
        options,
      ),
    ).rejects.toThrow("hash is stale");

    const protectedTarget = instrumentationProposal();
    protectedTarget.changes[0]!.path = ".env.local";
    await expect(
      generateSetupPlan(
        {
          projectRoot: join(fixtures, "react-vite"),
          workspace,
          trackingPlan,
          instrumentationProposal: protectedTarget,
        },
        options,
      ),
    ).rejects.toThrow("protected local path");
  });
});

describe("previewChanges", () => {
  it("renders every operation without executing it", async () => {
    const plan = await generateSetupPlan(
      {
        projectRoot: join(fixtures, "react-vite"),
        workspace,
        trackingPlan,
        instrumentationProposal: instrumentationProposal(),
      },
      options,
    );
    const preview = previewChanges(plan);

    expect(preview.summary).toEqual({
      total: 6,
      mutations: 4,
      manual_steps: 1,
      checks: 1,
    });
    expect(preview.items[0]?.preview).toBe(
      "npm install @usermaven/sdk-js@^1.5.15",
    );
    expect(
      preview.items.find((item) => item.type === "create_file")?.preview,
    ).toContain("usermavenClient");
    expect(
      preview.items.find(
        (item) => item.operation_id === "instrument-generate-tracking-hooks",
      ),
    ).toMatchObject({ contains_repository_source: true });
    expect(preview.warnings.join(" ")).toContain("no package, file, command");
  });
});
