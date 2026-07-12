# Setup automation comparison

Reviewed against public product material on 2026-07-11.

| Capability                               | Usermaven Wizard 0.11                                         | Amplitude Wizard                                                                 | PostHog Wizard / MCP                                                           |
| ---------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Detect frameworks and existing analytics | Implemented, bounded and normalized                           | Implemented across a broad framework matrix                                      | Implemented across 16+ frameworks                                              |
| Propose a tracking plan                  | Agent-generated custom events/properties with strict review   | AI proposes events from the codebase                                             | AI wizard and program-specific audits                                          |
| Preview repository changes               | Typed local AI edits with hashes and item coverage            | Proposes changes before writing                                                  | Agent-driven preview/review flow                                               |
| Apply code changes                       | Exact digest/root/operation approval, one-use state, rollback | Applies after user approval                                                      | AI wizard modifies the application                                             |
| MCP role                                 | Local planning plus approval-bound apply                      | Read-only local setup MCP paired with apply CLI; separate product MCP            | Hosted product MCP plus separate AI setup wizard                               |
| Source privacy default                   | Model/source permissions stay in the agent host               | AI analyzes the local codebase; public docs do not promise a local-only boundary | Wizard sends selected source to Anthropic through PostHog's gateway by default |
| Verify live events                       | Marker-bound static/runtime/transport/workspace checks        | Polls for event arrival                                                          | Setup wizard includes verification-oriented flow                               |
| Resume/checkpoints                       | Digest-bound artifacts, expiry and interrupted-apply recovery | Implemented                                                                      | No equivalent public contract identified                                       |
| Starter dashboards                       | Not implemented                                               | Creates charts and a dashboard                                                   | Creates a starter dashboard                                                    |

## What the comparison means

Amplitude is the closest direct reference for the complete setup loop: detect,
authenticate, plan, approve, instrument, verify, and create starter analytics.
Its local setup MCP is deliberately read-only and pairs planning with an apply
CLI, which closely validates Usermaven's separation between agent planning and a
separately authorized mutation.

PostHog also provides end-to-end instrumentation automation and has broader
programs for audits, revenue, warehouse, and self-driving workflows. Its hosted
MCP primarily operates the PostHog product; code instrumentation lives in the
Wizard. PostHog documents a session-scoped secret vault, but its default Wizard
flow sends selected source files to Anthropic through PostHog's gateway.

## Usermaven gaps to close next

1. Browser-based OAuth/device sign-in (today the CLI signs in with
   email/password + 2FA or an organization API key).
2. More framework adapters and fixture coverage.

Closed since this comparison was written: interactive guided `setup`,
deterministic baseline plans without AI inputs, `doctor` diagnostics,
`report` setup reports, an `uninstall` checklist, a bundled Claude Code
skill (0.12.0), and — in 0.13.0 — API sign-in (`login`/`whoami`/
`workspaces`), workspace auto-selection inside guided setup, and a
`starter-dashboard` command that creates visitors/pageviews/sessions/top-pages
charts after setup.

## Official references

- [Amplitude Wizard CLI](https://amplitude.com/docs/get-started/setup-wizard-cli)
- [Amplitude MCP](https://amplitude.com/docs/amplitude-ai/amplitude-mcp)
- [PostHog Wizard](https://github.com/PostHog/wizard)
- [PostHog MCP](https://posthog.com/docs/model-context-protocol)
