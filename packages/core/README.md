# `@usermaven/wizard-core`

The local, reusable engine behind Usermaven Wizard.

The first capability is bounded, read-only project inspection:

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

The core can also generate typed, approval-ready SDK setup plans and render them
without executing operations:

```ts
import { generateSetupPlan, previewChanges } from "@usermaven/wizard-core";

const setup = await generateSetupPlan({ projectRoot, workspace });
const preview = previewChanges(setup);
```

Approved operations can then be applied through the same engine:

```ts
import { applyChanges, createChangeApproval } from "@usermaven/wizard-core";

const approval = await createChangeApproval({
  plan: setup,
  projectRoot,
  operationIds: ["install-sdk"],
  confirmedByInteractiveUser: true,
});
const result = await applyChanges({ projectRoot, plan: setup, approval });
```

An embedding application must collect a real interactive confirmation before
calling `createChangeApproval`; the boolean is a procedural boundary, not user
authentication or a cryptographic signature.
