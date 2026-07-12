# Approval and application playbook

This workflow lets a developer or MCP client apply selected setup operations
without giving the agent authority to approve its own changes.

## 1. Generate and inspect a plan

```sh
usermaven-wizard setup-plan /path/to/project \
  --workspace-name Example \
  --region us \
  --key-fingerprint sha256:example \
  --tracking-host https://events.example.com \
  --tracking-plan tracking-plan.json \
  --ai-instrumentation ai-instrumentation.json > setup-plan.json

usermaven-wizard preview setup-plan.json
```

Review operation IDs, file content or diffs, package versions, manual steps, and
build checks. Planning and preview are read-only.

## 2. Create an exact approval

Run this in a real terminal, not through an unattended agent process:

```sh
usermaven-wizard approve setup-plan.json \
  --operations install-usermaven-sdk,create-usermaven-client \
  --root /path/to/project \
  --ttl-minutes 15 \
  --output approval.json
```

When `setup-plan` already stored the private artifact, the equivalent command
avoids another full JSON round trip:

```sh
usermaven-wizard approve --root /path/to/project \
  --plan-digest sha256:... \
  --operations install-usermaven-sdk,create-usermaven-client
```

The CLI displays the plan ID, digest, and selected operations and requires an
exact typed confirmation. The artifact is mode `0600`, short-lived, and bound to
the canonical repository root. Treat it as a temporary local capability and do
not commit it.

## 3. Apply with the CLI or MCP

```sh
usermaven-wizard apply setup-plan.json \
  --approval approval.json \
  --root /path/to/project
```

If approval was registered without an additional output file, use its ID:

```sh
usermaven-wizard apply --root /path/to/project \
  --plan-digest sha256:... \
  --approval-id approval_...
```

An MCP client passes the unchanged plan and only the returned `approval_id` to
`apply_changes`. The server loads the private artifact registered under
`.usermaven/approvals/`, verifies its checkout-local HMAC, and then consumes it.
The MCP process is fixed to its startup `--root` and cannot create or broaden an
approval through the protocol.

Application checks the plan digest, root fingerprint, operation IDs, expiry,
one-time use, path confinement, symlink parents, and edit preimage hashes. File
creates and replacements are atomic. Commands use argument arrays without a
shell; dependency installs disable lifecycle scripts; build checks are
allowlisted.

## 4. Inspect the result

Every attempt returns or persists a normalized result under
`.usermaven/apply/`. A consumed approval cannot be replayed, including after a
failed operation. On failure, the wizard restores captured files in reverse
order and marks prior operations as rolled back.

A successful result also contains a short-lived `verification_session` for the
`local` environment, so an agent can immediately set its marker and collect the
combined runtime/transport evidence artifact. Use `verification-session` only
when a different environment or a fresh observation window is needed.

Rollback is intentionally bounded. Package-manager caches and `node_modules`
changes can remain after an install attempt, and repository-defined build scripts
can create artifacts outside the snapshots. Inspect the working tree and the
result warnings before retrying with a new plan and approval.

## Embedding requirement

`createChangeApproval` accepts a literal confirmation flag because the core
library cannot prove who controls the terminal. Any UI or agent host embedding
the library must independently enforce a real human confirmation. The CLI
authenticates the resulting artifact with a checkout-local HMAC. This protects
the MCP protocol boundary; a coding agent running as the same OS user with
unrestricted shell access still requires a separately permissioned approval
broker for a stronger boundary.

After a successful apply, continue with the [verification
playbook](verification-playbook.md).
