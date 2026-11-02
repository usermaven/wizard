# Analytics

Reviewed: 2026-10-30. Based on the application's Analytics library and
configuration UI, cross-checked with public help where available. This is a
product guide draft; live-workspace validation is still pending.

## Contents

- [Purpose](#purpose)
- [Before you begin](#before-you-begin)
- [Using the Analytics library](#using-the-analytics-library)
- [Funnels](#funnels-measure-a-defined-conversion-flow)
- [Journeys](#journeys-discover-observed-paths)
- [Trends](#trends-track-metrics-and-compare-groups)
- [Retention](#retention-measure-return-behavior)
- [Reading results responsibly](#reading-results-responsibly)

## Purpose

Analytics helps you investigate behavior in your website or product. It
brings saved Funnels, Journeys, Trends, and Retention analyses into one
workspace library so you can find, open, and manage them.

Here, **Analytics** means that library and its four analysis types. The Web
Analytics dashboard is a separate surface for traffic summaries. Choose the
analysis according to the question:

| Question | Analysis | Result to look for |
| --- | --- | --- |
| Where do people stop in a signup or purchase flow? | Funnel | Completion and drop-off between defined steps |
| What paths do people take before or after an action? | Journey | Observed sequences around a chosen anchor |
| How is a metric changing? | Trend | A chart, table, or KPI for selected metrics |
| Do people come back after an initial action? | Retention | Return behavior grouped into cohorts |

## Before you begin

Use the intended workspace and confirm the relevant activity is being
tracked. An analysis uses available data; creating one does not add missing
tracking to your application.

- **Event:** A recorded action, such as viewing a page or completing a
  business action. Example custom events below must already exist in your
  workspace before you can use them.
- **Property:** A detail used to describe or filter activity, such as a
  page URL or a supplied plan name.
- **Audience or analysis level:** The entity being measured. User, visitor,
  session, and company settings are not interchangeable, and the available
  choices vary by analysis type.
- **Filter:** Restricts the data included in a result. A breakdown separates
  the included data into groups for comparison.

Check time settings before comparing results. A report date range selects
the reporting period. A funnel window sets the permitted time to complete
its steps. A retention period sets the day, week, or month buckets used for
return analysis.

## Using the Analytics library

1. Open **Analytics** in the workspace navigation.
2. Use **All**, **Funnels**, **Journeys**, **Trends**, or **Retention** to
   browse saved analyses. Search by name or use the tag and creation-date
   filters to narrow the library.
3. Open an existing analysis, or choose **New** and the appropriate analysis
   type. An empty library also offers **Start your first analysis**.
4. Configure the analysis, inspect the result, and save it with a meaningful
   name so you can return to it.

The library supports tags and creation-date sorting. Its **Created at**
filter concerns when an analysis was saved, rather than when the underlying
events occurred. Item actions include opening an analysis, managing tags,
exporting CSV, scheduling a report, or deleting where permitted. Available
actions depend on the analysis type and your permissions; alert controls
are present for Funnels and Trends. Do not assume every action exists for
every type or role.

## Funnels: measure a defined conversion flow

Use a funnel when you already know the sequence you want to evaluate.

1. Create a Funnel and name it.
2. Define steps using page URLs or tracked events.
3. Choose the counting level offered by the form: users or companies.
4. Choose **Sequential** to allow intervening activity, or **Strict** to
   require consecutive steps without extra events between them.
5. Set a funnel window if completion must occur within a particular time.
6. Save and inspect completion, step drop-off, and conversion time. Use
   audience filters or breakdowns to investigate differences.

Example: define `Signup Completed → Workspace Created → Invite Sent` to
find where an onboarding flow loses people. These are fictional event names.

A large drop-off identifies a place to investigate; it does not establish
the cause. Verify event coverage, step matching, counting level, and window
before concluding that the product flow is broken.

Source: [Funnels](https://usermaven.com/docs/articles/funnels-22082a5b).

## Journeys: discover observed paths

Use a journey to explore what happens around an action, especially when you
do not know the full path in advance.

1. Create a Journey and name it.
2. Select an anchor: a page URL, custom event, or pinned event.
3. Choose **Before** or **After** the anchor.
4. Select session or user analysis to match the scope of your question.
5. Adjust URL grouping or exclusions if irrelevant variations obscure the
   paths, then save and inspect the visualization and common paths.

Example: anchor on a tracked `Subscription Started` event and look backward
to discover common actions before a subscription.

Session analysis follows activity within a session; user analysis can span
sessions. Grouping query-string variants simplifies paths but may hide
differences you care about. A journey discovers observed sequences; use a
funnel when you want to test completion of a prescribed sequence.

Source: [User Journeys](https://usermaven.com/docs/articles/journeys-97f56946).

## Trends: track metrics and compare groups

Use a trend for changes over time or a comparison of metric values.

1. Create a Trend from a template, an existing trend, an AI request, or
   from scratch.
2. Choose a data source and event or metric available in your workspace.
3. Select the measurement: for example, event count or unique audience.
4. Set the date range and time interval. Add filters to narrow the data
   and breakdowns to compare groups.
5. Select an appropriate chart, table, or counter, review it, and save.

Example: plot the unique audience performing a tracked `Project Created`
event each week and break it down by a supplied plan property.

Event count measures occurrences; unique audience measures distinct
entities for the selected definition. One person repeating an action can
increase the first without increasing the second. Available fields depend
on the source and collected properties. Check an AI-generated configuration
against your intended metric before relying on it.

Source: [Trends](https://usermaven.com/docs/articles/trends-8fa4fd35).

## Retention: measure return behavior

Use retention when the question is whether an audience returns after an
initial action. A cohort is the group that qualifies through the starting
condition in a particular period.

1. Create a Retention analysis and name it.
2. Choose **Day**, **Week**, or **Month** as the period type.
3. Choose **User** or **Company** analysis. For user analysis, review the
   **Include Visitors** setting to decide whether visitors are included.
4. Select the **Start event** that qualifies the audience and the **Return
   event** that counts as coming back. The current form supports page URLs,
   custom events, and pinned events.
5. Review **First time** versus **Recurring**, and **Exactly on** versus
   **On or after** returning criteria. These change what qualifies as a
   return, so keep them consistent when comparing analyses.
6. Save and inspect the cohort table and retention visualization.

Example: use `Account Created` as the start event and `Project Created` as
the return event to explore whether new accounts continue using a core
feature. For a hypothetical cohort of 100 accounts, 25 qualifying returns
represent 25% retention for that period and configuration.

Retention here measures the configured behavior. It does not automatically
mean subscription renewal or revenue retention. Confirm audience identity,
event definitions, period, and return criteria before comparing percentages.

The dedicated Retention configuration above was verified in the current
local UI. The public [cohort-analysis article](https://usermaven.com/docs/articles/measure-retention-e83a56da)
provides related background but may describe an older product layout.

## Reading results responsibly

For an empty or unexpected result, check the workspace, reporting dates,
event names, collected properties, audience level, and active filters.
For a funnel, also check order and completion window; for retention, check
start and return conditions. Missing tracking and a truly inactive audience
can both produce sparse results.

All examples in this guide are illustrative. To answer a question about
actual performance, the assistant needs results supplied by the user or an
authorized data connection. This skill supplies product knowledge and does
not retrieve workspace analytics itself.
