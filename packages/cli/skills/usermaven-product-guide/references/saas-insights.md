# SaaS insights

Reviewed: 2026-10-30. Based on visible SaaS dashboard and setup forms, with
public product-help references. Older articles call this **Product Insights**;
the current app groups applicable reports under **Dashboards**.

## Contents

- [Starting point](#purpose-and-starting-point)
- [SaaS Growth Overview](#saas-growth-overview)
- [Product Engagement](#product-engagement)
- [Feature Adoption](#feature-adoption)
- [Onboarding](#onboarding)
- [Retention Analysis](#retention-analysis)
- [Power Users](#power-users)
- [Slipping Away Users](#slipping-away-users)
- [Interpretation](#configuration-and-interpretation)

## Purpose and starting point

SaaS insights helps subscription and membership products understand
activation, engagement, feature adoption, and return behavior. In a SaaS
workspace, open the relevant enabled report in Dashboards. If it has not
been configured, follow its visible setup prompt.

These reports need relevant tracked actions and supplied identity information.
Choose **Users** for individual behavior or **Companies** for account-level
behavior where offered. B2B teams often need both: several active people can
belong to one company. B2C products commonly begin with the user view.

## SaaS Growth Overview

Open this dashboard for a broad view of the available growth and engagement
summaries. Select the period and audience controls offered, then open the
more specific report behind the question you want to investigate. Treat the
overview as a starting point rather than a substitute for reading each
metric's definition.

## Product Engagement

Use this report to examine how often your defined audience is active.

1. Open **Dashboards → Product Engagement** where enabled.
2. Create or edit an active-user insight through the setup controls.
3. Name it and select the tracked events that represent meaningful activity.
4. Save, choose the user or company view, and select a period or segment.
5. Review the active-audience and stickiness summaries presented.

DAU, WAU, and MAU describe daily, weekly, and monthly active audiences. Their
meaning depends on the configured activity events; opening a marketing page
is not necessarily meaningful product usage.

Example: a task app could define activity using `Task Completed` rather than
every page view. Do not impose the same activity definition on every business.

Reference: [Product engagement](https://usermaven.com/docs/articles/product-engagement-b43175b7).

## Feature Adoption

Use Feature Adoption to compare how people or companies use specific product
capabilities. Here, a **module** groups features of the user's own product;
it does not mean a Usermaven navigation module.

1. Open **Feature Adoption** and start setup or manage an existing definition.
2. Add a module with a name and description, then add its features.
3. Associate each feature with the tracked event or events representing use.
4. Review the adoption threshold and retention frequency offered by the form.
5. Save and inspect the overview matrix, feature table, or feature detail.
6. Choose Users or Companies and a relevant segment for comparison.

Example: a fictional Collaboration module could include an Invitations
feature measured by `Invite Sent`. Usage, adoption, and retention represent
different stages under your configured rules. Do not assume that a single
use automatically satisfies an adoption or retention threshold.

Reference: [Feature adoption](https://usermaven.com/docs/articles/measure-feature-adoption-a72eeb4d).

## Onboarding

This report measures customers getting started with your product. It is
separate from creating your own Usermaven workspace.

1. Open **Dashboards → Onboarding** and create an onboarding insight.
2. Name it and choose the steps that represent progress to first value.
3. Review sequential versus strict ordering and the completion window.
4. Save, select the audience and reporting dates, and inspect completion
   and step drop-off. Open a detailed view where offered.

Example: `Signup Completed → Project Created → First Task Completed` might
represent activation for a fictional task app. Step names must correspond
to actions actually tracked in that workspace.

Reference: [Tracking onboarding](https://usermaven.com/docs/articles/track-onboarding-89f7a2f0).

## Retention Analysis

Use this SaaS report to explore continued activity after signup. Open its
setup, name the insight, select the signup event and the activity events used
for retention, then save and review the cohort results with the available
audience and period controls.

The standalone **Analytics → Retention** builder offers a configurable start
and return-event analysis; see [Analytics](analytics.md). Match definitions
before comparing the two experiences. Behavioral retention does not by
itself establish continued subscription payments.

Reference: [Cohort retention](https://usermaven.com/docs/articles/measure-retention-e83a56da).

## Power Users

Use this report to investigate your most active audience under a chosen
definition. Create or edit a Power Users insight, name it, select meaningful
activity events, review the power-user percentage setting, and save. Examine
the displayed activity distribution and user or company breakdown.

Example: compare frequent project creators with the wider audience. Choose
an activity cadence appropriate to the business; a weekly-use product need
not have daily activity to deliver value.

Reference: [Power users](https://usermaven.com/docs/articles/power-users-bc8a3838).

## Slipping Away Users

Use this report to find audiences showing reduced recent activity under the
configured insight. Open **Slipping Away Users**, follow **Setup Insight**
if needed, review the activity definition and period options shown, and save.
Then select the insight and segment to inspect its summary and audience.

Reduced activity is a signal for investigation, not proof of cancellation or
dissatisfaction. Consider the expected usage pattern before drawing a
conclusion. This guide does not prescribe outreach or send messages.

## Configuration and interpretation

An insight is a saved business definition. Naming it clearly and keeping its
events, audience level, and periods consistent makes comparisons useful.
Changing the definition changes the question being measured. Missing setup
or identity information can limit what a report shows; follow the app's
visible guidance rather than inferring missing customer information.
