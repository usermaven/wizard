import { lstat, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";

import { afterEach, describe, expect, it } from "vitest";

import { runGuidedSetup } from "./guided.js";

const temporaryRoots: string[] = [];

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
  process.exitCode = undefined;
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

function io(answers: string[]) {
  const input = new PassThrough();
  const output = new PassThrough();
  const pending = [...answers];
  let transcript = "";
  output.on("data", (chunk: Buffer) => {
    transcript += chunk.toString();
    // Answer only once a prompt is waiting; earlier writes would be dropped
    // because readline discards lines with no pending question.
    if (/(?:: |> |\) )$/u.test(transcript) && pending.length > 0) {
      const answer = pending.shift()!;
      setImmediate(() => input.write(`${answer}\n`));
    }
  });
  return {
    io: { input, output },
    transcript: () => transcript,
  };
}

describe("runGuidedSetup", () => {
  it("stops before applying when the typed approval does not match", async () => {
    const root = await scaffoldReactVite("wizard-guided-");

    const session = io([
      "Test workspace", // workspace name
      "", // region default
      "", // tracking host default
      `sha256:${"ab12".repeat(8)}`, // fingerprint
      "wrong confirmation", // approval phrase
    ]);

    await expect(
      runGuidedSetup({ projectRoot: root, io: session.io }),
    ).rejects.toThrow("Approval confirmation did not match");

    const transcript = session.transcript();
    expect(transcript).toContain("Detected framework: react-vite");
    expect(transcript).toContain("baseline tracking plan");
    expect(transcript).toContain("install-usermaven-sdk");
    expect(transcript).toContain("Type exactly:");
    await expect(lstat(join(root, "src", "usermaven.ts"))).rejects.toThrow();
  });

  it("declines unsupported frameworks with a doctor pointer", async () => {
    const root = await mkdtemp(join(tmpdir(), "wizard-guided-unsupported-"));
    temporaryRoots.push(root);
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ dependencies: { svelte: "5.1.0" } }),
    );

    const session = io([]);
    await runGuidedSetup({ projectRoot: root, io: session.io });

    expect(session.transcript()).toContain("does not support");
    expect(session.transcript()).toContain("doctor");
    expect(process.exitCode).toBe(1);
  });
});
