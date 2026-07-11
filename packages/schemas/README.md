# `@usermaven/wizard-schemas`

Versioned Zod contracts shared by Usermaven Wizard clients, agents, and services.

```ts
import { setupPlanSchema } from "@usermaven/wizard-schemas";

const setupPlan = setupPlanSchema.parse(input);
```

The package exports contracts for tracking plans, setup operations, exact change
approvals, normalized application and verification results, NDJSON agent events,
and the wizard manifest. Objects are strict; consumers should validate all
external input before use. Approval artifacts contain digests and operation IDs,
never repository source or secret values.
