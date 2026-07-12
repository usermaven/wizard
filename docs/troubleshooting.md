# Troubleshooting

Start with the built-in diagnostics — they check your Node.js version,
project root, framework support, private state directory, and (optionally)
tracking-host reachability:

```sh
usermaven-wizard doctor . --tracking-host https://events.usermaven.com
```

Symptoms below are grouped by phase. Every CLI command prints structured
JSON; the `code` field in an error is the fastest way to find the right
section here.

## Inspection and planning

**Framework detected as `unknown` or listed under `unsupported_frameworks`.**
The wizard currently generates integrations for Next.js (App and Pages
Router), React + Vite, React, and Node. Astro, Nuxt, Remix, Svelte/SvelteKit,
and Vue are recognized but not yet supported — the inspection output says so
explicitly rather than guessing. For an unsupported framework, install the
[SDK manually](https://usermaven.com/docs) for now.

**`invalid_project_path`.** Pass the project root (the directory holding
`package.json`), use an absolute path for `--root`, and make sure it is the
canonical path — symlinked paths are rejected because approvals bind to the
real root.

**`plan` rejects the AI proposal.** Every event needs a name, description,
trigger, and typed properties, and revenue events additionally need revenue
context and server authority. The error lists the exact failing field; compare
with [`examples/ai-proposal.json`](../examples/ai-proposal.json) and the
[AI planning playbook](ai-tracking-plans.md).

## Approval and apply

**`approval_expired`.** Approvals live minutes, not hours (`--ttl-minutes`,
max 60). Re-run `approve`; nothing was applied.

**`approval_replayed`.** Each approval is consumed by exactly one `apply`. If
an apply partially failed, don't retry with the same artifact — inspect the
state first (see the stuck-apply entry below), then create a fresh approval.

**`approval_invalid` / `plan_mismatch`.** The approval binds the plan digest,
repository root, and operation IDs. Regenerating the setup plan changes its
digest, which invalidates earlier approvals — approve the plan you are
actually applying, from the same `--root`.

**`approve` fails with a terminal error.** Approval requires an interactive
TTY by design; it cannot run inside a pipe, CI job, or unattended agent
process. Run it in a real terminal.

**`stale_file_hash` / `artifact_stale`.** A file changed between planning and
apply (or an artifact on disk no longer matches its recorded digest). Re-run
`setup-plan` and `preview` so the plan reflects the current tree, then
approve again.

**Apply was interrupted and now refuses to run.** Inspect and, if genuinely
stale, release the lock:

```sh
usermaven-wizard apply-lock . --approval-id <id>
usermaven-wizard recover-lock . --approval-id <id> --confirm "RECOVER <id>"
```

See [workflow recovery](workflow-recovery.md) for the full decision tree.

## Verification

**Static layer fails.** The applied files no longer match the plan's recorded
hashes — someone edited the generated client or instrumentation after apply.
Re-run `preview` to see the drift; re-apply if the edits were accidental.

**Runtime/transport layers fail or time out.** The verification session is
short-lived and marker-bound: the app you exercise must be running with the
environment variables set, and the evidence must be collected within the
session TTL. Open a fresh session, restart the app so build-time variables
are picked up, and gather evidence again per the
[verification playbook](verification-playbook.md).

**Workspace layer fails with an attestation error.** Workspace receipts must
be signed by a key listed in your `--trusted-workspace-keys` file; unsigned
or unknown-key receipts can never produce a pass. Confirm the file contains
the current Usermaven workspace public keys.

## Events not showing up in Usermaven

1. **Variables missing at build time.** `NEXT_PUBLIC_*` / `VITE_*` values are
   inlined during the build. If the key variable was unset when you built,
   the generated client initializes to `null` and silently no-ops. Set the
   variable and rebuild — see the [deployment guide](deployment.md).
2. **Ad blockers.** Third-party collector hosts are frequently blocked.
   Configure a custom tracking domain and point the tracking-host variable at
   it ([deployment guide](deployment.md#custom-tracking-domain)).
3. **Wrong workspace.** The key in your environment decides where events
   land; check you're not looking at production data with a staging key (or
   vice versa).

## MCP server

Client configuration, tool-listing problems, and root-mismatch errors are
covered in the [local MCP guide](local-mcp.md). The most common issue: the
`--root` passed to the server must be the same canonical absolute path you
approve and apply against.

## Still stuck?

Open an issue at
[github.com/usermaven/wizard](https://github.com/usermaven/wizard/issues)
with the JSON error output (it contains no source code or secret values), or
report security concerns per [SECURITY.md](../SECURITY.md).
