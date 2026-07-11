# `@usermaven/wizard`

Local-first Usermaven installation and instrumentation tooling.

The current package implements read-only project inspection, deterministic
baseline tracking plans, and the machine-readable manifest:

```sh
npx @usermaven/wizard inspect .
npx @usermaven/wizard plan .
npx @usermaven/wizard manifest
```

Approved changes, verification, and the local MCP server are declared in the
manifest but are not yet implemented. See the [project
repository](https://github.com/usermaven/wizard) for status and the security
model.
