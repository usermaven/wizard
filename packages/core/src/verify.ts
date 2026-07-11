import { createHash, randomUUID, verify as verifySignature } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";

import {
  setupPlanSchema,
  verificationEvidenceSchema,
  verificationResultSchema,
  verificationSessionSchema,
  type SetupPlan,
  type VerificationCheck,
  type VerificationEvidence,
  type VerificationResult,
  type VerificationSession,
  type WorkspaceReceiptEvidence,
} from "@usermaven/wizard-schemas";
import { applyPatch, parsePatch, reversePatch } from "diff";

import { digestSetupPlan } from "./approval.js";
import { canonicalJson } from "./canonical.js";

const MAX_VERIFIED_FILE_BYTES = 5_000_000;
const CONFIG_SCAN_EXTENSIONS = new Set([
  ".cjs",
  ".html",
  ".js",
  ".jsx",
  ".mjs",
  ".svelte",
  ".ts",
  ".tsx",
  ".vue",
]);
const CONFIG_SCAN_IGNORED = new Set([
  ".git",
  ".next",
  ".usermaven",
  "build",
  "dist",
  "node_modules",
  "out",
]);

export interface CreateVerificationSessionInput {
  plan: SetupPlan;
  environment: string;
}

export interface CreateVerificationSessionOptions {
  now?: () => Date;
  idFactory?: () => string;
  ttlMs?: number;
}

export function createVerificationSession(
  input: CreateVerificationSessionInput,
  options: CreateVerificationSessionOptions = {},
): VerificationSession {
  const plan = setupPlanSchema.parse(input.plan);
  const createdAt = (options.now ?? (() => new Date()))();
  const ttlMs = options.ttlMs ?? 30 * 60 * 1_000;
  if (!Number.isInteger(ttlMs) || ttlMs < 1 || ttlMs > 60 * 60 * 1_000) {
    throw new Error("Verification session TTL must be between 1 ms and 1 hour");
  }
  return verificationSessionSchema.parse({
    schema_version: "1",
    session_id: `verify_${(options.idFactory ?? randomUUID)()}`,
    plan_id: plan.plan_id,
    plan_digest: digestSetupPlan(plan),
    environment: input.environment,
    marker_property: "_usermaven_verification_id",
    created_at: createdAt.toISOString(),
    expires_at: new Date(createdAt.getTime() + ttlMs).toISOString(),
  });
}

export interface VerifySetupInput {
  projectRoot: string;
  plan: SetupPlan;
  session: VerificationSession;
  evidence: VerificationEvidence;
}

export interface VerifySetupOptions {
  now?: () => Date;
  trustedWorkspaceKeys?: Record<string, string>;
}

export function workspaceReceiptAttestationPayload(
  sessionId: string,
  receipt: WorkspaceReceiptEvidence,
): string {
  const { attestation: _attestation, ...unsigned } = receipt;
  return canonicalJson({ session_id: sessionId, receipt: unsigned });
}

function validWorkspaceAttestation(
  sessionId: string,
  receipt: WorkspaceReceiptEvidence,
  trustedKeys: Record<string, string>,
): boolean {
  const publicKey = trustedKeys[receipt.attestation.key_id];
  if (!publicKey) return false;
  try {
    return verifySignature(
      null,
      Buffer.from(workspaceReceiptAttestationPayload(sessionId, receipt)),
      publicKey,
      Buffer.from(receipt.attestation.signature, "base64url"),
    );
  } catch {
    return false;
  }
}

function isWithinRoot(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

function normalizedUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/u, "");
}

function requiredPropertyNames(plan: SetupPlan): string[] {
  return [
    ...plan.tracking_plan.shared_properties,
    ...plan.tracking_plan.identity.flatMap((identity) => identity.properties),
    ...plan.tracking_plan.events.flatMap((event) => event.properties),
  ]
    .filter((property) => property.required)
    .map((property) => property.name)
    .filter((name, index, names) => names.indexOf(name) === index)
    .sort();
}

