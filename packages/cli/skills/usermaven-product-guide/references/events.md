# Events, forms, and conversion goals

Reviewed: 2026-10-30. General workflows from visible Configure screens and
public form-tracking help. No implementation or raw event data is included.

## Contents

- [Events](#events)
- [Events activity](#events-activity)
- [Form Tracking](#form-tracking)
- [Event Sources](#event-sources)
- [Conversion Goals](#conversion-goals)
- [Conversion Syncs](#conversion-syncs)
- [Audience Syncs](#audience-syncs)

## Events

The **Configure** area groups event-related setup. Labels can also appear as
Events in older navigation.

| Area | What it is for | Basic workflow |
| --- | --- | --- |
| Auto-captured | Review interactions captured by the installed tracker | Open the list, find the interaction of interest, and inspect the available event detail |
| Pinned events | Give a useful captured interaction or group a recognizable definition | Choose the relevant interaction or matching conditions, use the pin/group control, name it, review, and save |
| Custom events | Review business actions explicitly tracked by the site or integration | Open the list and select the relevant event to inspect its activity and available properties |
| Events activity | Review recent recorded activity | Select the relevant filters and inspect the visible activity view |

A pinned event makes a useful definition easier to reuse. It does not add
new instrumentation. A custom event must be supplied by the application or a
supported integration before it can appear in analysis.

Example: name a matched pricing-page interaction clearly so it can be
selected in a funnel. Confirm that the match represents the intended action;
a button interaction is not automatically a completed purchase.

## Events activity

Open **Configure → Events activity** to review recorded activity using the
available filters. Narrow the view to the action you are investigating,
then review its visible summary. Use this to confirm that the expected kind
of activity appears before choosing it in a goal or analysis.

Activity being present does not by itself establish that the event matches
your business definition. Explain the workflow without copying real event
rows or their property values into the guide.

## Form Tracking

Form Tracking helps review captured submissions and map their fields to lead
properties. It depends on the site's configured form-tracking setup.

1. Open **Configure → Form Tracking**.
2. Select a captured form and review whether it is mapped or unmapped.
3. Use the field-mapping control to associate the relevant fields with the
   lead properties offered by the form.
4. Review the mapping and save it.
5. Use a fictional test submission to confirm the expected form and lead
   appear in the app, then review the Leads view if appropriate.

An unmapped form has been captured without a completed contact-property
mapping. Mapping connects relevant form fields to the lead workflow. Some
custom or embedded forms need a different supported setup; use the public
guide rather than assuming every form is automatically supported.

Reference: [Form Tracking](https://usermaven.com/docs/articles/overview-64b8b654).

## Event Sources

Event Sources brings external outcomes into the workspace. It receives
activity; Conversion Syncs and Audience Syncs send selected data out.

1. Open **Configure → Event Sources** where available.
2. Start source creation and select the supported source from the catalog.
3. Follow its visible workflow, such as a CSV import or external connection,
   and give the source a recognizable name.
4. Review the event and field-mapping choices presented by that workflow.
5. Review the setup summary and any preview offered before completing it.
6. Return to the source list or detail view to inspect the visible status
   and activity summary.

Example: a fictional webinar business could bring attendance outcomes into
Usermaven using a supported source. Selecting the source does not guarantee
that past activity or every source field is automatically available.

Connection addresses, secret values, file contents, and raw samples belong
in the relevant setup workflow, not in this public knowledge guide.

## Conversion Goals

A conversion goal represents an outcome you want to measure, such as a demo
request or purchase. It connects tracking to dashboards, Attribution, and
alerts.

1. Open **Conversion Goals** or the goal-creation control in the report.
2. Name the outcome and choose the tracked action or matching condition.
3. Review the counting and value options shown. A fixed value is a chosen
   amount; an event-based value depends on suitable collected data.
4. Save and select the goal in a compatible report.
5. Review the resulting conversions using consistent dates and filters.

Example: a fictional store might use a recorded completed-order event for a
Purchase goal. A value assigned to a non-revenue goal is an estimate chosen
by the business, not automatically money received.

Goal setup does not create missing events. Use the choices actually offered
for the selected event and account rather than promising every value option.

## Conversion Syncs

Conversion Syncs sends configured conversion outcomes to a supported ad
destination. It needs a connected destination and an appropriate goal or
outcome available in the setup form.

1. Open **Configure → Conversion Syncs** and start a new sync where permitted.
2. Select the destination/account and conversion goal offered by the form.
3. Review the visible mapping and schedule choices, then the setup summary.
4. Save only when you intend to configure that transfer.
5. Review the list's status, interval, next run, and last run, and use
   **View Run History** for the displayed outcomes.

Example: send an appropriately configured demo-request outcome to a supported
ad account. A conversion in Usermaven and a conversion accepted by a
destination are different reporting stages; use the displayed sync result.

## Audience Syncs

Audience Syncs sends a selected group of people or companies to a connected
destination. It appears under **Configure → Audiences → Audience Syncs**
where available, with a Beta label in the reviewed navigation.

1. Open Audience Syncs and start creation, or use an audience's sync control.
2. Choose the destination and supported audience source offered by the form,
   such as a saved segment or a funnel audience.
3. Name the sync and review what to send and the reevaluation options shown.
4. Review the summary before saving or enabling it.
5. Use the sync list and history to review outcomes. Pause or resume using
   the visible controls when you intend to change future delivery.

Example: sync a fictional activated-trial segment to a connected customer
tool. The audience size in Usermaven may differ from the number updated in
the destination; not every audience member necessarily exists there.

See [Integrations](integrations.md) for related connection workflows and
[Contacts](contacts.md) for creating a reusable segment.

This reference intentionally omits credentials, connection addresses, raw
submissions, event payloads, and internal troubleshooting checks.
