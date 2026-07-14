import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import {
  createHash,
  generateKeyPairSync,
  sign as signPayload,
} from "node:crypto";
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
import { applyChanges } from "./apply.js";
import { createChangeApproval } from "./approval.js";
import { generateSetupPlan } from "./setup-plan.js";
import { inspectProject } from "./inspector.js";
import { createBaselineTrackingPlan } from "./tracking-plan.js";
import {
  createVerificationSession,
  verifySetup,
  workspaceReceiptAttestationPayload,
} from "./verify.js";

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
  it("applies, executes, observes, and verifies a real event on a supported fixture", async () => {
    const root = await mkdtemp(join(tmpdir(), "wizard-runtime-e2e-"));
    temporaryRoots.push(root);
    await cp(join(fixtures, "next-app-router"), root, { recursive: true });
    const requests: Array<{
      event: string;
      properties: Record<string, string>;
    }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_input, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 202 });
    };
    try {
      const trackingHost = "https://collector.test.example";
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
      const proposal = instrumentationProposal(
        nextTrackingPlan,
        "app/generated-usermaven-tracking.ts",
      );
      const runtimeChange = proposal.changes[0]!;
      if (runtimeChange.type !== "create_file")
        throw new Error("Expected runtime fixture create operation");
      runtimeChange.content = `import { usermaven, usermavenVerificationProperties } from "./usermaven-provider";

export async function emitLinkCreated() {
  return usermaven?.track("link_created", usermavenVerificationProperties());
}
`;
      const plan = await generateSetupPlan(
        {
          projectRoot: root,
          workspace: { ...workspace, tracking_host: trackingHost },
          trackingPlan: nextTrackingPlan,
          instrumentationProposal: proposal,
        },
        {
          now: () => new Date("2026-07-11T14:00:00.000Z"),
          idFactory: () => "runtime-e2e-1234",
        },
      );
      const operationIds = plan.operations
        .filter((operation) => operation.requires_approval)
        .map((operation) => operation.id);
      const approval = await createChangeApproval(
        {
          plan,
          projectRoot: root,
          operationIds,
          confirmedByInteractiveUser: true,
        },
        { now: () => new Date("2026-07-11T14:01:00.000Z") },
      );
      const applied = await applyChanges(
        { projectRoot: root, plan, approval },
        {
          now: () => new Date("2026-07-11T14:02:00.000Z"),
          commandRunner: async (command) => {
            if (command.command === "npm" && command.args[0] === "install") {
              const packageJson = JSON.parse(
                await readFile(join(root, "package.json"), "utf8"),
              );
              packageJson.dependencies["@usermaven/sdk-js"] = "1.5.15";
              await writeFile(
                join(root, "package.json"),
                JSON.stringify(packageJson),
              );
              const sdk = join(root, "node_modules", "@usermaven", "sdk-js");
              await mkdir(sdk, { recursive: true });
              await writeFile(
                join(sdk, "package.json"),
                JSON.stringify({
                  name: "@usermaven/sdk-js",
                  version: "1.5.15",
                  type: "module",
                  exports: "./index.js",
                }),
              );
              await writeFile(
                join(sdk, "index.js"),
                `export function usermavenClient({ trackingHost, autoPageview }) {
  const track = (event, properties = {}) => fetch(trackingHost, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event, properties }),
  });
  if (autoPageview) void track("pageview");
  return { track };
}
`,
              );
              return;
            }
            const runtime = join(root, ".runtime-test");
            await mkdir(runtime, { recursive: true });
            for (const [source, target] of [
              ["app/usermaven-provider.tsx", "usermaven-provider.mjs"],
              [
                "app/generated-usermaven-tracking.ts",
                "generated-usermaven-tracking.mjs",
              ],
            ] as const) {
              const compiled = transpileModule(
                await readFile(join(root, source), "utf8"),
                {
                  compilerOptions: {
                    target: ScriptTarget.ES2022,
                    module: ModuleKind.ESNext,
                    jsx: JsxEmit.ReactJSX,
                  },
                  reportDiagnostics: true,
                },
              );
              expect(compiled.diagnostics ?? []).toEqual([]);
              await writeFile(
                join(runtime, target),
                compiled.outputText.replace(
                  '"./usermaven-provider"',
                  '"./usermaven-provider.mjs"',
                ),
              );
            }
          },
        },
      );
      expect(applied.outcome).toBe("succeeded");

      const session = createVerificationSession(
        { plan, environment: "test" },
        {
          now: () => new Date("2026-07-11T14:03:00.000Z"),
          idFactory: () => "runtime-e2e-1234",
        },
      );
      process.env.NEXT_PUBLIC_USERMAVEN_KEY = "public-test-key";
      process.env.NEXT_PUBLIC_USERMAVEN_TRACKING_HOST = trackingHost;
      (globalThis as Record<string, unknown>).__USERMAVEN_VERIFICATION_ID__ =
        session.session_id;
      const runtimeModule = (await import(
        `${join(root, ".runtime-test", "generated-usermaven-tracking.mjs")}?run=${Date.now()}`
      )) as { emitLinkCreated: () => Promise<Response> };
      const collectorResponse = await runtimeModule.emitLinkCreated();
      expect(collectorResponse.status).toBe(202);
      expect(requests).toContainEqual({
        event: "link_created",
        properties: { _usermaven_verification_id: session.session_id },
      });

      const receiptKeys = generateKeyPairSync("ed25519");
      const observedAt = "2026-07-11T14:04:00.000Z";
      const receipt = {
        source: "remote_usermaven_mcp" as const,
        observed_at: observedAt,
        public_key_fingerprint: workspace.public_key_fingerprint,
        event_names: ["link_created"],
        property_names: ["_usermaven_verification_id"],
        identified_user: true,
        identified_company: false,
        verification_marker_matched: true,
        attestation: {
          algorithm: "ed25519" as const,
          key_id: "runtime-e2e",
          signature: "pending",
        },
      };
      receipt.attestation.signature = signPayload(
        null,
        Buffer.from(
          workspaceReceiptAttestationPayload(session.session_id, receipt),
        ),
        receiptKeys.privateKey,
      ).toString("base64url");
      const verified = await verifySetup(
        {
          projectRoot: root,
          plan,
          session,
          evidence: {
            session_id: session.session_id,
            runtime: {
              source: "e2e_test",
              observed_at: observedAt,
              event_names: ["link_created"],
              property_names: ["_usermaven_verification_id"],
              identified_user: true,
              identified_company: false,
              verification_marker_matched: true,
            },
            transport: {
              source: "e2e_test",
              observed_at: observedAt,
              tracking_host: trackingHost,
              accepted: true,
              status_code: collectorResponse.status,
              event_names: ["link_created"],
              verification_marker_matched: true,
            },
            workspace_receipt: receipt,
          },
        },
        {
          now: () => new Date("2026-07-11T14:05:00.000Z"),
          trustedWorkspaceKeys: {
            "runtime-e2e": receiptKeys.publicKey.export({
              type: "spki",
              format: "pem",
            }) as string,
          },
        },
      );
      expect(verified.outcome).toBe("pass");
    } finally {
      delete process.env.NEXT_PUBLIC_USERMAVEN_KEY;
      delete process.env.NEXT_PUBLIC_USERMAVEN_TRACKING_HOST;
      delete (globalThis as Record<string, unknown>)
        .__USERMAVEN_VERIFICATION_ID__;
      globalThis.fetch = originalFetch;
    }
  });

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

  it("wires a Next.js src Pages Router application entry", async () => {
    const nextTrackingPlan = trackingPlanSchema.parse({
      ...trackingPlan,
      proposal: {
        ...trackingPlan.proposal,
        source: {
          ...trackingPlan.proposal!.source,
          framework: "next-pages-router",
        },
      },
    });
    const plan = await generateSetupPlan(
      {
        projectRoot: join(fixtures, "next-src-pages-router"),
        workspace,
        trackingPlan: nextTrackingPlan,
        instrumentationProposal: instrumentationProposal(
          nextTrackingPlan,
          "src/lib/generated-usermaven-tracking.ts",
        ),
      },
      options,
    );

    expect(plan.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "create-usermaven-client",
          path: "src/lib/usermaven-client.ts",
        }),
        expect.objectContaining({
          id: "wire-usermaven-pages-app",
          type: "edit_file",
          path: "src/pages/_app.tsx",
        }),
      ]),
    );
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

  it("rejects baseline plans that carry tracking items", async () => {
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
        },
        options,
      ),
    ).rejects.toThrow("Baseline tracking plans cannot contain tracking items");
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

  it("accepts a generated edit whose hunk body resembles diff headers", async () => {
    const root = await mkdtemp(join(tmpdir(), "wizard-edit-happy-"));
    temporaryRoots.push(root);
    await cp(join(fixtures, "react-vite"), root, { recursive: true });
    const before = "let value = 1;\n-- value;\n";
    await writeFile(join(root, "src", "action.ts"), before);
    const proposal = instrumentationProposal();
    proposal.changes = [
      {
        id: "edit-action",
        type: "edit_file",
        summary: "Instrument the action",
        path: "src/action.ts",
        before_hash: `sha256:${createHash("sha256").update(before).digest("hex")}`,
        unified_diff:
          "--- a/src/action.ts\n+++ b/src/action.ts\n@@ -1,2 +1,2 @@\n let value = 1;\n--- value;\n+++ value;\n",
        covers: instrumentationProposal().changes[0]!.covers,
      },
    ];

    const plan = await generateSetupPlan(
      {
        projectRoot: root,
        workspace,
        trackingPlan,
        instrumentationProposal: proposal,
      },
      options,
    );
    const edit = plan.operations.find(
      (operation) => operation.id === "instrument-edit-action",
    );

    expect(edit).toMatchObject({ type: "edit_file", path: "src/action.ts" });
    expect(
      edit?.type === "edit_file"
        ? applyPatch(before, edit.unified_diff)
        : false,
    ).toBe("let value = 1;\n++ value;\n");
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

describe("generateSetupPlan with a baseline tracking plan", () => {
  it("generates a full deterministic setup without an instrumentation proposal", async () => {
    const root = await mkdtemp(join(tmpdir(), "wizard-baseline-"));
    temporaryRoots.push(root);
    await cp(join(fixtures, "react-vite"), root, { recursive: true });
    const baseline = createBaselineTrackingPlan(
      { inspection: await inspectProject(root) },
      options,
    );

    const plan = await generateSetupPlan(
      { projectRoot: root, workspace, trackingPlan: baseline },
      options,
    );

    expect(setupPlanSchema.parse(plan)).toEqual(plan);
    expect(plan.instrumentation).toBeUndefined();
    expect(plan.operations.map((operation) => operation.id)).toEqual(
      expect.arrayContaining([
        "install-usermaven-sdk",
        "create-usermaven-client",
        "wire-usermaven-entry",
        "configure-public-environment",
      ]),
    );
    expect(
      plan.operations.some((operation) =>
        operation.id.startsWith("instrument-"),
      ),
    ).toBe(false);
  });

  it("omits the wiring operation when the entry point already imports the client", async () => {
    const root = await mkdtemp(join(tmpdir(), "wizard-baseline-rewire-"));
    temporaryRoots.push(root);
    await cp(join(fixtures, "react-vite"), root, { recursive: true });
    const entryPath = join(root, "src", "main.jsx");
    await writeFile(
      entryPath,
      `import "./usermaven";\n${await readFile(entryPath, "utf8")}`,
    );
    const baseline = createBaselineTrackingPlan(
      { inspection: await inspectProject(root) },
      options,
    );

    const plan = await generateSetupPlan(
      { projectRoot: root, workspace, trackingPlan: baseline },
      options,
    );

    expect(
      plan.operations.some(
        (operation) => operation.id === "wire-usermaven-entry",
      ),
    ).toBe(false);
  });

  it("rejects a baseline plan combined with an instrumentation proposal", async () => {
    const root = await mkdtemp(join(tmpdir(), "wizard-baseline-reject-"));
    temporaryRoots.push(root);
    await cp(join(fixtures, "react-vite"), root, { recursive: true });
    const baseline = createBaselineTrackingPlan(
      { inspection: await inspectProject(root) },
      options,
    );

    await expect(
      generateSetupPlan(
        {
          projectRoot: root,
          workspace,
          trackingPlan: baseline,
          instrumentationProposal: {
            ...instrumentationProposal(),
            tracking_plan_id: baseline.plan_id,
          },
        },
        options,
      ),
    ).rejects.toThrow(
      "Baseline tracking plans do not accept an AI instrumentation proposal",
    );
  });

  it("rejects an AI-generated plan without an instrumentation proposal", async () => {
    const root = await mkdtemp(join(tmpdir(), "wizard-ai-missing-"));
    temporaryRoots.push(root);
    await cp(join(fixtures, "react-vite"), root, { recursive: true });
    const reactViteTrackingPlan = trackingPlanSchema.parse({
      ...trackingPlan,
      proposal: {
        ...trackingPlan.proposal,
        source: { ...trackingPlan.proposal!.source, framework: "react-vite" },
      },
    });

    await expect(
      generateSetupPlan(
        { projectRoot: root, workspace, trackingPlan: reactViteTrackingPlan },
        options,
      ),
    ).rejects.toThrow(
      "AI-generated tracking plans require an AI instrumentation proposal",
    );
  });
});