function check(
  id: string,
  layer: VerificationCheck["layer"],
  outcome: VerificationCheck["outcome"],
  summary: string,
  observedAt: string,
  normalizedDetails: VerificationCheck["normalized_details"] = {},
  suggestedFix: string | null = null,
): VerificationCheck {
  return {
    id,
    layer,
    outcome,
    summary,
    observed_at: observedAt,
    normalized_details: normalizedDetails,
    suggested_fix: suggestedFix,
  };
}

async function declaredSdkVersion(root: string): Promise<string | null> {
  try {
    const path = join(root, "package.json");
    const item = await lstat(path);
    if (item.isSymbolicLink() || !item.isFile() || item.size > 1_000_000) {
      return null;
    }
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return null;
    }
    for (const field of ["dependencies", "devDependencies"] as const) {
      const dependencies = (parsed as Record<string, unknown>)[field];
      if (
        dependencies !== null &&
        typeof dependencies === "object" &&
        !Array.isArray(dependencies)
      ) {
        const version = (dependencies as Record<string, unknown>)[
          "@usermaven/sdk-js"
        ];
        if (typeof version === "string" && version.length <= 64) return version;
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function installedSdkVersion(root: string): Promise<string | null> {
  try {
    const path = join(
      root,
      "node_modules",
      "@usermaven",
      "sdk-js",
      "package.json",
    );
    const item = await lstat(path);
    if (item.isSymbolicLink() || !item.isFile() || item.size > 1_000_000) {
      return null;
    }
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return null;
    }
    const version = (parsed as Record<string, unknown>).version;
    return typeof version === "string" && version.length <= 64 ? version : null;
  } catch {
    return null;
  }
}

async function verifyMutation(
  root: string,
  operation: Extract<
    SetupPlan["operations"][number],
    { type: "create_file" | "edit_file" }
  >,
): Promise<{ matches: boolean; content: string | null }> {
  try {
    const target = resolve(root, operation.path);
    if (!isWithinRoot(root, target)) return { matches: false, content: null };
    const item = await lstat(target);
    if (
      item.isSymbolicLink() ||
      !item.isFile() ||
      item.size > MAX_VERIFIED_FILE_BYTES
    ) {
      return { matches: false, content: null };
    }
    const content = await readFile(target, "utf8");
    if (operation.type === "create_file") {
      return { matches: content === operation.content, content };
    }
    const parsed = parsePatch(operation.unified_diff);
    if (parsed.length !== 1) return { matches: false, content };
    const original = applyPatch(content, reversePatch(parsed[0]!));
    if (original === false) return { matches: false, content };
    const originalHash = `sha256:${createHash("sha256")
      .update(original)
      .digest("hex")}`;
    return { matches: originalHash === operation.before_hash, content };
  } catch {
    return { matches: false, content: null };
  }
}

async function scanPublicConfigReferences(
  root: string,
  keyName: string | undefined,
  hostName: string | undefined,
  trackingHost: string,
): Promise<{ key: boolean; host: boolean }> {
  const queue = [root];
  let files = 0;
  let bytes = 0;
  let key = false;
  let host = false;
  while (queue.length > 0 && files < 5_000 && bytes < 10_000_000) {
    const directory = queue.pop()!;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!CONFIG_SCAN_IGNORED.has(entry.name)) queue.push(path);
        continue;
      }
      if (!entry.isFile() || !CONFIG_SCAN_EXTENSIONS.has(extname(entry.name))) {
        continue;
      }
      try {
        const item = await lstat(path);
        if (item.isSymbolicLink() || item.size > 1_000_000) continue;
        if (bytes + item.size > 10_000_000) break;
        const content = await readFile(path, "utf8");
        files += 1;
        bytes += item.size;
        key ||= keyName !== undefined && content.includes(keyName);
        host ||=
          (hostName !== undefined && content.includes(hostName)) ||
          content.includes(trackingHost);
        if (key && host) return { key, host };
      } catch {
        continue;
      }
    }
  }
  return { key, host };
}

