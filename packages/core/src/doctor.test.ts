import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { doctorReportSchema } from "@usermaven/wizard-schemas";
import { afterEach, describe, expect, it } from "vitest";

import { runDoctor } from "./doctor.js";

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

describe("runDoctor", () => {
  it("reports ok for a supported fixture without leaking values", async () => {
    const root = await scaffoldReactVite("wizard-doctor-ok-");

    const report = await runDoctor({ projectRoot: root }, { now });

    expect(doctorReportSchema.parse(report)).toEqual(report);
    expect(report.overall).toBe("ok");
    expect(report.checks.map((check) => check.id)).toEqual([
      "node-version",
      "project-root",
      "package-json",
      "framework-support",
      "package-manager",
      "wizard-state",
    ]);
    expect(JSON.stringify(report)).not.toContain(root);
  });

  it("fails on an unusable root and old Node.js", async () => {
    const report = await runDoctor(
      { projectRoot: "/definitely/missing/path" },
      { now, nodeVersion: "v18.19.0" },
    );

    expect(report.overall).toBe("fail");
    expect(
      report.checks.find((check) => check.id === "node-version")?.status,
    ).toBe("fail");
    expect(
      report.checks.find((check) => check.id === "project-root")?.status,
    ).toBe("fail");
    expect(report.checks).toHaveLength(2);
  });

  it("warns on an unsupported framework and missing package.json", async () => {
    const root = await mkdtemp(join(tmpdir(), "wizard-doctor-warn-"));
    temporaryRoots.push(root);

    const report = await runDoctor({ projectRoot: root }, { now });

    expect(report.overall).toBe("warn");
    expect(
      report.checks.find((check) => check.id === "package-json")?.status,
    ).toBe("warn");
    expect(
      report.checks.find((check) => check.id === "framework-support")?.status,
    ).toBe("warn");
  });

  it("checks tracking-host reachability through an injected fetch", async () => {
    const root = await scaffoldReactVite("wizard-doctor-net-");

    const reachable = await runDoctor(
      { projectRoot: root, trackingHost: "https://events.example.com" },
      {
        now,
        fetchImplementation: async () => new Response(null, { status: 405 }),
      },
    );
    expect(
      reachable.checks.find(
        (check) => check.id === "tracking-host-connectivity",
      ),
    ).toMatchObject({ status: "ok" });

    const unreachable = await runDoctor(
      { projectRoot: root, trackingHost: "https://blocked.example.com" },
      {
        now,
        fetchImplementation: async () => {
          throw new Error("network unreachable");
        },
      },
    );
    expect(unreachable.overall).toBe("fail");
    expect(
      unreachable.checks.find(
        (check) => check.id === "tracking-host-connectivity",
      ),
    ).toMatchObject({ status: "fail" });
  });

  it("fails when .usermaven is not a regular directory", async () => {
    const root = await scaffoldReactVite("wizard-doctor-state-");
    await writeFile(join(root, ".usermaven"), "not a directory");

    const report = await runDoctor({ projectRoot: root }, { now });

    expect(report.overall).toBe("fail");
    expect(
      report.checks.find((check) => check.id === "wizard-state")?.status,
    ).toBe("fail");
  });
});
