# `@usermaven/wizard`

Add [Usermaven](https://usermaven.com) product analytics to your app in
minutes. The wizard inspects your project, proposes a reviewable tracking
plan, previews every change, applies only what you interactively approve, and
verifies that events actually reach your workspace.

```sh
npx @usermaven/wizard setup .
```

Requires Node.js 20+. Supports Next.js (App and Pages Router), React + Vite,
React, and Node.js projects with npm, pnpm, yarn, or bun.

## What it does

- **Inspect** your framework, package manager, and existing analytics —
  read-only, normalized output with no source snippets or secrets.
- **Plan** events and properties from your business context, with every
  AI-proposed item flagged for review.
- **Preview** the exact package installs and file diffs before anything runs.
- **Approve & apply** — file changes require a short-lived, single-use,
  interactive terminal approval bound to your exact project and plan.
- **Verify** the applied files and confirm marker-bound events arrive at the
  collector and your workspace.

Your workspace key never passes through the wizard: generated code reads it
from an environment variable (e.g. `NEXT_PUBLIC_USERMAVEN_KEY`) whose value
you set yourself.

## Use from a coding agent

The package also ships a local MCP server exposing the same flow as tools for
Claude Code, Cursor, and other MCP clients:

```sh
npx -y -p @usermaven/wizard usermaven-wizard-mcp --root /absolute/path/to/project
```

The MCP server cannot create approvals — file changes always come back to a
human in a terminal.

## Commands

`setup` · `inspect` · `plan` · `setup-plan` · `preview` · `approve` · `apply`
· `verification-session` · `verify` · `checkpoint` · `resume` · `next` ·
`apply-lock` · `recover-lock` · `manifest`

Run `npx @usermaven/wizard --help` for flags.

## Documentation

- [Setup guide](https://github.com/usermaven/wizard/blob/main/docs/setup-guide.md)
- [Deployment guide](https://github.com/usermaven/wizard/blob/main/docs/deployment.md)
- [Troubleshooting](https://github.com/usermaven/wizard/blob/main/docs/troubleshooting.md)
- [Local MCP server](https://github.com/usermaven/wizard/blob/main/docs/local-mcp.md)
- [Security model & threat model](https://github.com/usermaven/wizard/blob/main/docs/threat-model.md)

MIT licensed. Issues and feedback:
[github.com/usermaven/wizard](https://github.com/usermaven/wizard/issues).
