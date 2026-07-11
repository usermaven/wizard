#!/usr/bin/env node

import { manifest } from "./manifest.js";

const help = `Usermaven Wizard (contract preview)

Usage:
  usermaven-wizard manifest [--compact]
  usermaven-wizard --help

Only the manifest command is executable in this Phase 0 release. Other commands
are published as contracts and will be implemented incrementally.`;

const [command, ...flags] = process.argv.slice(2);

if (command === "manifest") {
  const spacing = flags.includes("--compact") ? undefined : 2;
  process.stdout.write(`${JSON.stringify(manifest, null, spacing)}\n`);
} else if (command === undefined || command === "--help" || command === "-h") {
  process.stdout.write(`${help}\n`);
} else {
  process.stderr.write(`Unknown command: ${command}\n\n${help}\n`);
  process.exitCode = 1;
}
