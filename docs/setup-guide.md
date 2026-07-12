# Setup guide

This guide takes you from an uninstrumented project to verified Usermaven
analytics. There are three ways to run the flow:

- **Interactive guided setup (fastest)** — run `usermaven-wizard login` and
  then `usermaven-wizard setup .` in a terminal. It inspects the project,
  lets you pick your workspace from a list (details are filled in
  automatically; skip `login` to enter them manually), uses the baseline
  tracking plan (automatic page views), walks you through preview, approval,
  and apply in one sitting, and can finish by creating a starter dashboard
  in your workspace.
- **With a coding agent** — Claude Code, Cursor, or any MCP client drives the
  wizard's tools and drafts a custom tracking plan for you. You review the
  plan and approve the file changes in your terminal.
- **Manually with the CLI** — you run each phase yourself; the baseline plan
  needs no input files, and custom plans start from the templates in
  [`examples/`](../examples).

Either way, the wizard never sees your workspace key, never edits `.env*`
files, and never writes a file you did not explicitly approve.

## Prerequisites

1. **Node.js 20 or newer** in the project you are instrumenting.
2. **A supported framework** — Next.js (App or Pages Router), React + Vite,
   React, or Node.js. Run `usermaven-wizard inspect .` to check; unsupported
   frameworks are reported explicitly.
3. **A Usermaven workspace.** Sign in at
   [app.usermaven.com](https://app.usermaven.com) and open **Workspace
   settings → Setup instructions** to find:
   - your **workspace key** (you will place it in an environment variable
     yourself — the wizard never accepts its value);
   - your **tracking host** (`https://events.usermaven.com` for Usermaven
     Cloud, or your custom domain if you have one configured).
4. **The key fingerprint.** Setup plans reference your key by SHA-256
   fingerprint instead of its value:

   ```sh
   printf '%s' "YOUR_WORKSPACE_KEY" | sha256sum | awk '{print "sha256:" $1}'
   ```

> [!NOTE]
> Until `@usermaven/wizard` is published to npm, replace `usermaven-wizard`
> in the commands below with `node /path/to/wizard/packages/cli/dist/cli.js`
> after building the repository (see
> [Run from source](../README.md#run-from-source)).

## Option A: setup with a coding agent

1. Register the local MCP server with your agent — see the
   [local MCP guide](local-mcp.md) for Claude Code and Cursor configuration.
2. Ask the agent to run the setup, giving it your business context:

   > Set up Usermaven in this project using the usermaven-wizard tools.
   > Our product is «one sentence». Our key goals are «goals». Do not capture
   > «anything you consider sensitive». My workspace is named «name», region
   > «us/eu», tracking host «host», key fingerprint «sha256:…».

3. The agent inspects the project, drafts a tracking plan, and generates a
   setup plan. **Review the plan** — every AI-proposed event is marked
   `review_required` and nothing is applied yet.
4. When the agent reaches the approval step, it will hand back to you: run the
   `approve` command it prints **in your own terminal**. Approval is
   interactive by design; an agent cannot approve on your behalf.
5. The agent applies the approved operations and runs verification. Add your
   workspace key to `.env.local` (step 5 of Option B) before verifying.

The full agent contract — prompts, input formats, and review rules — is in the
[AI planning playbook](ai-tracking-plans.md).

## Option B: manual CLI setup

### 1. Inspect the project

```sh
usermaven-wizard inspect .
```

Confirms the detected framework and package manager. Read-only.

### 2. Create a tracking plan

The quickest path is the baseline plan — automatic page views, no input files:

```sh
usermaven-wizard plan . --baseline > tracking-plan.json
```

For custom events and identity calls, author the AI planning inputs instead
(start from the templates in [`examples/`](../examples)):

- `business-context.json` — your product, goals, key user journeys, and data
  policy in a few sentences each.
- `ai-proposal.json` — the events and identity calls you want, with names,
  descriptions, triggers, and properties. Start from the template's
  `link_created` example and replace it with your own events.

```sh
usermaven-wizard plan . \
  --business-context ./business-context.json \
  --ai-proposal ./ai-proposal.json > tracking-plan.json
```

### 3. Generate and preview the setup plan

```sh
usermaven-wizard setup-plan . \
  --workspace-name "My Workspace" \
  --region us \
  --key-fingerprint sha256:YOUR_FINGERPRINT \
  --tracking-host https://events.usermaven.com \
  --tracking-plan ./tracking-plan.json > setup-plan.json

usermaven-wizard preview ./setup-plan.json
```

Baseline plans need nothing else. AI-generated plans additionally require
`--ai-instrumentation ./ai-instrumentation.json` — the source-aware edits
produced by an agent (template:
[`examples/ai-instrumentation.json`](../examples/ai-instrumentation.json)).
The preview renders every operation — package install, generated client
module, instrumentation diffs — without changing anything.

### 4. Approve and apply

```sh
usermaven-wizard approve ./setup-plan.json \
  --operations install-usermaven-sdk,create-usermaven-client \
  --root "$(pwd)" \
  --output ./approval.json

usermaven-wizard apply ./setup-plan.json \
  --approval ./approval.json \
  --root "$(pwd)"
```

Use the operation IDs shown in the preview. Approval runs in an interactive
terminal, expires after a short TTL (default shown when you run it), and is
consumed by exactly one apply.

### 5. Set your environment variables

The generated client reads the key and tracking host from environment
variables — the wizard writes the _names_ into code but never the values.
Add them to `.env.local` (or your framework's equivalent):

| Framework            | Variables                                                          |
| -------------------- | ------------------------------------------------------------------ |
| Next.js              | `NEXT_PUBLIC_USERMAVEN_KEY`, `NEXT_PUBLIC_USERMAVEN_TRACKING_HOST` |
| React + Vite         | `VITE_USERMAVEN_KEY`, `VITE_USERMAVEN_TRACKING_HOST`               |
| React / Node / other | `USERMAVEN_PUBLIC_KEY`, `USERMAVEN_TRACKING_HOST`                  |

(Names are overridable with `--key-env-var` / `--tracking-host-env-var` at the
`setup-plan` step.)

### 6. Verify

```sh
usermaven-wizard verification-session ./setup-plan.json \
  --environment staging > verification-session.json

usermaven-wizard verify ./setup-plan.json \
  --session ./verification-session.json \
  --evidence ./verification-evidence.json \
  --trusted-workspace-keys ./trusted-workspace-keys.json \
  --root "$(pwd)"
```

Verification checks the applied files on disk and combines short-lived,
marker-bound evidence from your running app, the collector, and your
workspace. See the [verification playbook](verification-playbook.md) for how
to gather the evidence file and configure trusted workspace keys.

## Interrupted? Resume instead of restarting

Setup progress is checkpointed under `.usermaven/` in your project (keep this
directory out of version control). If a step fails or you close the terminal:

```sh
usermaven-wizard resume . --workflow-id <your-workflow-id>
```

returns the single next action, flagging any stale artifacts or expired
approvals along the way. Details in [workflow recovery](workflow-recovery.md).

## Next steps

- [Deployment guide](deployment.md) — ship the instrumented app to
  production with the right environment variables.
- [Troubleshooting](troubleshooting.md) — if verification fails or events
  don't arrive.
