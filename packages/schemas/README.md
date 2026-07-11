# `@usermaven/wizard-schemas`

Versioned Zod contracts shared by Usermaven Wizard clients, agents, and services.

```ts
import { setupPlanSchema } from "@usermaven/wizard-schemas";

const setupPlan = setupPlanSchema.parse(input);
```

The package exports contracts for explicit business context, AI tracking plans,
source-aware AI instrumentation and coverage, setup operations, exact change
approvals, normalized application results, marker sessions, verification
evidence/results, NDJSON agent events, and the wizard manifest. Objects are strict; consumers should validate all
external input before use. Approval artifacts contain digests and operation IDs,
never repository source or secret values.
