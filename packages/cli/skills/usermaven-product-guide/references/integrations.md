# Integrations and connections

Reviewed: 2026-10-30. Describes user-visible connection workflows only.

## Choose the connection by its purpose

| Purpose | Product area | What it enables |
| --- | --- | --- |
| Track website or product actions | Setup and supported platform integration | Data for traffic, events, and behavioral analysis |
| Read marketing or business data | Workspace Settings → Integrations | Relevant ad, search, CRM, billing, or other connected-source reports |
| Add activity from an external source | Event Sources where offered | Supported external outcomes represented as tracked events |
| Send an audience to another tool | Audience sync controls | Configured audience membership or supported fields sent to a connected destination |
| Send conversion outcomes | Conversion Syncs | Configured outcomes delivered to a supported destination |
| Connect an AI tool | Workspace Settings → AI & MCP | The connection options presented for supported AI workflows |

Sources bring data in; destinations send selected data out. A connection's
presence does not mean every available report has the required setup.

## Basic integration workflow

1. Open **Workspace Settings → Integrations**.
2. Select the supported service relevant to your goal.
3. Follow the app's sign-in or connection form yourself.
4. Choose the account, site, or other resource when the setup asks for it.
5. Review the visible status, selections, and mapping choices.
6. Open the report that uses that source and confirm the expected summary
   is available for the selected reporting period.

Example: connect a search source to review search performance, or an ad
network to compare campaign activity with recorded conversion outcomes.
Follow the specific public integration guide for prerequisites. Different
sources offer different fields and histories.

## Event Sources

Event Sources provides supported ways to bring external activity into the
workspace. Open **Configure → Event Sources** where available, choose the
source type, give it a clear name, and follow the visible
mapping and review steps. Then inspect the displayed activity summary.

Examples include an external sale or registration represented by a supported
import or connection workflow. This guide does not include webhook
addresses, tokens, payloads, file contents, or implementation instructions.

## Audience and conversion syncs

Start from the relevant audience, goal, or sync area. Choose a connected
destination, the audience or outcome to send, the supported fields, and the
schedule or reevaluation option if offered. Review the summary before
enabling it. The visible history shows the status of configured runs.

Explain the setup using fictional definitions. Do not place real audience
members, identifiers, mapping values, or destination credentials in the guide.

## AI & MCP

Open **Workspace Settings → AI & MCP** to review the available AI connection
options. Select the supported connection and follow its on-screen
authorization flow. The product guide skill itself does not establish that
connection or grant access to workspace data.

## Where to find service-specific instructions

Use the public [Integrations & SDKs](https://usermaven.com/docs/c/integrations-d319bb89)
collection for platform-specific setup and supported services. The app's
available connection choices are the source of truth for the current
workspace. Actual SDK installation belongs to the setup workflow, not this
general product guide.

Do not request connection secrets, raw exports, or internal logs in a
product-help answer. If the visible connection status and public guide do
not resolve an account-specific issue, point the user to in-app support.
