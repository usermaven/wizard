# Review remediation guide — 2026-07-11

This guide is maintained beside [`REVIEW-2026-07-11.md`](../REVIEW-2026-07-11.md)
and is the completion ledger for that review. A checked item requires code,
focused regression tests, and the full repository validation suite. The review
remains the source description; this document records implementation decisions
and proof.

## Release gates

- [x] A supported fixture can be inspected, planned, approved, applied, built,
      exercised, and verified with a real emitted event.
- [x] Unsupported frameworks stop with a typed actionable error and never
      receive fallback browser code.
- [x] An MCP caller cannot mint or broaden an application approval.
- [x] A verification pass cannot be created from unauthenticated evidence.
- [x] The full CLI and MCP flow can proceed through artifact references without
      repeatedly embedding setup plans.
- [x] `npm run check`, focused end-to-end fixtures, package dry-runs, audit, and
      stdio MCP smoke all pass.

## P0 — working installation

- [x] **1: Next.js `src/app` / `src/pages` detection.** Inspection now reports
      the actual layout directory and digest-bound entry point. Covered by the
      `next-src-app-router` fixture.
- [x] **2: Deterministic application wiring.** Supported adapters emit an exact
      approved entry/layout operation and enable baseline pageviews.
- [x] **3: Invalid generic browser output.** Setup planning now refuses generic
      React, Node, and unknown frameworks rather than emitting `process.env`
      browser code.
- [x] Execute a real collector-observed event in a built fixture; syntax-only
      compilation is not sufficient for closing the release gate.

## P0 — trust boundaries

- [x] **4 (protocol boundary): signed approval registry.** Approvals are HMAC
      authenticated with a private checkout key, registered under
      `.usermaven/approvals`, loaded by ID by MCP, and verified again by core.
- [x] **4 (shell boundary): bounded security claim.** The threat model and
      embedding playbook explicitly limit the local HMAC control to the MCP
      protocol boundary. Same-user arbitrary shell/filesystem agents require a
      separately permissioned approval broker and are not claimed as protected.
- [x] **5: missing env-name false pass.** Optional names are never coerced to
      `"undefined"`; absent key names fail the static reference check.
- [x] **6: deterministic canonicalization.** All security/business digests use
      one code-point ordered canonical JSON implementation.
- [x] **7: approve/apply TOCTOU.** Package manifests, lockfiles, planned edits,
      and create targets are bound into the signed approval context.
- [x] **Additional finding: evidence authenticity.** A passing workspace receipt
      requires a trusted-key Ed25519 attestation over the session and normalized
      receipt. Remote MCP key rollout remains an operational dependency.

## P1 — usable agent and human flow

- [x] **8:** sanitized typed MCP error taxonomy with retryability and bounded
      field details.
- [x] **9:** structured approval-required handoff with operation IDs and the
      exact local command.
- [x] **10:** private digest-addressed setup-plan artifacts across MCP and CLI
      preview, approval, apply, session preparation, and verification.
- [x] **11:** guided `setup` / `next` human flow and default private artifacts.
      The model remains in the host by design; Wizard creates private inputs,
      checkpoints progress, and returns the exact next command.
- [x] **12:** digest/entry-point edit affordances, automatic verification
      handoff, and safe environment-example assistance.

## P2 — correctness and robustness

- [x] **13:** parse only actual unified-diff headers.
- [x] **14:** emit build checks only when scripts exist and define check-failure
      transaction semantics.
- [x] **15:** align proposal, operation, risk, and warning caps.
- [x] **16:** dependency-aware tokens and recognition of generated output.
- [x] **17:** workspace-aware upward package-manager discovery.
- [x] **18:** version-aware Yarn Modern install behavior.
- [x] **19:** single-source version/tool manifest and correct approve metadata.
- [x] **20–22:** approval output and CLI parsing/TTL correctness.
- [x] **23:** corrupt apply records return recovery state instead of throwing.
- [x] **24–25:** explicit rollback outcomes and error-specific consumed checks.
- [x] **26:** reject symlinked artifact parent directories.
- [x] **27:** stale-lock inspection and recovery tooling.
- [x] **28:** advertise representable output invariants and test runtime-only
      refinements separately.
- [x] **29:** flag AI-created source-derived content in previews.
- [x] **30:** enforce or remove decorative planned checks.
- [x] **31:** precompute source line offsets.
- [x] **32:** explicitly report scanned-but-unsupported frameworks.
- [x] **33:** graceful SIGTERM handling.

## Required regression matrix

- [x] Root and `src/` layouts for every supported framework adapter.
- [x] Generated code syntax/type compilation and real runtime event delivery.
- [x] Approval TTL, duplicate/unknown/manual-only IDs, forgery, cross-root,
      broadening, replay, and concurrent apply.
- [x] Missing env names and authenticated/unauthenticated verification evidence.
- [x] Successful generated edit, diff-header edge cases, and cap boundaries.
- [x] npm, pnpm, Yarn Classic/Modern, Bun, and monorepo package discovery.
- [x] Corrupt records, symlink parents, stale locks, and interrupted workflows.
- [x] CLI parsing, artifact-reference flow, MCP tool contracts, and stdio smoke.

## Operating rule

Do not mark a checkbox from intent or an indirect test. Each checkbox needs a
focused assertion that would fail on the reviewed implementation. Keep this
guide updated in the same commit as the corresponding code and tests.
