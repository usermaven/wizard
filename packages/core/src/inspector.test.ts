import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { inspectProject } from "./inspector.js";

const fixtures = fileURLToPath(new URL("../../../fixtures/", import.meta.url));
const temporaryRoots: string[] = [];
const now = () => new Date("2026-07-11T12:00:00Z");

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

describe("inspectProject", () => {
  it.each([
    ["react-vite", "react-vite"],
    ["next-app-router", "next-app-router"],
    ["next-pages-router", "next-pages-router"],
    ["next-src-app-router", "next-app-router"],
    ["next-src-pages-router", "next-pages-router"],
  ] as const)("detects the %s fixture", async (fixture, framework) => {
    const result = await inspectProject(join(fixtures, fixture), { now });

    expect(result.project).toEqual({
      framework,
      package_manager: "npm",
      confidence: 0.99,
    });
    expect(result.scan.files_scanned).toBeGreaterThan(0);
    expect(result.inspected_at).toBe("2026-07-11T12:00:00.000Z");
  });

  it("returns digest-bound entry-point hints for src-directory layouts", async () => {
    const result = await inspectProject(join(fixtures, "next-src-app-router"), {
      now,
    });

    expect(result.evidence).toContainEqual({
      kind: "directory",
      path: "src/app",
      detail: "Next.js App Router",
    });
    expect(result.entry_points).toEqual([
      {
        path: "src/app/layout.tsx",
        role: "app_layout",
        sha256: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
      },
    ]);
  });

  it("reports normalized analytics tokens without source or values", async () => {
    const root = await mkdtemp(join(tmpdir(), "wizard-inspector-"));
    temporaryRoots.push(root);
    await mkdir(join(root, "src"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        dependencies: {
          react: "19.2.7",
          "@usermaven/sdk-js": "1.4.0",
          "posthog-js": "1.0.0",
        },
      }),
    );
    await writeFile(
      join(root, "src", "analytics.ts"),
      [
        'import usermaven from "@usermaven/sdk-js";',
        'const privateEmail = "private@example.com";',
        "usermaven.track('checkout', { email: privateEmail });",
        "posthog.identify(privateEmail);",
      ].join("\n"),
    );

    const result = await inspectProject(root, { now });
    const serialized = JSON.stringify(result);

    expect(result.analytics_dependencies.map((item) => item.provider)).toEqual([
      "usermaven",
      "posthog",
    ]);
    expect(result.instrumentation).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "usermaven",
          kind: "import",
          line: 1,
        }),
        expect.objectContaining({
          provider: "usermaven",
          kind: "track",
          line: 3,
        }),
        expect.objectContaining({
          provider: "posthog",
          kind: "identify",
          line: 4,
        }),
      ]),
    );
    expect(serialized).not.toContain("private@example.com");
    expect(serialized).not.toContain("checkout");
  });

  it("skips symlinks and enforces scan limits", async () => {
    const root = await mkdtemp(join(tmpdir(), "wizard-inspector-"));
    temporaryRoots.push(root);
    await mkdir(join(root, "src"));
    await writeFile(join(root, "package.json"), "{}");
    await writeFile(join(root, "src", "a.js"), "posthog.capture('one')");
    await writeFile(join(root, "src", "b.js"), "posthog.capture('two')");
    await symlink(
      join(tmpdir(), "outside.js"),
      join(root, "src", "00-outside.js"),
    );

    const result = await inspectProject(root, { maxFiles: 1, now });

    expect(result.scan.truncated).toBe(true);
    expect(result.scan.files_scanned).toBe(1);
    expect(result.scan.skipped_symlinks).toBe(1);
  });

  it("does not attribute generic analytics or gtag calls without provider evidence", async () => {
    const root = await mkdtemp(join(tmpdir(), "wizard-inspector-tokens-"));
    temporaryRoots.push(root);
    await mkdir(join(root, "src"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ dependencies: {} }),
    );
    await writeFile(
      join(root, "src", "generic.ts"),
      "analytics.track('internal');\ngtag('event', 'internal');\n",
    );

    const result = await inspectProject(root, { now });
    expect(result.instrumentation).toEqual([]);
  });

  it("reports scanned but unsupported framework adapters explicitly", async () => {
    const root = await mkdtemp(join(tmpdir(), "wizard-inspector-vue-"));
    temporaryRoots.push(root);
    await mkdir(join(root, "src"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ dependencies: { vue: "3.5.0", nuxt: "4.0.0" } }),
    );
    await writeFile(join(root, "src", "App.vue"), "<template />\n");

    const result = await inspectProject(root, { now });

    expect(result.project.framework).toBe("node");
    expect(result.unsupported_frameworks).toEqual(["nuxt", "vue"]);
    expect(result.warnings).toContain(
      "Detected unsupported framework adapters: nuxt, vue",
    );
  });

  it("does not follow a package manifest symlink", async () => {
    const root = await mkdtemp(join(tmpdir(), "wizard-inspector-"));
    const external = await mkdtemp(join(tmpdir(), "wizard-external-"));
    temporaryRoots.push(root, external);
    await writeFile(
      join(external, "package.json"),
      JSON.stringify({ dependencies: { next: "16.2.10" } }),
    );
    await symlink(join(external, "package.json"), join(root, "package.json"));

    const result = await inspectProject(root, { now });

    expect(result.project.framework).toBe("unknown");
    expect(result.project.package_manager).toBe("none");
    expect(result.warnings).toContain(
      "package.json is not a regular local file and was skipped",
    );
  });

  it("uses an ancestor workspace lockfile for a nested package", async () => {
    const root = await mkdtemp(join(tmpdir(), "wizard-monorepo-"));
    temporaryRoots.push(root);
    await mkdir(join(root, ".git"));
    await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    const child = join(root, "packages", "app");
    await mkdir(child, { recursive: true });
    await writeFile(
      join(child, "package.json"),
      JSON.stringify({ dependencies: { react: "19.2.7", vite: "8.1.4" } }),
    );

    const result = await inspectProject(child, { now });
    expect(result.project.package_manager).toBe("pnpm");
  });
});
