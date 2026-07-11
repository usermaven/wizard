# Architecture

## Purpose

The wizard converts a local application and an authenticated Usermaven
workspace into an inspectable plan, approved code changes, and evidence that the
integration works. It separates source-code access from workspace access.

```text
Coding agent or developer
          |
          v
Local CLI / local MCP server --------> local repository
          |
          | normalized plans and authenticated workspace calls
          v
Remote Usermaven MCP / API ----------> selected Usermaven workspace
```

The local process may read project files within an allowed repository root. The
remote service must not receive source files, diffs, environment files, or raw
verification payloads by default. The remote service is responsible for OAuth,
workspace selection, metadata, read-only analytics tools, and future bounded
installation sessions.

## Execution phases

1. `inspect` detects the framework, package manager, analytics SDKs, and known
   instrumentation calls. It scans an allowlisted set of source extensions,
   skips symlinks and generated/dependency directories, enforces file and byte
   limits, and returns normalized project facts without source snippets.
2. `plan` converts normalized inspection evidence into a versioned,
   deterministic tracking baseline. Phase 1 proposes page views and user
   identity only, records assumptions and warnings, and makes no changes.
3. `setup-plan` binds public workspace metadata, inspection, and the tracking
   baseline into typed install/create/manual/check operations. It accepts an
   environment-variable name and key fingerprint, never the public-key value.
4. `preview` renders each proposed operation and diff without executing it.
5. `approve` requires a local interactive confirmation and emits a short-lived,
   one-use artifact bound to the plan digest, repository root, and operation IDs.
6. `apply` consumes that artifact. It rejects stale file hashes, paths outside
   the repository, altered plans, and unapproved operations, and attempts file
   rollback on failure.
7. `verify` runs static, runtime, transport, and workspace-receipt checks. It
   reports names and outcomes, not raw values.

## Local MCP surface

The local stdio MCP server exposes `inspect_project`, `propose_tracking_plan`,
`generate_setup_plan`, `preview_changes`, and `apply_changes`. The first four are
read-only. `apply_changes` is structured and confined to a canonical root, but
destructive: it accepts only a separately created, exact, unexpired approval.
The MCP server cannot create approvals.

## Remote installation sessions

A future remote endpoint may create short-lived installation sessions. A
session should be scoped to one user, workspace, repository fingerprint, and
plan; contain no reusable ingestion secret; expire quickly; and be revocable.
The local wizard should exchange only minimum metadata and normalized results.
This backend is not part of Phase 0.

## Version support

- Runtime: supported Node.js LTS releases, initially Node 20 and 22.
- Contracts: readers reject unknown major `schema_version` values. Additive,
  optional changes retain the version; incompatible changes introduce a new
  version and a migration note.
- Framework fixtures: the newest stable major and one previous stable major are
  the intended support window after adapters are implemented.
- Package releases follow semantic versioning. Before `1.0`, minor releases may
  change experimental command behavior, but published schema versions remain
  compatible.
