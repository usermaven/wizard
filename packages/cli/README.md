# `@usermaven/wizard`

Local-first Usermaven installation and instrumentation tooling.

The current package implements project inspection, deterministic baseline
tracking plans, preview, approval-bound application, a local MCP server, and the
machine-readable manifest:

```sh
npx @usermaven/wizard inspect .
npx @usermaven/wizard plan .
npx @usermaven/wizard setup-plan . --workspace-name Example --region us \
  --key-fingerprint sha256:example --tracking-host https://events.example.com
npx @usermaven/wizard preview ./setup-plan.json
npx @usermaven/wizard approve ./setup-plan.json --operations install-sdk \
  --root /path/to/project --output ./approval.json
npx @usermaven/wizard apply ./setup-plan.json --approval ./approval.json \
  --root /path/to/project
npx @usermaven/wizard manifest
npx -p @usermaven/wizard usermaven-wizard-mcp --root /path/to/project
```

The MCP server exposes the same application primitive but cannot create an
approval. Verification and additional MCP tools remain planned. See the
[project repository](https://github.com/usermaven/wizard) for the security model.
