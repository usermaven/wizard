# Getting started and business types

Reviewed: 2026-10-30. General instructions based on visible onboarding and
setup screens. All business scenarios and event names are illustrative.

## Workspace and business context

A workspace is the context in which you view a site's or product's tracking,
analyses, contacts, and settings. Select the intended workspace before
interpreting results or changing a configuration.

The onboarding flow asks about your website, timezone, workspace type,
business type, and main goal. These are related but different choices:

- **Workspace type:** SaaS / Membership, eCommerce, or Website analytics.
- **Business type:** B2B SaaS, B2C SaaS, Ecommerce, Agency, Marketplace,
  Service business, or Other.
- **Goal:** Understand website traffic; analyze product adoption; improve
  acquisition and conversions; understand the customer journey; or set up
  analytics for clients.

Choose what describes the site or product being measured. A business label
does not by itself collect events, identify customers, or populate revenue.

## Basic onboarding workflow

1. Create or select the workspace for the website or product.
2. Enter the website details and review the timezone.
3. Choose the workspace type and business description shown in the form.
4. Select the primary goal that best matches the questions you want answered.
5. Follow the installation instructions offered for your platform. Actual
   code installation is a separate task from using this product guide.
6. Use the setup checklist to review tracking, user identification where
   needed, integrations, important events, and conversion goals.
7. Open Web Analytics or a relevant dashboard after data starts arriving.

You can return to the setup guides for connecting integrations, sending user
data, tracking events, conversion goals, and event sources. Complete the
parts relevant to your goal rather than assuming every integration is needed.

## Shared concepts

| Concept | Meaning in the guide |
| --- | --- |
| Visitor | A tracked visitor, which may be anonymous |
| User | A person your product has identified to Usermaven |
| Company | An organization associated with supplied company information |
| Lead | A potential customer captured through a supported lead workflow |
| Session | A grouped visit used for session-level analysis |
| Event | A recorded action, such as a page view or tracked product action |
| Property | A detail of an event, person, company, or session used in analysis |
| Conversion goal | A definition of an outcome that matters to the business |
| Segment | A saved audience defined by attributes or behavior |
| Dashboard | A view collecting charts and summaries for ongoing review |
| Report | A configured summary that can be delivered on a schedule |

Available identities and properties depend on what your site or integrations
provide. Analytics does not automatically reveal the identity of every visitor.

## Suggested workflows by business type

These are examples of how to combine existing modules, not automatic presets
or guarantees that particular events already exist.

| Business | Start with | Example next step |
| --- | --- | --- |
| B2B SaaS | SaaS insights and company-level views | Define activation as a meaningful account milestone, then compare onboarding and feature adoption by company segment |
| B2C SaaS or membership | User-level engagement and retention | Follow signup to first value, then measure whether users return to the core activity |
| Ecommerce | Ecommerce dashboard, purchase goal, and Attribution | Review product-to-purchase completion and compare marketing sources with recorded conversion value |
| Agency | Client workspaces, custom dashboards, and Reports | Build an appropriate dashboard for each client and choose who receives its summary |
| Marketplace | Funnels, segments, and Journeys | Compare distinct buyer and seller flows using supplied audience properties and tracked actions |
| Service business | Forms, Leads, and conversion goals | Follow a demo or enquiry submission from source to lead outcome |
| Content site or Other | Web Analytics and Trends | Review acquisition and popular content, then define the outcome you want readers to complete |

For example, a fictional task app might treat `First Project Created` as an
activation event. That definition belongs to the business; do not substitute
a page view for activation unless that is the intended measurement.

## A useful first question

Choose one outcome, the audience involved, and a time period. Then route the
question to the appropriate module: traffic to Web Analytics, completion to
Funnels, paths to Journeys, change over time to Trends, return behavior to
Retention, and marketing credit to Attribution.

For platform-specific installation instructions, use the public
[Integrations & SDKs](https://usermaven.com/docs/c/integrations-d319bb89)
collection or the app's Setup instructions. Do not paste account keys into
this guide or a product-help conversation.
