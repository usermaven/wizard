#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createWizardMcpServer } from "./mcp-server.js";

const help = `Usermaven Wizard local MCP server

Usage:
  usermaven-wizard-mcp [--root <path>]
  usermaven-wizard-mcp --help

The server uses stdio and exposes read-only tools. --root defaults to the current
working directory and defines the filesystem boundary for every tool call.`;

function parseRoot(arguments_: string[]): string | null {
  if (arguments_.includes("--help") || arguments_.includes("-h")) return null;
  const rootIndex = arguments_.indexOf("--root");
  const knownArguments =
    rootIndex === -1 ? [] : arguments_.slice(rootIndex, rootIndex + 2);
  if (arguments_.length !== knownArguments.length) {
    throw new Error("Unknown arguments; use --help for usage");
  }
  if (rootIndex !== -1 && !arguments_[rootIndex + 1]) {
    throw new Error("--root requires a path");
  }
  return rootIndex === -1 ? process.cwd() : arguments_[rootIndex + 1]!;
}

async function main(): Promise<void> {
  const root = parseRoot(process.argv.slice(2));
  if (root === null) {
    process.stdout.write(`${help}\n`);
    return;
  }
  const server = await createWizardMcpServer({ root });
  const transport = new StdioServerTransport();
  process.once("SIGINT", () => {
    void server.close().finally(() => process.exit(0));
  });
  await server.connect(transport);
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "MCP server failed to start";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
