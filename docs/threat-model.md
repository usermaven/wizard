# Threat model

## Protected assets

- Repository source, history, and intellectual property
- Environment variables, package-registry credentials, and Usermaven keys
- Workspace analytics, identities, revenue values, and customer data
- Developer workstation integrity and the correctness of generated changes
- OAuth grants and future installation-session tokens

## Trust boundaries

The developer or coding agent invokes a local wizard process. The repository is
inside the local filesystem boundary but its contents are untrusted. The remote
Usermaven MCP/API, package registries, and analytics ingestion endpoints cross a
network boundary. Output shown for human approval crosses a decision boundary.

## Primary threats and controls

| Threat                                                   | Required control                                                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Prompt injection in source, comments, docs, or filenames | Treat repository text only as data; never interpret it as wizard instructions or approval.                   |
| Reading outside the selected repository                  | Resolve the root, traverse only descendants, skip symlinks, and reject parent traversal in output paths.     |
| Silent or over-broad changes                             | Separate planning from applying; bind explicit approval to exact operation IDs and file hashes.              |
| Command injection                                        | Use argument arrays and allowlisted commands; do not pass generated strings through a shell.                 |
| Secret disclosure                                        | Deny known secret files, redact output, never return environment values, and keep source local by default.   |
| Analytics-data leakage                                   | Verify using normalized names and outcomes; never persist or return raw payloads.                            |
| Misleading inferred events                               | Keep baseline planning deterministic, attach rationale/confidence, require review, and do not infer revenue. |
| Wrong-workspace writes or reads                          | Display the selected workspace and public-key fingerprint; scope OAuth/session tokens to one workspace.      |
| Dependency compromise                                    | Pin release tooling, publish with provenance, review lockfile changes, and minimize runtime dependencies.    |
| Stale-plan overwrite                                     | Record and re-check file content hashes before applying an edit.                                             |
| Token theft or replay                                    | Use short-lived, audience-bound tokens, rotation, revocation, PKCE for OAuth, and replay detection.          |

## Current limitations

The inspector is a privacy-reducing application control, not an operating-system
sandbox. A process with broader filesystem permission still relies on the
wizard's traversal rules. The local MCP surface is read-only and stdio-only. The
repository does not yet mutate files, capture traffic, or authenticate to
Usermaven. Those features must satisfy this threat model before release.
