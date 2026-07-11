# Verification playbook

Verification proves four different things: the approved files are present, the
reviewed triggers execute, the selected collector accepts the events, and the
selected Usermaven workspace receives the same marked test run. The wizard uses
normalized names and booleans and never accepts or returns raw event payloads.

## 1. Create a short-lived session

After applying the approved setup plan:

```sh
usermaven-wizard verification-session setup-plan.json \
  --environment staging > verification-session.json
```

The session lasts 30 minutes by default and at most one hour. It is bound to the
exact setup-plan digest and contains a random `session_id` and marker property
`_usermaven_verification_id`. Use that property and session ID only on controlled
verification events. Do not add it to ordinary production events.

For browser tests, set the opt-in global before exercising the journeys:

```js
window.__USERMAVEN_VERIFICATION_ID__ = session.session_id;
```

Generated client code exposes `usermavenVerificationProperties()`, which is
empty unless that global is a string. Reviewed client instrumentation should
merge the helper into testable calls. For controlled server tests, set
`USERMAVEN_VERIFICATION_ID` and have the reviewed server instrumentation add the
same reserved property only when the variable is present. Clear either value
immediately after the run.

With MCP, call `prepare_verification` with the unchanged setup plan and
environment.

## 2. Exercise the reviewed journeys

Use a controlled internal account and an authorized browser or E2E observer.
Exercise every event and identity trigger in the tracking plan. The observer
should record only:

- event and property names;
- whether user/company identity executed;
- collector host, response status, and accepted/rejected outcome;
- whether the verification marker matched.

Do not copy request bodies, property values, cookies, headers, user IDs, or
session tokens into evidence.

## 3. Confirm workspace receipt

Use the remote Usermaven MCP against the selected workspace. Query only the
verification window and marker. Record the public-key fingerprint, normalized
event/property names, identity booleans, and `verification_marker_matched`.
Never place raw analytics rows or marker values beyond the session ID into the
evidence artifact.

The remote MCP must sign the normalized receipt and session ID with its Ed25519
verification key. Configure the corresponding public key map locally as JSON:

```json
{
  "production-2026-01": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n"
}
```

An unattested receipt, an unknown key ID, or an invalid signature can never
produce a passing verification result.

The current public MCP can supply this without a dedicated installation tool:

1. Call `workspace.get_context`; SHA-256 the returned workspace `identifier`
   locally and compare it with the setup-plan public-key fingerprint. Do not put
   the identifier itself in verification evidence.
2. For every reviewed event (and the applicable identify event), call
   `analytics.read_taxonomy` with `mode=event_properties` to confirm the reserved
   marker property exists.
3. Call it again with `mode=event_property_values`, the marker property, and the
   narrow session date window. Confirm the controlled session ID is present,
   then discard returned values and retain only normalized names/booleans.
4. Set `source` to `remote_usermaven_mcp` and
   `verification_marker_matched=true` only when every required lookup matches.

The repository provides [an evidence template](../examples/verification-evidence.json).
Replace its session ID, timestamps, fingerprint, and normalized names.

## 4. Run verification

```sh
usermaven-wizard verify setup-plan.json \
  --session verification-session.json \
  --evidence verification-evidence.json \
  --trusted-workspace-keys trusted-workspace-keys.json \
  --root /path/to/project
```

Or configure `usermaven-wizard-mcp` with `--trusted-workspace-keys` and call
`verify_setup` with the same plan, session, evidence, and MCP `project_path`.

The static layer independently checks:

- the Usermaven SDK declaration and a bounded local installation check;
- exact content for approved file creates;
- the post-patch state of edits by reversing the diff and checking its preimage
  hash;
- public-key and tracking-host environment references;
- explicitly deferred tracking items.

Live evidence must be timestamped after session creation, no more than five
minutes in the future, and marker-bound. Workspace evidence must match the
selected public-key fingerprint.

A declared SDK without a local `node_modules` package produces a warning rather
than a failure because monorepos may hoist dependencies outside the project
root. The wizard does not cross its configured filesystem boundary to resolve a
hoisted package.

## Outcomes

- `pass`: static state and every supplied live layer match the complete tracking
  plan and active session.
- `warn`: static state passes, but one or more live evidence layers are absent or
  instrumentation remains deferred.
- `fail`: local state differs, expected signals are missing, the marker is not
  matched, transport is rejected/misdirected, evidence is stale, or the receipt
  belongs to another workspace.

The CLI exits nonzero for `fail`; `warn` remains a successful process exit so a
team can collect live evidence in stages. MCP always returns the structured
outcome unless the request or session itself is invalid.

Schema validation cannot independently prove that an observer or remote MCP is
honest. Evidence `source` and marker matching are asserted by those tools; use
trusted clients and a controlled workspace.
