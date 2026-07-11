# Security policy

## Supported versions

Until the first stable release, security fixes are made only on the latest
published `0.x` version. After `1.0`, the latest major release and the previous
major release will receive security fixes.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository. Do not
open a public issue containing exploit details, credentials, workspace keys,
captured events, or customer data.

Include the affected version, impact, reproduction steps, and any suggested
mitigation. We will acknowledge a report as soon as practical and coordinate
disclosure after a fix is available.

## Secrets and analytics data

The wizard must not print or persist secrets, raw event bodies, user profiles,
or repository source outside the working copy. Reports and fixtures must use
synthetic values only.
