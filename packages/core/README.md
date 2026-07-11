# `@usermaven/wizard-core`

The local, reusable engine behind Usermaven Wizard.

The first implemented capability is bounded, read-only project inspection:

```ts
import { inspectProject } from "@usermaven/wizard-core";

const result = await inspectProject(process.cwd());
```

Inspection returns normalized framework and analytics evidence. It does not
return source snippets, environment values, or captured event data.

The core also converts an inspection into a conservative tracking baseline:

```ts
import { proposeTrackingPlan } from "@usermaven/wizard-core";

const plan = proposeTrackingPlan(result);
```

Baseline mode proposes page views and user identity only. It does not infer
custom business or revenue events.
