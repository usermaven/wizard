# ADR 0001: Separate local code access from remote workspace access

- Status: Accepted
- Date: 2026-07-11

## Context

An installation assistant needs detailed knowledge of application source code
and authenticated access to a Usermaven workspace. Sending a repository to a
hosted agent would expand the privacy and security boundary unnecessarily.

## Decision

Project inspection, planning, diffs, edits, and runtime checks execute locally.
The hosted Usermaven MCP/API owns OAuth, workspace selection, analytics metadata,
and bounded workspace operations. Only normalized plans, public configuration,
and verification outcomes cross the boundary by default. Applying changes is a
separate, explicitly approved action.

## Consequences

Users can use their preferred coding agent without uploading source to
Usermaven. The local tool must implement robust path containment, redaction, and
approval handling. Cross-boundary contracts must be versioned and usable without
assuming a specific agent vendor.
