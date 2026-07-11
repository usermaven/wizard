# Framework fixtures

These deliberately small, synthetic applications will exercise framework
detection and instrumentation adapters. They are not npm workspaces, so the root
install stays lightweight. A future conformance matrix will install and build
each fixture independently on supported Node versions.

- `react-vite`: client-rendered React with Vite
- `next-app-router`: Next.js App Router
- `next-pages-router`: Next.js Pages Router

Fixtures must never contain real credentials, workspace identifiers, customer
code, or captured analytics data.
