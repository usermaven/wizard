# Usermaven Wizard

Usermaven Wizard is a local-first toolkit for installing Usermaven, designing a
tracking plan, applying approved instrumentation changes, and verifying that the
setup works. It is designed for both people and coding agents.

> [!IMPORTANT]
> This repository is under active development. Versioned contracts,
> machine-readable manifests, bounded project inspection, AI-generated tracking
> plans, approval-ready setup plans, change previews,
> approval-bound repository application, and a local MCP server are implemented.
> End-to-end verification is not implemented yet.

## Design promises

- Source code and local environment values stay on the developer's machine by
  default.
- Inspection and planning never mutate the repository.
- Every package installation and file change requires an exact, short-lived,
  interactive approval.
- Verification returns normalized results, never captured event payloads.
- Repository content is untrusted data, not instructions for the wizard or agent.
- Remote Usermaven MCP handles authenticated workspace operations; the local
  wizard handles source-code inspection and edits.

## Packages

- `@usermaven/wizard-schemas`: versioned Zod contracts for tracking plans, setup
  plans, project inspections, verification results, agent NDJSON events, and the
  command manifest.
- `@usermaven/wizard-core`: reusable local inspection, planning, approval, and
  application engine.
- `@usermaven/wizard`: the CLI and local MCP server.

## Inspect a project

```sh
npx @usermaven/wizard inspect .
```

Inspection detects supported frameworks, the package manager, analytics SDK
dependencies, and recognized instrumentation calls. Its JSON output contains
normalized tokens and locations—not source snippets, property values, secrets,
or event bodies.

## Generate an AI tracking plan

```sh
npx @usermaven/wizard plan . \
  --business-context ./business-context.json \
  --ai-proposal ./ai-proposal.json > tracking-plan.json
```

In the MCP workflow, the client model creates the proposal from explicit
business context, normalized inspection, and any source access separately
authorized in the coding-agent host; the wizard validates and stamps it. It can
propose custom events and properties. Every AI item requires review;
revenue events additionally require explicit revenue context, standard revenue
properties, and server-capable authority. See the [AI planning
playbook](docs/ai-tracking-plans.md).

## Generate and preview setup operations

```sh
usermaven-wizard setup-plan . \
  --workspace-name "Example" \
  --region us \
  --key-fingerprint sha256:example \
  --tracking-host https://events.example.com \
  --tracking-plan ./tracking-plan.json

usermaven-wizard preview ./setup-plan.json
```

Setup generation references the public key through a framework-specific
environment-variable name and never accepts its value. Previewing renders typed
operations without installing packages, writing files, or running commands.

## Approve and apply exact operations

```sh
usermaven-wizard approve ./setup-plan.json \
  --operations install-sdk,create-integration \
  --root /absolute/path/to/project \
  --output ./approval.json

usermaven-wizard apply ./setup-plan.json \
  --approval ./approval.json \
  --root /absolute/path/to/project
```

Approval requires an interactive terminal. It is bound to the plan digest,
canonical repository root, exact operation IDs, and an expiry; it is consumed
once. See the [application playbook](docs/apply-playbook.md).

## Run the local MCP server

```sh
node packages/cli/dist/mcp.js --root /absolute/path/to/project
```

It exposes inspection, tracking-plan, setup-plan, preview, and approval-bound
application tools over stdio. See the
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
```

Start with [the architecture](docs/architecture.md),
[contracts](docs/contracts.md), and [threat model](docs/threat-model.md). See
[CONTRIBUTING.md](CONTRIBUTING.md) before proposing changes.

## License

MIT
