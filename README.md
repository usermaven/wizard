# Usermaven Wizard ✨

[![CI](https://github.com/usermaven/wizard/actions/workflows/ci.yml/badge.svg)](https://github.com/usermaven/wizard/actions/workflows/ci.yml)
[![node >= 20](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![license MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Add [Usermaven](https://usermaven.com) product analytics to your app in
minutes. The wizard inspects your project, proposes a tracking plan tailored to
your codebase, shows you every change before it is written, and verifies that
events actually reach your workspace — all from one CLI that also works as an
MCP server for coding agents like Claude Code and Cursor.

```sh
npx @usermaven/wizard setup .
```

Running `setup` in a terminal starts an interactive guided flow: it detects
your framework, asks for your workspace details, previews the exact changes,
applies them after your typed approval, and can leave a
`usermaven-setup-report.md` behind. In non-interactive contexts (agents, CI)
the same command returns a machine-readable next action.

## How it works

The wizard walks one loop from empty project to verified analytics:

1. **Inspect** — detects your framework, package manager, and any existing
   analytics SDKs. Read-only.
2. **Plan** — a baseline plan (automatic page views, zero configuration) or a
   reviewable AI tracking plan of custom events built from your business
   context. Read-only.
3. **Preview** — renders the exact package installs and file diffs the setup
   would make, without touching anything.
4. **Approve** — you confirm the exact operations in an interactive terminal.
   Approvals are short-lived, bound to your project and plan, and usable once.
5. **Apply** — executes only the operations you approved: installs
   `@usermaven/sdk-js`, generates a small client module wired to
   environment variables, and adds the instrumentation from your plan.
6. **Verify** — independently checks the files on disk and confirms
   marker-bound events arrive at the collector and your workspace.

Progress is checkpointed along the way, so an interrupted setup resumes with
`usermaven-wizard resume` instead of starting over. See the
[setup guide](docs/setup-guide.md) for the full walkthrough.

## Supported frameworks

| Framework                                 | Detection | Generated integration                        |
| ----------------------------------------- | --------- | -------------------------------------------- |
| Next.js (App Router, incl. `src/app`)     | ✅        | `app/usermaven-provider.tsx` client provider |
| Next.js (Pages Router, incl. `src/pages`) | ✅        | `lib/usermaven-client.ts` client module      |
| React + Vite                              | ✅        | `src/usermaven.ts` client module             |
| React (other bundlers)                    | ✅        | `src/usermaven.ts` client module             |
| Node.js                                   | ✅        | `src/usermaven.ts` client module             |

Astro, Nuxt, Remix, Svelte/SvelteKit, and Vue are detected and reported as
not yet supported. npm, pnpm, yarn, and bun are all supported package
managers. Requires Node.js 20 or newer.

## Prerequisites

- A [Usermaven account](https://app.usermaven.com) and workspace.
- Node.js 20+ in the project you are instrumenting.

## Connect your workspace

```sh
npx @usermaven/wizard login          # email + password (2FA supported)
npx @usermaven/wizard workspaces     # list workspaces, keys, tracking hosts
```

Signing in makes the guided setup pick your workspace from a list — name,
tracking host, and key fingerprint are filled in automatically — and unlocks
`starter-dashboard`, which creates a private web-analytics dashboard
(visitors, pageviews, sessions, visitors-over-time, top pages) in your
workspace after setup. Use `login --api-key <key>` with an organization API
key for long-lived automation; credentials are stored privately at
`~/.config/usermaven-wizard/credentials.json` (mode 0600) and removed with
`logout`.

Not signed in? Everything still works — the guided setup prompts for the
workspace details from **Workspace settings → Setup instructions**, and
generated code references the key only through an environment variable (for
example `NEXT_PUBLIC_USERMAVEN_KEY`) whose value you set yourself in
`.env.local` and your hosting provider. See the
[deployment guide](docs/deployment.md).

## Use with a coding agent (recommended)

The wizard ships a local MCP server that exposes the whole flow — inspection,
planning, preview, approval-bound apply, and verification — as tools your
coding agent can drive while your source code stays on your machine.

```json
{
  "mcpServers": {
    "usermaven-wizard": {
      "command": "npx",
      "args": [
        "-y",
        "--package",
        "@usermaven/wizard",
        "usermaven-wizard-mcp",
        "--root",
        "/absolute/path/to/project"
      ]
    }
  }
}
```

Then ask your agent: _“Set up Usermaven in this project using the
usermaven-wizard tools. Start with `inspect_project`, checkpoint after each
phase, and follow the returned next actions.”_ File changes still require your
interactive approval in a terminal —
the agent cannot approve on your behalf. See the
[local MCP guide](docs/local-mcp.md) for Claude Code and Cursor specifics, and
the [AI planning playbook](docs/ai-tracking-plans.md) for how agents generate
tracking plans. The npm package also ships a ready-made Claude Code skill at
`skills/usermaven-setup/SKILL.md`.

## What the wizard will and won't do

- Inspection and planning **never modify your repository**, and their output
  contains normalized tokens and file locations — not source snippets,
  property values, or secrets.
- Your source code and environment values **stay on your machine** by default.
- Every package install and file change requires an **exact, short-lived,
  interactive approval**; nothing is ever applied silently.
- The wizard **never touches** `.env*` files, lockfiles, `.git`, CI config, or
  anything outside the operations you approved, and every applied change can
  be rolled back from recorded before/after hashes.
- Verification returns normalized pass/fail results, **never captured event
  payloads**.
- The wizard sends **no telemetry**. Its only network calls are ones you
  explicitly initiate: the package install you approve, the optional
  `doctor --tracking-host` reachability check, and the Usermaven API calls
  behind `login`, `workspaces`, and `starter-dashboard` — which carry your
  credentials and the request bodies those commands describe, never source
  code, inspection output, or environment values.

The full rationale lives in the [threat model](docs/threat-model.md) and
[architecture](docs/architecture.md).

## Commands

| Command                          | What it does                                                                |
| -------------------------------- | --------------------------------------------------------------------------- |
| `setup [path]`                   | Interactive guided setup on a terminal; JSON next action otherwise          |
| `inspect [path]`                 | Detect framework, package manager, and existing analytics (read-only)       |
| `plan [path]`                    | Stamp a tracking plan: `--baseline` for page views only, or AI inputs       |
| `setup-plan [path]`              | Generate the exact install/file operations for your workspace               |
| `preview <plan>`                 | Render every operation and diff without applying anything                   |
| `approve <plan>`                 | Interactively approve exact operations (short-lived, single-use)            |
| `apply <plan>`                   | Execute only the approved operations                                        |
| `verification-session <plan>`    | Open a short-lived, marker-bound verification session                       |
| `verify <plan>`                  | Check local files plus runtime, transport, and workspace evidence           |
| `checkpoint` / `resume` / `next` | Save progress and get the single next action after an interruption          |
| `apply-lock` / `recover-lock`    | Inspect and recover an interrupted apply                                    |
| `report <plan>`                  | Render a human-readable setup report from existing artifacts (read-only)    |
| `doctor [path]`                  | Read-only diagnostics: Node, framework support, state, host reachability    |
| `login` / `logout` / `whoami`    | Sign in to the Usermaven API (interactive or `--api-key`) and inspect it    |
| `workspaces`                     | List your workspaces with public keys and tracking hosts                    |
| `starter-dashboard`              | Create a starter web-analytics dashboard in your workspace                  |
| `uninstall [path]`               | Detect installed Usermaven pieces and print a removal checklist (read-only) |
| `manifest`                       | Print the machine-readable command manifest                                 |

Run `usermaven-wizard --help` for full flags. Read-only commands accept
`--compact` for single-line JSON.

## Documentation

- [Setup guide](docs/setup-guide.md) — end-to-end walkthrough, with and
  without a coding agent
- [Deployment guide](docs/deployment.md) — environment variables in Vercel,
  Netlify, Docker, and CI; verifying production
- [Troubleshooting](docs/troubleshooting.md) — expired approvals, failed
  verification, stuck applies, events not arriving
- [Local MCP server](docs/local-mcp.md) — client configuration, security
  boundaries
- [AI tracking plans](docs/ai-tracking-plans.md) — how agents propose events
  and instrumentation
- [Apply playbook](docs/apply-playbook.md) ·
  [Verification playbook](docs/verification-playbook.md) ·
  [Workflow recovery](docs/workflow-recovery.md)
- [Architecture](docs/architecture.md) · [Contracts](docs/contracts.md) ·
  [Threat model](docs/threat-model.md)

## Packages

- [`@usermaven/wizard`](packages/cli) — the CLI and local MCP server.
- [`@usermaven/wizard-core`](packages/core) — the reusable inspection,
  planning, approval, and application engine.
- [`@usermaven/wizard-schemas`](packages/schemas) — versioned Zod contracts
  for every artifact the wizard produces.

## Run from source

```sh
git clone https://github.com/usermaven/wizard.git
cd wizard
npm install
npm run build
node packages/cli/dist/cli.js setup /absolute/path/to/your/project
```

The MCP server entry point is `node packages/cli/dist/mcp.js --root
/absolute/path/to/your/project`.

## Development

```sh
npm install
npm run check   # format, typecheck, tests, build
node packages/cli/dist/cli.js inspect fixtures/react-vite
```

Start with the [architecture](docs/architecture.md),
[contracts](docs/contracts.md), and [threat model](docs/threat-model.md). See
[CONTRIBUTING.md](CONTRIBUTING.md) before proposing changes.

## License

MIT
