# Approval and application playbook

This workflow lets a developer or MCP client apply selected setup operations
without giving the agent authority to approve its own changes.

## 1. Generate and inspect a plan

```sh
usermaven-wizard setup-plan /path/to/project \
  --workspace-name Example \
  --region us \
  --key-fingerprint sha256:example \
  --tracking-host https://events.example.com > setup-plan.json

usermaven-wizard preview setup-plan.json
```

Review operation IDs, file content or diffs, package versions, manual steps, and
build checks. Planning and preview are read-only.

## 2. Create an exact approval

Run this in a real terminal, not through an unattended agent process:

```sh
usermaven-wizard approve setup-plan.json \
  --operations install-sdk,create-integration \
  --root /path/to/project \
  --ttl-minutes 15 \
  --output approval.json
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

An MCP client may instead pass the unchanged plan and approval to
`apply_changes`. The MCP process is fixed to its startup `--root` and cannot
create an approval.

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

Rollback is intentionally bounded. Package-manager caches and `node_modules`
changes can remain after an install attempt, and repository-defined build scripts
can create artifacts outside the snapshots. Inspect the working tree and the
result warnings before retrying with a new plan and approval.

## Embedding requirement

`createChangeApproval` accepts a literal confirmation flag because the core
library cannot prove who controls the terminal. Any UI or agent host embedding
the library must independently enforce a real human confirmation. This is a
procedural local safety boundary, not authentication or a cryptographic
signature.
