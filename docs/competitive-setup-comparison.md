# Setup automation comparison

Reviewed against public product material on 2026-07-11.

| Capability                               | Usermaven Wizard 0.7                                          | Amplitude Wizard                                                                 | PostHog Wizard / MCP                                                           |
| ---------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Detect frameworks and existing analytics | Implemented, bounded and normalized                           | Implemented across a broad framework matrix                                      | Implemented across 16+ frameworks                                              |
| Propose a tracking plan                  | Agent-generated custom events/properties with strict review   | AI proposes events from the codebase                                             | AI wizard and program-specific audits                                          |
| Preview repository changes               | Typed local preview                                           | Proposes changes before writing                                                  | Agent-driven preview/review flow                                               |
| Apply code changes                       | Exact digest/root/operation approval, one-use state, rollback | Applies after user approval                                                      | AI wizard modifies the application                                             |
| MCP role                                 | Local planning plus approval-bound apply                      | Read-only local setup MCP paired with apply CLI; separate product MCP            | Hosted product MCP plus separate AI setup wizard                               |
| Source privacy default                   | Model/source permissions stay in the agent host               | AI analyzes the local codebase; public docs do not promise a local-only boundary | Wizard sends selected source to Anthropic through PostHog's gateway by default |
| Verify live events                       | Not implemented                                               | Polls for event arrival                                                          | Setup wizard includes verification-oriented flow                               |
| Resume/checkpoints                       | Not implemented                                               | Implemented                                                                      | No equivalent public contract identified                                       |
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

1. Static, runtime, transport, and workspace-receipt verification.
2. Checkpoint/resume and recovery UX around interrupted setup.
3. OAuth and workspace selection inside the published developer flow.
4. Starter events, charts, and dashboards after successful verification.
5. More framework adapters and fixture coverage.
6. Automated implementation of reviewed custom events beyond generated manual
   wiring operations.

## Official references

- [Amplitude Wizard CLI](https://amplitude.com/docs/get-started/setup-wizard-cli)
- [Amplitude MCP](https://amplitude.com/docs/amplitude-ai/amplitude-mcp)
- [PostHog Wizard](https://github.com/PostHog/wizard)
- [PostHog MCP](https://posthog.com/docs/model-context-protocol)
