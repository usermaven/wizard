import { randomUUID } from "node:crypto";

import {
  projectInspectionSchema,
  trackingPlanSchema,
  type ProjectInspection,
  type PropertyDefinition,
  type TrackingPlan,
} from "@usermaven/wizard-schemas";

const WIZARD_VERSION = "0.4.0";

export interface ProposeTrackingPlanOptions {
  now?: () => Date;
  idFactory?: () => string;
}

const property = (
  name: string,
  description: string,
  dataType: PropertyDefinition["data_type"],
  required: boolean,
  pii: PropertyDefinition["pii"],
): PropertyDefinition => ({
  name,
  description,
  data_type: dataType,
  required,
  pii,
});

function pageViewRationale(inspection: ProjectInspection): string[] {
  const reasons = [
    "Page views provide the minimum acquisition and engagement baseline.",
  ];
  if (inspection.project.framework === "next-app-router") {
    reasons.push(
      "Next.js App Router requires route-aware client navigation tracking.",
    );
  } else if (inspection.project.framework === "next-pages-router") {
    reasons.push("Next.js Pages Router exposes client route-change events.");
  } else if (inspection.project.framework === "react-vite") {
    reasons.push(
      "React/Vite applications need explicit SPA navigation tracking when routing is used.",
    );
  } else {
    reasons.push(
      "The detected framework does not provide a verified routing adapter yet.",
    );
  }
  return reasons;
}

function pageViewTrigger(inspection: ProjectInspection): string {
  switch (inspection.project.framework) {
    case "next-app-router":
      return "After the initial browser load and each completed App Router navigation";
    case "next-pages-router":
      return "After the initial browser load and each completed Next.js route change";
    case "react-vite":
    case "react":
      return "After the initial browser load and each completed client-side route change";
    default:
      return "After a browser page load; confirm navigation behavior during review";
  }
}

function existingIdentity(inspection: ProjectInspection) {
  return (
    inspection.instrumentation.find(
      (occurrence) =>
        occurrence.provider === "usermaven" && occurrence.kind === "identify",
    ) ??
    inspection.instrumentation.find(
      (occurrence) => occurrence.kind === "identify",
    )
  );
}

export function proposeTrackingPlan(
  input: ProjectInspection,
  options: ProposeTrackingPlanOptions = {},
): TrackingPlan {
  const inspection = projectInspectionSchema.parse(input);
  const identityEvidence = existingIdentity(inspection);
  const knownFramework = inspection.project.framework !== "unknown";
  const assumptions = [
    "The application has browser-rendered pages where page-view analytics is appropriate.",
    "The application has authenticated users; remove the identity item if it does not.",
    "URL query strings and fragments will be excluded from page_path unless explicitly approved.",
  ];
  const warnings = [
    "No custom business events are inferred in deterministic baseline mode.",
    "No revenue event is proposed without an authoritative purchase signal and server-side confirmation path.",
  ];

  if (inspection.scan.truncated) {
    warnings.push(
      "The source inspection was truncated; review the repository before approving this plan.",
    );
  }
  if (!knownFramework) {
    warnings.push(
      "The framework is unknown, so initialization and navigation placement require manual review.",
    );
  }
  const otherProviders = [
    ...new Set(
      [
        ...inspection.analytics_dependencies.map(
          (dependency) => dependency.provider,
        ),
        ...inspection.instrumentation.map((occurrence) => occurrence.provider),
      ].filter((provider) => provider !== "usermaven"),
    ),
  ].sort();
  if (otherProviders.length > 0) {
    warnings.push(
      `Existing analytics providers detected (${otherProviders.join(", ")}); choose coexistence or migration before applying changes.`,
    );
  }
  if (
    inspection.instrumentation.some(
      (occurrence) =>
        occurrence.provider === "usermaven" && occurrence.kind === "track",
    )
  ) {
    warnings.push(
      "Existing Usermaven track calls were found; reconcile them with the approved taxonomy.",
    );
  }

  const identityRationale = identityEvidence
    ? [
        `An existing ${identityEvidence.provider} identity call was detected at ${identityEvidence.path}:${identityEvidence.line}.`,
        "A stable internal user ID is preferred over email as the identifier.",
      ]
    : [
        "Identity is required to connect anonymous activity to an authenticated user.",
        "No existing identity call was detected, so the placement must be confirmed.",
      ];

  return trackingPlanSchema.parse({
    schema_version: "1",
    plan_id: `plan_${(options.idFactory ?? randomUUID)()}`,
    identity: [
      {
        kind: "user",
        identifier: "user_id",
        trigger: {
          description:
            "When a stable authenticated user session becomes available and whenever the user changes",
          runtime: "client",
          ...(identityEvidence ? { file: identityEvidence.path } : {}),
        },
        properties: [
          property(
            "email",
            "Authenticated user's email address",
            "string",
            false,
            "direct_identifier",
          ),
          property(
            "name",
            "Authenticated user's display name",
            "string",
            false,
            "direct_identifier",
          ),
          property(
            "created_at",
            "When the user account was created",
            "datetime",
            false,
            "none",
          ),
        ],
        status: "proposed",
        proposal: {
          confidence: identityEvidence
            ? identityEvidence.provider === "usermaven"
              ? 0.95
              : 0.75
            : 0.5,
          rationale: identityRationale,
          review_required: true,
        },
      },
    ],
    events: [
      {
        id: "baseline-page-view",
        event_name: "page_view",
        description: "A visitor viewed an application page",
        business_question: "Which pages attract and retain visitors?",
        category: "engagement",
        trigger: {
          description: pageViewTrigger(inspection),
          runtime: "client",
        },
        properties: [
          property(
            "page_path",
            "Path without query string or fragment",
            "string",
            true,
            "none",
          ),
          property(
            "page_title",
            "Browser document title",
            "string",
            false,
            "none",
          ),
          property(
            "referrer_domain",
            "Referring hostname without the full URL",
            "string",
            false,
            "none",
          ),
        ],
        pii: "none",
        authority: "client",
        deduplication_key: null,
        owner: null,
        status: "proposed",
        revenue: false,
        proposal: {
          confidence: knownFramework ? 0.9 : 0.55,
          rationale: pageViewRationale(inspection),
          review_required: true,
        },
      },
    ],
    shared_properties: [
      property(
        "environment",
        "Deployment environment such as production or staging",
        "string",
        true,
        "none",
      ),
      property(
        "app_version",
        "Deployed application version or release identifier",
        "string",
        false,
        "none",
      ),
    ],
    proposal: {
      mode: "deterministic_baseline",
      review_required: true,
      assumptions,
      warnings,
      source: {
        framework: inspection.project.framework,
        inspected_at: inspection.inspected_at,
        inspection_truncated: inspection.scan.truncated,
      },
    },
    created_at: (options.now ?? (() => new Date()))().toISOString(),
    wizard_version: WIZARD_VERSION,
  });
}
