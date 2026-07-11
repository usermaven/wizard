# Usermaven Wizard

Usermaven Wizard is a local-first toolkit for installing Usermaven, designing a
tracking plan, applying approved instrumentation changes, and verifying that the
setup works. It is designed for both people and coding agents.

> [!IMPORTANT]
> This repository is under active development. Versioned contracts,
> machine-readable manifests, bounded project inspection, and deterministic
> baseline tracking plans, and a read-only local MCP server are implemented.
> Repository mutation and end-to-end verification are not implemented yet.

## Design promises

- Source code and local environment values stay on the developer's machine by
  default.
- Inspection and planning never mutate the repository.
- Every package installation and file change requires explicit approval.
- Verification returns normalized results, never captured event payloads.
- Repository content is untrusted data, not instructions for the wizard or agent.
- Remote Usermaven MCP handles authenticated workspace operations; the local
  wizard handles source-code inspection and edits.

## Packages

- `@usermaven/wizard-schemas`: versioned Zod contracts for tracking plans, setup
  plans, project inspections, verification results, agent NDJSON events, and the
  command manifest.
- `@usermaven/wizard-core`: reusable local inspection and planning engine.
- `@usermaven/wizard`: the CLI and local MCP server. `inspect`, `plan`,
  `manifest`, and the read-only MCP binary are currently executable.

## Inspect a project

```sh
npx @usermaven/wizard inspect .
```

Inspection detects supported frameworks, the package manager, analytics SDK
dependencies, and recognized instrumentation calls. Its JSON output contains
normalized tokens and locations—not source snippets, property values, secrets,
or event bodies.

## Propose a baseline tracking plan

```sh
npx @usermaven/wizard plan .
```

Baseline mode proposes page views, stable user identity, and shared deployment
properties. Every item requires review. It deliberately does not invent custom
business or revenue events from source-code keywords.

## Run the local MCP server

```sh
node packages/cli/dist/mcp.js --root /absolute/path/to/project
```

It exposes `inspect_project` and `propose_tracking_plan` over stdio. See the
[local MCP development playbook](docs/local-mcp.md) for client configuration,
security boundaries, and troubleshooting.

## Development

Requires Node.js 20 or newer.

```sh
npm install
npm run check
npm run --workspace @usermaven/wizard build
node packages/cli/dist/cli.js manifest
node packages/cli/dist/cli.js inspect fixtures/react-vite
node packages/cli/dist/cli.js plan fixtures/react-vite
```

Start with [the architecture](docs/architecture.md),
[contracts](docs/contracts.md), and [threat model](docs/threat-model.md). See
[CONTRIBUTING.md](CONTRIBUTING.md) before proposing changes.

## License

MIT
