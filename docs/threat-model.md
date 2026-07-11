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

| Threat                                                   | Required control                                                                                                              |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Prompt injection in source, comments, docs, or filenames | Treat repository text only as data; never interpret it as wizard instructions or approval.                                    |
| Reading outside the selected repository                  | Resolve the root, traverse only descendants, skip symlinks, and reject parent traversal in output paths.                      |
| Silent or over-broad changes                             | Separate planning from applying; bind explicit approval to exact operation IDs and file hashes.                               |
| Command injection                                        | Use argument arrays and allowlisted commands; do not pass generated strings through a shell.                                  |
| Secret disclosure                                        | Deny known secret files, redact output, never return environment values, and keep source local by default.                    |
| Analytics-data leakage                                   | Verify using normalized names and outcomes; never persist or return raw payloads.                                             |
| Misleading AI-generated events                           | Require explicit business context, provenance, rationale/confidence, proposed status, and human review.                       |
| Unsupported revenue inference                            | Require enabled revenue context, standard revenue properties, deduplication, and server-capable authority.                    |
| Hallucinated or stale AI source edit                     | Bind edits to regular files, exact hashes, matching diff paths, plan-item coverage, and explicit approval.                    |
| AI edit of secrets or tool state                         | Reject environment, credential, package-manifest, lockfile, `.git`, `.usermaven`, dependency, symlink, and out-of-root paths. |
| Historical events mistaken for verification              | Use a random short-lived session marker and reject evidence outside its bounded observation window.                           |
| Receipt from the wrong workspace                         | Bind receipt evidence to the selected public-key fingerprint and suppress mismatched received names.                          |
| Raw verification payload leakage                         | Accept strict normalized evidence only; return names, counts, booleans, statuses, and suggested fixes.                        |
| Workspace key disclosure                                 | Accept only a key fingerprint and environment-variable name; reject raw key fields at contract boundaries.                    |
| Preview mistaken for execution                           | Label previews as non-executing and retain approval requirements on every mutation operation.                                 |
| Wrong-workspace writes or reads                          | Display the selected workspace and public-key fingerprint; scope OAuth/session tokens to one workspace.                       |
| Dependency compromise                                    | Pin release tooling, publish with provenance, review lockfile changes, and minimize runtime dependencies.                     |
| Stale-plan overwrite                                     | Record and re-check file content hashes before applying an edit.                                                              |
| Forged, broadened, or replayed approval                  | Mint after exact interactive confirmation; authenticate in a private registry, bind plan/root/IDs/expiry, and consume once.   |
| Partial mutation after failure                           | Snapshot bounded regular files, write atomically, roll back in reverse order, and report residual effects.                    |
| Package lifecycle or shell injection                     | Use shell-free argument arrays, allowlist checks, and disable dependency lifecycle scripts during install.                    |
| Token theft or replay                                    | Use short-lived, audience-bound tokens, rotation, revocation, PKCE for OAuth, and replay detection.                           |

## Current limitations

The inspector is a privacy-reducing application control, not an operating-system
sandbox. A process with broader filesystem permission still relies on the
wizard's traversal rules. The local MCP surface is stdio-only; its one mutating
tool requires an externally minted approval. Package-manager cache and
`node_modules` changes and repository-defined build artifacts are outside the
file rollback boundary. The repository does not yet capture traffic or
authenticate to Usermaven.
