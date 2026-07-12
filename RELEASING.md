# Releasing

Publishing runs in GitHub Actions (`.github/workflows/publish.yml`) because
the packages publish with npm provenance, which requires a CI OIDC identity —
local `npm publish` will refuse.

## One-time setup

1. Create an npm **granular access token** with read/write access to the
   `@usermaven` scope (npmjs.com → Access Tokens → Generate → Granular).
   The npm account must be a member of the `usermaven` org with publish
   rights.
2. Add it to this GitHub repository as the `NPM_TOKEN` secret
   (**Settings → Secrets and variables → Actions**). Optionally create an
   `npm-publish` environment with required reviewers for an approval gate.
3. After the first successful publish, consider switching the packages to
   npm [trusted publishing](https://docs.npmjs.com/trusted-publishers) and
   dropping the token entirely.

## Cutting a release

1. Bump the version everywhere it lives (all four `package.json` files, the
   inter-package dependency ranges, `packages/schemas/src/common.ts`
   `WIZARD_VERSION`, and the versions mentioned in `docs/local-mcp.md`).
2. `npm install` (refreshes `package-lock.json`), `npm run check`, commit,
   push.
3. Tag and push the tag — the workflow verifies the tag matches the package
   version, re-runs the full check, and publishes `wizard-schemas` →
   `wizard-core` → `wizard` in dependency order:

   ```sh
   git tag v0.13.0
   git push origin v0.13.0
   ```

   Or run the **Publish** workflow manually (workflow_dispatch), optionally
   with a pre-release dist-tag such as `next`.

## After publishing

- Verify: `npm view @usermaven/wizard version` and
  `npx @usermaven/wizard@latest --help`.
