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
Revenue events require `amount`, `currency`, and `transaction_id` properties and
cannot use a client-only authority. These requirements make revenue segmentation
and deduplication explicit before code changes are generated.

## Setup plan

A setup plan binds a tracking plan to a detected project and workspace public-key
fingerprint. Operations are discriminated and reviewable. Package installation,
file creation, and file editing require `requires_approval: true`. File paths are
repository-relative and cannot traverse parent directories.

## Agent event stream

Long-running commands emit one JSON object per line. Events include a run ID,
monotonic sequence, timestamp, and a discriminated event type. Consumers must
ignore ordinary stdout only when they explicitly selected human-readable mode;
agent mode will reserve stdout for NDJSON.

## Verification result

Verification summarizes checks across four layers: static configuration,
runtime behavior, network transport, and receipt by the selected workspace. It
may include event and property names but must not include captured values or raw
payloads.

## Manifest

`usermaven-wizard manifest` describes commands and planned local MCP tools,
including whether they mutate the repository and require approval. Clients
should read this rather than infer safety from tool names.
