# Configure

Reviewed: 2026-10-30 against the visible Configure navigation and frontend
pages. This reference contains general product guidance only.

## What this tab does

**Configure** brings together the event definitions, external event sources,
conversion goals, and outbound syncs that other Usermaven reports use.
Select Configure in the main navigation, then choose the relevant section.

## Menu map

| Group | Item | Purpose | Read for steps |
| --- | --- | --- | --- |
| Events | Auto-captured | Browse tracked website interactions | [Events](events.md#events) |
| Events | Pinned events | Name or group useful interaction definitions for reuse | [Events](events.md#events) |
| Events | Custom events | Review tracked business actions | [Events](events.md#events) |
| Events | Form Tracking | Review captured forms and map fields to lead properties | [Form Tracking](events.md#form-tracking) |
| Events | Event Sources | Bring external activity into Usermaven through supported source workflows | [Event Sources](events.md#event-sources) |
| Events | Events activity | Browse recorded activity with the available filters | [Events activity](events.md#events-activity) |
| Goals | Conversion Goals | Define outcomes used in reporting and Attribution | [Conversion Goals](events.md#conversion-goals) |
| Goals | Conversion Syncs | Send configured conversion outcomes to a supported ad destination | [Conversion Syncs](events.md#conversion-syncs) |
| Audiences | Audience Syncs | Send a selected audience to a connected destination | [Audience Syncs](events.md#audience-syncs) |
| Workspace | Workspace Settings | Open the separate workspace-preferences area | [Settings](settings.md) |

Event Sources and Audience Syncs appear when available to the current user.
Audience Syncs is marked **Beta** in the reviewed navigation. The exact menu
can differ with account availability, permissions, or product version.

## Choose the right workflow

- To make a captured interaction easier to select in analysis, use Pinned
  events. To inspect an action already sent by your product, use Custom events.
- To measure form submissions and create leads from mapped fields, use Form
  Tracking; review the resulting audience in Contacts.
- To receive an external sale or registration as an event, use Event Sources.
- To define a business outcome, use Conversion Goals. To send that outcome
  to another supported platform, use Conversion Syncs.
- To keep a selected group of people or companies available in another tool,
  use Audience Syncs. Audience membership and conversion occurrences are
  different things.

Example: a fictional service business could capture a demo form, define a
demo-request conversion goal, analyze its sources in Attribution, and use a
supported sync only if it wants to send outcomes or an audience elsewhere.
These are separate configurations; creating a goal does not enable a sync.

## What this guide does not require

Use the app's own setup forms and linked public guidance for connections.
The general guide does not need connection secrets, real submissions,
customer records, raw event data, internal diagnostics, or backend details.