function evidenceWindowValid(
  observedAt: string,
  session: VerificationSession,
  now: Date,
): boolean {
  const observed = Date.parse(observedAt);
  return (
    observed >= Date.parse(session.created_at) &&
    observed <= now.getTime() + 5 * 60 * 1_000
  );
}

export async function verifySetup(
  input: VerifySetupInput,
  options: VerifySetupOptions = {},
): Promise<VerificationResult> {
  const plan = setupPlanSchema.parse(input.plan);
  const session = verificationSessionSchema.parse(input.session);
  const evidence = verificationEvidenceSchema.parse(input.evidence);
  const root = await realpath(input.projectRoot);
  const now = options.now ?? (() => new Date());
  const startedAt = now();

  if (session.plan_id !== plan.plan_id) {
    throw new Error("Verification session does not match the setup plan");
  }
  if (session.plan_digest !== digestSetupPlan(plan)) {
    throw new Error("Verification session does not match the exact setup plan");
  }
  if (Date.parse(session.created_at) < Date.parse(plan.created_at)) {
    throw new Error("Verification session predates the setup plan");
  }
  if (evidence.session_id !== session.session_id) {
    throw new Error("Verification evidence does not match the session");
  }
  if (Date.parse(session.expires_at) <= startedAt.getTime()) {
    throw new Error("Verification session has expired");
  }

  const checks: VerificationCheck[] = [];
  const staticObservedAt = startedAt.toISOString();
  const declaredVersion = await declaredSdkVersion(root);
  const sdkVersion = await installedSdkVersion(root);
  checks.push(
    check(
      "sdk-declared",
      "static",
      declaredVersion ? "pass" : "fail",
      declaredVersion
        ? "Usermaven SDK dependency is declared"
        : "Usermaven SDK dependency is not declared",
      staticObservedAt,
      { sdk_declared: declaredVersion !== null },
      declaredVersion
        ? null
        : "Apply the approved SDK installation operation and reinstall dependencies.",
    ),
  );
  checks.push(
    check(
      "sdk-installed",
      "static",
      sdkVersion ? "pass" : declaredVersion ? "warn" : "fail",
      sdkVersion
        ? "A local Usermaven SDK installation is present"
        : "A local Usermaven SDK installation could not be confirmed",
      staticObservedAt,
      { sdk_installed: sdkVersion !== null },
      sdkVersion
        ? null
        : "Install dependencies in this project root, or confirm a monorepo-hoisted dependency separately.",
    ),
  );

  let keyReferenceFound = false;
  let hostReferenceFound = false;
  for (const operation of plan.operations) {
    if (operation.type !== "create_file" && operation.type !== "edit_file") {
      continue;
    }
    const result = await verifyMutation(root, operation);
    if (result.content) {
      keyReferenceFound ||=
        plan.workspace.key_env_var !== undefined &&
        result.content.includes(plan.workspace.key_env_var);
      hostReferenceFound ||=
        (plan.workspace.tracking_host_env_var !== undefined &&
          result.content.includes(plan.workspace.tracking_host_env_var)) ||
        result.content.includes(plan.workspace.tracking_host);
    }
    checks.push(
      check(
        `file-state-${operation.id}`,
        "static",
        result.matches ? "pass" : "fail",
        result.matches
          ? "Approved file operation matches the expected post-apply state"
          : "Approved file operation does not match the expected post-apply state",
        staticObservedAt,
        { operation_id: operation.id, operation_type: operation.type },
        result.matches
          ? null
          : "Review the working tree, regenerate stale instrumentation, and apply a new exact approval.",
      ),
    );
  }
  if (!keyReferenceFound || !hostReferenceFound) {
    const scanned = await scanPublicConfigReferences(
      root,
      plan.workspace.key_env_var,
      plan.workspace.tracking_host_env_var,
      plan.workspace.tracking_host,
    );
    keyReferenceFound ||= scanned.key;
    hostReferenceFound ||= scanned.host;
  }
  checks.push(
    check(
      "public-config-references",
      "static",
      keyReferenceFound && hostReferenceFound ? "pass" : "fail",
      keyReferenceFound && hostReferenceFound
        ? "Generated source references the selected public configuration"
        : "Generated source is missing a selected public configuration reference",
      staticObservedAt,
      { key_reference: keyReferenceFound, host_reference: hostReferenceFound },
      keyReferenceFound && hostReferenceFound
        ? null
        : "Regenerate or repair the singleton client configuration without embedding key values.",
    ),
  );

  if ((plan.instrumentation?.deferred.length ?? 0) > 0) {
    checks.push(
      check(
        "deferred-instrumentation",
        "static",
        "warn",
        "Tracking items remain explicitly deferred",
        staticObservedAt,
        { deferred_items: plan.instrumentation!.deferred.length },
        "Implement and approve the deferred tracking items, then verify again.",
      ),
    );
  }

  const expectedEvents = plan.tracking_plan.events
    .map((event) => event.event_name)
    .sort();
  const expectedProperties = requiredPropertyNames(plan);
  const expectsUser = plan.tracking_plan.identity.some(
    (identity) => identity.kind === "user",
  );
  const expectsCompany = plan.tracking_plan.identity.some(
    (identity) => identity.kind === "company",
  );

  if (!evidence.runtime) {
    checks.push(
      check(
        "runtime-observation",
        "runtime",
        "warn",
        "No runtime verification evidence was supplied",
        staticObservedAt,
        {},
        "Exercise every reviewed trigger with the session marker using an authorized browser or E2E observer.",
      ),
    );
  } else {
    const observedEvents = new Set(evidence.runtime.event_names);
    const observedProperties = new Set(evidence.runtime.property_names);
    const missingEvents = expectedEvents.filter(
      (event) => !observedEvents.has(event),
    );
    const missingProperties = expectedProperties.filter(
      (property) => !observedProperties.has(property),
    );
    const identitiesMatch =
      (!expectsUser || evidence.runtime.identified_user) &&
      (!expectsCompany || evidence.runtime.identified_company);
    const valid =
      evidenceWindowValid(evidence.runtime.observed_at, session, startedAt) &&
      evidence.runtime.verification_marker_matched &&
      missingEvents.length === 0 &&
      missingProperties.length === 0 &&
      identitiesMatch;
    checks.push(
      check(
        "runtime-observation",
        "runtime",
        valid ? "pass" : "fail",
        valid
          ? "Runtime observer saw every required tracking signal for this session"
          : "Runtime evidence is stale, incomplete, or not bound to this session",
        evidence.runtime.observed_at,
        {
          expected_events: expectedEvents.length,
          observed_events: observedEvents.size,
          missing_events: missingEvents.length,
          missing_required_properties: missingProperties.length,
          marker_matched: evidence.runtime.verification_marker_matched,
          identities_matched: identitiesMatch,
        },
        valid
          ? null
          : "Rerun the instrumented journeys with the active verification marker and inspect runtime wiring.",
      ),
    );
  }

  if (!evidence.transport) {
    checks.push(
      check(
        "collector-transport",
        "transport",
        "warn",
        "No collector transport evidence was supplied",
        staticObservedAt,
        {},
        "Observe sanitized collector responses for every test event in this verification session.",
      ),
    );
  } else {
    const observedEvents = new Set(evidence.transport.event_names);
    const missingEvents = expectedEvents.filter(
      (event) => !observedEvents.has(event),
    );
    const hostMatches =
      normalizedUrl(evidence.transport.tracking_host) ===
      normalizedUrl(plan.workspace.tracking_host);
    const statusAccepted =
      evidence.transport.status_code === null ||
      (evidence.transport.status_code >= 200 &&
        evidence.transport.status_code < 300);
    const valid =
      evidenceWindowValid(evidence.transport.observed_at, session, startedAt) &&
      evidence.transport.verification_marker_matched &&
      evidence.transport.accepted &&
      statusAccepted &&
      hostMatches &&
      missingEvents.length === 0;
    checks.push(
      check(
        "collector-transport",
        "transport",
        valid ? "pass" : "fail",
        valid
          ? "The selected collector accepted every required test event"
          : "Collector evidence is stale, incomplete, rejected, or targets the wrong host",
        evidence.transport.observed_at,
        {
          accepted: evidence.transport.accepted,
          status_code: evidence.transport.status_code,
          status_accepted: statusAccepted,
          host_matched: hostMatches,
          marker_matched: evidence.transport.verification_marker_matched,
          missing_events: missingEvents.length,
        },
        valid
          ? null
          : "Check the selected tracking host, network response, session marker, and missing event requests.",
      ),
    );
  }

  if (!evidence.workspace_receipt) {
    checks.push(
      check(
        "workspace-receipt",
        "workspace_receipt",
        "warn",
        "No workspace receipt evidence was supplied",
        staticObservedAt,
        {},
        "Use the remote Usermaven MCP to confirm this session marker in the selected workspace.",
      ),
    );
  } else {
    const workspace = evidence.workspace_receipt;
    const attestationValid = validWorkspaceAttestation(
      session.session_id,
      workspace,
      options.trustedWorkspaceKeys ?? {},
    );
    const observedEvents = new Set(workspace.event_names);
    const observedProperties = new Set(workspace.property_names);
    const missingEvents = expectedEvents.filter(
      (event) => !observedEvents.has(event),
    );
    const missingProperties = expectedProperties.filter(
      (property) => !observedProperties.has(property),
    );
    const identitiesMatch =
      (!expectsUser || workspace.identified_user) &&
      (!expectsCompany || workspace.identified_company);
    const fingerprintMatches =
      workspace.public_key_fingerprint ===
      plan.workspace.public_key_fingerprint;
    const valid =
      evidenceWindowValid(workspace.observed_at, session, startedAt) &&
      attestationValid &&
      workspace.verification_marker_matched &&
      fingerprintMatches &&
      missingEvents.length === 0 &&
      missingProperties.length === 0 &&
      identitiesMatch;
    checks.push(
      check(
        "workspace-receipt",
        "workspace_receipt",
        valid ? "pass" : "fail",
        valid
          ? "The selected workspace received every required signal for this session"
          : "Workspace evidence is unattested, stale, incomplete, unmarked, or belongs to another workspace",
        workspace.observed_at,
        {
          fingerprint_matched: fingerprintMatches,
          attestation_valid: attestationValid,
          marker_matched: workspace.verification_marker_matched,
          missing_events: missingEvents.length,
          missing_required_properties: missingProperties.length,
          identities_matched: identitiesMatch,
        },
        valid
          ? null
          : "Query the selected workspace for a signed active-session receipt and rerun missing journeys.",
      ),
    );
  }

  const outcome = checks.some((item) => item.outcome === "fail")
    ? "fail"
    : checks.some((item) => item.outcome === "warn")
      ? "warn"
      : "pass";
  const acceptedWorkspace =
    evidence.workspace_receipt?.public_key_fingerprint ===
      plan.workspace.public_key_fingerprint &&
    validWorkspaceAttestation(
      session.session_id,
      evidence.workspace_receipt,
      options.trustedWorkspaceKeys ?? {},
    ) &&
    evidence.workspace_receipt.verification_marker_matched &&
    evidenceWindowValid(
      evidence.workspace_receipt.observed_at,
      session,
      startedAt,
    )
      ? evidence.workspace_receipt
      : null;

  return verificationResultSchema.parse({
    schema_version: "1",
    session_id: session.session_id,
    plan_id: plan.plan_id,
    environment: session.environment,
    sdk_version: sdkVersion,
    started_at: startedAt.toISOString(),
    completed_at: now().toISOString(),
    outcome,
    checks,
    received: {
      event_names: acceptedWorkspace?.event_names ?? [],
      property_names: acceptedWorkspace?.property_names ?? [],
      identified_user: acceptedWorkspace?.identified_user ?? false,
      identified_company: acceptedWorkspace?.identified_company ?? false,
    },
  });
}
