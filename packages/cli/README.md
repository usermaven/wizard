# `@usermaven/wizard`

Local-first Usermaven installation and instrumentation tooling.

The current package implements project inspection, validated AI-generated
tracking plans, preview, approval-bound application, a local MCP server, and the
machine-readable manifest:

```sh
npx @usermaven/wizard inspect .
npx @usermaven/wizard plan . --business-context ./business-context.json \
  --ai-proposal ./ai-proposal.json
npx @usermaven/wizard setup-plan . --workspace-name Example --region us \
  --key-fingerprint sha256:example --tracking-host https://events.example.com \
  --tracking-plan ./tracking-plan.json \
  --ai-instrumentation ./ai-instrumentation.json
npx @usermaven/wizard preview ./setup-plan.json
npx @usermaven/wizard approve ./setup-plan.json --operations install-sdk \
  --root /path/to/project --output ./approval.json
npx @usermaven/wizard apply ./setup-plan.json --approval ./approval.json \
  --root /path/to/project
npx @usermaven/wizard verification-session ./setup-plan.json \
  --environment staging
npx @usermaven/wizard verify ./setup-plan.json --session ./session.json \
  --evidence ./evidence.json --root /path/to/project
npx @usermaven/wizard manifest
npx -p @usermaven/wizard usermaven-wizard-mcp --root /path/to/project
```

The MCP server exposes the same application and four-layer verification
primitives but cannot create an application approval. Additional tools remain planned. See the
[project repository](https://github.com/usermaven/wizard) for the security model.
