# Contributing

Usermaven Wizard is early-stage. Please open an issue before a large behavioral
change so the contract and trust-boundary implications can be reviewed first.

## Local checks

Use Node.js 20 or newer, then run:

```sh
npm install
npm run check
```

Contract changes require tests and documentation. Breaking changes require a
new `schema_version`; adding an optional field does not. Never weaken approval,
path-containment, secret-redaction, or raw-payload protections to make a fixture
pass.

Commits must not contain real API keys, workspace identifiers, analytics
payloads, or customer source code. Please report security issues according to
[SECURITY.md](SECURITY.md).
