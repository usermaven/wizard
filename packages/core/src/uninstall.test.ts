import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { uninstallReportSchema } from "@usermaven/wizard-schemas";
import { afterEach, describe, expect, it } from "vitest";

import { planUninstall } from "./uninstall.js";

const temporaryRoots: string[] = [];
const now = () => new Date("2026-07-11T15:00:00Z");

async function scaffoldReactVite(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  temporaryRoots.push(root);
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "fixture-react-vite",
      private: true,
      type: "module",
      dependencies: { react: "19.2.7", vite: "8.1.4" },
    }),
  );
  await writeFile(join(root, "src", "main.jsx"), "export {};\n");
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

describe("planUninstall", () => {
  it("reports nothing to remove on a clean project", async () => {
    const root = await scaffoldReactVite("wizard-uninstall-clean-");

    const report = await planUninstall({ projectRoot: root }, { now });

    expect(uninstallReportSchema.parse(report)).toEqual(report);
    expect(report.sdk_dependency_declared).toBe(false);
    expect(report.generated_files).toEqual([]);
    expect(report.instructions[0]).toContain("nothing to remove");
  });

  it("detects the SDK and generated files with removal instructions", async () => {
    const root = await scaffoldReactVite("wizard-uninstall-full-");
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        dependencies: {
          react: "19.2.7",
          vite: "8.1.4",
          "@usermaven/sdk-js": "^1.5.15",
        },
      }),
    );
    await writeFile(
      join(root, "src", "usermaven.ts"),
      'import { usermavenClient } from "@usermaven/sdk-js";\nexport const usermaven = null;\n',
    );

    const report = await planUninstall({ projectRoot: root }, { now });

    expect(report.sdk_dependency_declared).toBe(true);
    expect(report.generated_files).toEqual(["src/usermaven.ts"]);
    const instructions = report.instructions.join(" ");
    expect(instructions).toContain("npm uninstall @usermaven/sdk-js");
    expect(instructions).toContain("src/usermaven.ts");
    expect(instructions).toContain("environment variables");
  });
});
