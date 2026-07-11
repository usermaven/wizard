# `@usermaven/wizard`

Local-first Usermaven installation and instrumentation tooling.

The current package implements read-only project inspection, deterministic
baseline tracking plans, a local read-only MCP server, and the machine-readable
manifest:

```sh
npx @usermaven/wizard inspect .
npx @usermaven/wizard plan .
npx @usermaven/wizard manifest
npx -p @usermaven/wizard usermaven-wizard-mcp --root /path/to/project
```

Approved changes, verification, and additional mutating MCP tools are declared
in the manifest but are not yet implemented. See the [project
repository](https://github.com/usermaven/wizard) for status and the security
model.
