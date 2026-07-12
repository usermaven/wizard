# Deployment guide

The wizard wires your app to read the Usermaven workspace key and tracking
host from environment variables — it never writes the values anywhere. Local
development uses `.env.local`; shipping to production means setting the same
variables in your hosting platform and then verifying against the deployed
environment.

## The variables

| Framework            | Key variable                | Tracking-host variable                |
| -------------------- | --------------------------- | ------------------------------------- |
| Next.js              | `NEXT_PUBLIC_USERMAVEN_KEY` | `NEXT_PUBLIC_USERMAVEN_TRACKING_HOST` |
| React + Vite         | `VITE_USERMAVEN_KEY`        | `VITE_USERMAVEN_TRACKING_HOST`        |
| React / Node / other | `USERMAVEN_PUBLIC_KEY`      | `USERMAVEN_TRACKING_HOST`             |

If you overrode the names with `--key-env-var` / `--tracking-host-env-var`
during `setup-plan`, use your names instead. The generated client falls back
to the tracking host recorded in the setup plan when the host variable is
unset, so the key variable is the one that must be present.

> [!IMPORTANT]
> `NEXT_PUBLIC_*` and `VITE_*` variables are inlined **at build time**. Set
> them before the production build runs — adding them to a running container
> or after a deploy has no effect until you rebuild. They are also visible in
> the shipped JavaScript bundle; that is expected, the workspace key is a
> public (client-side) key.

## Platform recipes

### Vercel

```sh
vercel env add NEXT_PUBLIC_USERMAVEN_KEY production
vercel env add NEXT_PUBLIC_USERMAVEN_TRACKING_HOST production
```

Or **Project → Settings → Environment Variables** in the dashboard. Redeploy
so the build picks the values up. Repeat for `preview` if you want staging
traffic tracked (consider a separate Usermaven workspace for it).

### Netlify

**Site configuration → Environment variables**, or:

```sh
netlify env:set VITE_USERMAVEN_KEY "your-key"
netlify env:set VITE_USERMAVEN_TRACKING_HOST "https://events.usermaven.com"
```

Trigger a new build after setting them.

### Docker

Pass the values at build time for Next.js/Vite apps:

```dockerfile
ARG NEXT_PUBLIC_USERMAVEN_KEY
ARG NEXT_PUBLIC_USERMAVEN_TRACKING_HOST
ENV NEXT_PUBLIC_USERMAVEN_KEY=$NEXT_PUBLIC_USERMAVEN_KEY
ENV NEXT_PUBLIC_USERMAVEN_TRACKING_HOST=$NEXT_PUBLIC_USERMAVEN_TRACKING_HOST
RUN npm run build
```

```sh
docker build --build-arg NEXT_PUBLIC_USERMAVEN_KEY=... .
```

For server-side (Node) instrumentation, runtime env is enough:
`docker run -e USERMAVEN_PUBLIC_KEY=... -e USERMAVEN_TRACKING_HOST=...`.

### Generic CI

Store the key in your CI secret store (GitHub Actions secrets, GitLab CI
variables) and export it in the build step. Never commit `.env.local` — the
wizard's protected-path rules refuse to touch env files precisely so that
values only ever live in your environment and your platform's secret store.

## Separate environments

Use one Usermaven workspace per environment (production, staging) rather than
mixing traffic. Each workspace has its own key, so the same variable names
with different values per environment is all it takes. Verification sessions
are opened per environment:

```sh
usermaven-wizard verification-session ./setup-plan.json --environment production
```

## Custom tracking domain

To serve the collector from your own domain (first-party tracking), configure
the custom domain in Usermaven (**Workspace settings → Custom domain**) and
set the tracking-host variable to it, for example
`https://events.yourdomain.com`. This keeps events flowing where third-party
requests are blocked and is the recommended production configuration.

## Verify production

After the first production deploy, run the verification flow against the
deployed app (see the [verification playbook](verification-playbook.md)):

```sh
usermaven-wizard verification-session ./setup-plan.json \
  --environment production > verification-session.json

usermaven-wizard verify ./setup-plan.json \
  --session ./verification-session.json \
  --evidence ./verification-evidence.json \
  --trusted-workspace-keys ./trusted-workspace-keys.json \
  --root /path/to/project
```

Then open your Usermaven workspace and confirm live events appear. If they
don't, work through the [troubleshooting guide](troubleshooting.md) —
build-time variables and ad-blocked third-party hosts are the two most common
causes.

## Housekeeping

- Keep `.usermaven/` (workflow checkpoints, private artifacts, approvals) out
  of version control and out of your deploy image.
- Approval artifacts are machine- and path-bound; they are not deployment
  credentials and never need to leave the machine where you ran `approve`.
