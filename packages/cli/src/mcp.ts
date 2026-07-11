#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFile, stat } from "node:fs/promises";

import { createWizardMcpServer } from "./mcp-server.js";

const help = `Usermaven Wizard local MCP server

Usage:
  usermaven-wizard-mcp [--root <path>] [--trusted-workspace-keys <keys.json>]
  usermaven-wizard-mcp --help

The server uses stdio and exposes planning tools plus approval-bound application.
--root defaults to the current working directory and defines the filesystem
boundary for every tool call.`;

function parseOptions(arguments_: string[]) {
  if (arguments_.includes("--help") || arguments_.includes("-h")) return null;
  let root = process.cwd();
  let trustedWorkspaceKeysPath: string | undefined;
  for (let index = 0; index < arguments_.length; index += 2) {
    const option = arguments_[index];
    const value = arguments_[index + 1];
    if (!value || value.startsWith("--"))
      throw new Error(`${option ?? "Option"} requires a value`);
    if (option === "--root") root = value;
    else if (option === "--trusted-workspace-keys")
      trustedWorkspaceKeysPath = value;
    else throw new Error("Unknown arguments; use --help for usage");
  }
  return { root, trustedWorkspaceKeysPath };
}

async function readTrustedWorkspaceKeys(path: string | undefined) {
  if (!path) return {};
  if ((await stat(path)).size > 1_000_000)
    throw new Error("Trusted workspace key file exceeds 1 MB");
  const value: unknown = JSON.parse(await readFile(path, "utf8"));
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Trusted workspace keys must be a JSON object");
  const entries = Object.entries(value);
  if (
    entries.length > 20 ||
    entries.some(
      ([key, publicKey]) =>
        !/^[a-zA-Z0-9._-]{1,128}$/u.test(key) ||
        typeof publicKey !== "string" ||
        publicKey.length > 10_000,
    )
  )
    throw new Error("Trusted workspace keys contain an invalid entry");
  return Object.fromEntries(entries) as Record<string, string>;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  if (options === null) {
    process.stdout.write(`${help}\n`);
    return;
  }
  const server = await createWizardMcpServer({
    root: options.root,
    trustedWorkspaceKeys: await readTrustedWorkspaceKeys(
      options.trustedWorkspaceKeysPath,
    ),
  });
  const transport = new StdioServerTransport();
  const shutdown = () => {
    void server.close().finally(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  await server.connect(transport);
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "MCP server failed to start";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
