# Public contracts

All contracts use `schema_version: "1"`, strict object validation, bounded
strings, and ISO 8601 timestamps with an explicit offset. The source of truth is
`@usermaven/wizard-schemas`.

## Project inspection

An inspection result records the detected framework and package manager,
normalized detection evidence, known analytics dependencies, recognized
instrumentation tokens, and scan-limit statistics. Occurrences contain provider,
kind, repository-relative path, line number, and a fixed token label. Source
snippets and matched values are not part of the contract.

## Tracking plan

A tracking plan records identity points, event candidates, shared properties,
runtime triggers, ownership, PII classification, and implementation status.
AI-generated items must include confidence, rationale, proposed status, and a
mandatory-review marker. The final plan records model provider/name, prompt
contract version, assumptions, warnings, normalized source inspection, and a
digest of the business context without retaining that context.
Revenue events require `amount`, `currency`, and `transaction_id` properties and
cannot use a client-only authority. These requirements make revenue segmentation
and deduplication explicit before code changes are generated.

The agent may propose custom business events. Revenue proposals additionally
require an explicitly enabled revenue context and an authoritative confirmation
path; they can never be client-only.

## Setup plan

A setup plan binds a tracking plan to a detected project and workspace public-key
fingerprint. Operations are discriminated and reviewable. Package installation,
file creation, and file editing require `requires_approval: true`. File paths are
repository-relative and cannot traverse parent directories.

Workspace setup input contains a tracking host, key fingerprint, and environment
variable names. It never contains the public-key value. Change previews render
typed operation content and explicitly mark previews containing repository source
context; rendering does not execute an operation.

An AI instrumentation proposal binds itself to one tracking-plan ID and records
model provenance. Each edit carries its exact preimage hash and single-file
unified diff; each create carries bounded content. Changes declare the identity
and event items they implement. Every tracking item must be covered or listed as
deferred with a reason, and an item cannot be both. The setup plan retains the
mapping from each generated operation ID to its covered tracking items for
preview, approval, and audit.

## Approval and application result

A change approval binds one setup-plan digest, canonical repository-root
fingerprint, exact unique operation IDs, confirmation time, and expiry. The
current issuer is an interactive local user. Application validates every binding
and records consumption under `.usermaven/apply/` so an approval cannot be
replayed.

The application result records normalized operation outcomes, rollback status
and warnings, timestamps, and the relative state-record path. It never includes
source, command output, environment values, or secrets. Successful file changes
are atomic. Rollback restores captured files, but package-manager caches,
`node_modules`, and build artifacts can require manual cleanup.

## Agent event stream

Long-running commands emit one JSON object per line. Events include a run ID,
monotonic sequence, timestamp, and a discriminated event type. Consumers must
ignore ordinary stdout only when they explicitly selected human-readable mode;
agent mode will reserve stdout for NDJSON.

## Verification result

A verification session binds a random marker, exact setup-plan digest, environment,
creation time, and expiry of at most one hour. Normalized evidence records its
source, observation time, event/property names, identity booleans, and marker
matching. Transport evidence adds only collector host/status; workspace evidence
adds only the public-key fingerprint.

Verification summarizes checks across four layers: exact static configuration,
runtime behavior, network transport, and receipt by the selected workspace. It
may include event and property names but cannot include captured values, request
bodies, headers, cookies, identities, or raw payloads.

## Manifest

`usermaven-wizard manifest` describes commands and planned local MCP tools,
including whether they mutate the repository and require approval. Clients
should read this rather than infer safety from tool names. The optional
`availability` field distinguishes implemented surfaces from planned contracts.
`mutates_local_state` separately identifies internal Wizard state writes such as
workflow checkpoints; these do not authorize application source changes.
