# Usermaven Wizard

Usermaven Wizard is a local-first toolkit for installing Usermaven, designing a
tracking plan, applying approved instrumentation changes, and verifying that the
setup works. It is designed for both people and coding agents.

> [!IMPORTANT]
> This repository is currently a Phase 0 contract preview. The schemas and
> machine-readable manifest are usable; project inspection, mutation, local MCP,
> and end-to-end verification are not implemented yet.

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
  plans, verification results, agent NDJSON events, and the command manifest.
- `@usermaven/wizard`: the future CLI and local MCP server. In Phase 0, only
  `usermaven-wizard manifest` is executable.

## Development

Requires Node.js 20 or newer.

```sh
npm install
npm run check
npm run --workspace @usermaven/wizard build
node packages/cli/dist/cli.js manifest
```

Start with [the architecture](docs/architecture.md),
[contracts](docs/contracts.md), and [threat model](docs/threat-model.md). See
[CONTRIBUTING.md](CONTRIBUTING.md) before proposing changes.

## License

MIT
