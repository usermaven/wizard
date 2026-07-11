# Workflow checkpoint and recovery playbook

Wizard `0.11.0` can persist and resume the setup workflow without becoming an
agent runtime. A checkpoint records the canonical repository fingerprint, last
completed setup step, repository-relative artifact paths, and canonical SHA-256
digests. It does not store model prompts, source snapshots, environment values,
workspace keys, approval contents, verification payloads, or general agent
memory.

## Start and update a workflow

Start immediately after a successful inspection:

```sh
usermaven-wizard checkpoint . --step inspection_completed
```

Keep the returned `workflow_id`. After writing each JSON result into the same
repository, advance the checkpoint with that ID:

```sh
usermaven-wizard checkpoint . \
  --workflow-id workflow_example-1234 \
  --step tracking_plan_created \
  --tracking-plan tracking-plan.json

usermaven-wizard checkpoint . \
  --workflow-id workflow_example-1234 \
  --step setup_plan_created \
  --setup-plan setup-plan.json

usermaven-wizard checkpoint . \
  --workflow-id workflow_example-1234 \
  --step preview_completed

usermaven-wizard checkpoint . \
  --workflow-id workflow_example-1234 \
  --step approval_created \
  --approval approval.json
```

Later steps use `--apply-result`, `--session`, and
`--verification-result`. Earlier artifact references are retained and checked
on every update. Checkpoints can advance or repeat the current step, but cannot
move backward. Start a new workflow when replanning invalidates earlier work.

All artifact paths must be regular, non-symlink files inside the canonical
repository root and no larger than 5 MB. State is written atomically with mode
`0600` under `.usermaven/workflows`; per-workflow locks prevent concurrent
updates. Keep `.usermaven/` out of version control.

## Resume safely

```sh
usermaven-wizard resume . --workflow-id workflow_example-1234
```

Resume re-reads every referenced artifact, validates its schema and exact
digest, checks cross-artifact plan/session/root binding, and returns one
`next_action`. It does not execute that action.

- Changed or missing artifacts are `stale` and are never silently reused.
- Expired approvals produce `request_approval`; the wizard never extends them.
- A consumed approval with a completed apply record advances to verification or
  remediation.
- An apply lock without a completion record is `interrupted` and produces
  `inspect_apply_state`. Never replay that approval automatically.
- Expired verification sessions produce `prepare_verification` so a new marker
  is used.
- Only a passing verification result marks the workflow `complete`. Warning
  results request fresh evidence; failed results request remediation.

Do not delete an apply lock merely to force a retry. First inspect the working
tree, package state, `.usermaven/apply/<approval-id>.json`, and the relevant
process. Uncertain apply state requires a fresh plan and approval after manual
reconciliation.

## MCP usage and boundary

The local server exposes `checkpoint_workflow` and `resume_workflow` with the
same behavior. `checkpoint_workflow` mutates only private Wizard state and does
not need application-change approval. `resume_workflow` is read-only. The host
agent remains responsible for invoking models and tools, saving artifacts,
showing approval UI, and following the returned next action.

This boundary excludes generic model execution, durable agent runs, scheduling,
tool-loop orchestration, multi-agent coordination, and long-term memory. Those
belong in the agent host/runtime, not this repository.
