# `@usermaven/wizard`

Local-first Usermaven installation and instrumentation tooling.

The current package implements read-only project inspection, deterministic
baseline tracking plans, a local read-only MCP server, and the machine-readable
manifest:

```sh
npx @usermaven/wizard inspect .
npx @usermaven/wizard plan .
npx @usermaven/wizard setup-plan . --workspace-name Example --region us \
  --key-fingerprint sha256:example --tracking-host https://events.example.com
npx @usermaven/wizard preview ./setup-plan.json
npx @usermaven/wizard manifest
npx -p @usermaven/wizard usermaven-wizard-mcp --root /path/to/project
```

Applying approved changes, verification, and additional MCP tools are declared
in the manifest but are not yet implemented. See the [project
repository](https://github.com/usermaven/wizard) for status and the security
model.
