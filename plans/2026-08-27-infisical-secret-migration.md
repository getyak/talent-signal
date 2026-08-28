# Infisical secret migration

## Outcome

Move Talent Signal's application and delivery credentials to environment- and
capability-scoped Infisical paths without changing the applications' environment
variable contract or interrupting the currently working release path.

Completion evidence is:

- local web and backend commands inject only their declared Infisical folders;
- TestFlight and production deployment scripts no longer depend on plaintext
  environment files;
- GitHub release workflows load `staging:/release` through a repository- and
  Environment-bound OIDC identity;
- each manifest contract passes a name-only readback check in its target
  environment;
- one TestFlight release and access audit pass through Infisical before legacy
  GitHub secrets and local recovery files are revoked or removed.

## Boundary

The migration may copy only names allowlisted by
`config/infisical-secrets.json`. It never prints values, recursively injects the
project root, adds provider SDKs to applications, or deletes a working source
before destination readback and runtime proof. OAuth Applications are not used
for workload delivery; GitHub OIDC exchanges for a short-lived Machine Identity
token.

## Current state

- **Complete:** created `/shared`, `/web`, `/backend`, `/release`, and
  `/operations` in `dev`, `staging`, and `prod`.
- **Complete:** copied readable root and ignored local values into the allowlisted
  folders. Root values remain as rollback data.
- **Complete:** audited credential-shaped runtime environment names against the
  manifest; `AUTH_SECRET`, OpenRouter, Ark, and Zhipu development readback pass.
- **Complete:** switched local and TestFlight wrappers to transient folder
  injection and added manifest/contract tests. The real TestFlight backend was
  rebuilt from this branch using only `staging:/shared` and
  `staging:/backend`; the database migration, container health, Apple public-key
  retrieval, Apple authentication challenge, loopback probe, and tailnet HTTPS
  probe all passed while the existing unrelated Serve routes remained intact.
- **Complete:** created protected project-managed identity
  `github-testflight-release-oidc` with ID
  `c9ad327f-9a88-4781-a28d-fc59ab21e944`, exact GitHub OIDC binding, and a
  path-scoped Additional Privilege that grants only `describeSecret` and
  `readValue` for `staging:/release`.
- **Complete:** prepared iOS workflows for pinned Infisical OIDC loading with an
  explicit legacy GitHub fallback only while the identity variable is absent;
  isolated the patch on `codex/infisical-secret-cutover`, opened PR #74, and
  passed repository policy/actionlint plus backend and web checks while the iOS
  and Swift CodeQL checks continue.
- **Complete:** the shared injection wrapper requires a short-lived Machine
  Identity token for `prod` and cannot use a human CLI session or its encrypted
  offline cache.
- **Complete:** Free-plan custom-role rejection was resolved without widening
  access by using a project-managed identity plus Additional Privilege. The old
  organization identity remains protected, has no auth methods, `no-access`,
  and no project privilege; an organization admin may remove it later.
- **Complete:** reissued a read-only Match deploy key for
  `getyak/talent-signal-certs`, stored the private key, repository URL, and a new
  keychain password in `staging:/release`, verified repository access, and
  removed the bounded local temporary copies.
- **Complete:** created App Store Connect key `Talent Signal Infisical CI` with
  App Manager access, and stored its Key ID, Issuer ID, and the active installed
  internal tester email in `staging:/release`.
- **Complete:** recovered the one-time Apple `.p8`, fixed the raw-file migration
  path so multiline private keys are not dotenv-escaped, verified the Infisical
  readback parses as a private key, passed the complete `testflightAccess`
  contract, and removed the local downloaded key copy.
- **Complete:** created a dedicated Tailscale OAuth client for the active tailnet
  with only `devices:core` and `auth_keys` write scopes, both restricted to the
  existing admin-owned `tag:ci`; stored its ID and secret in
  `staging:/release`, verified token exchange from Infisical readback, and
  removed the bounded local credential copy. The old client remains available
  for rollback until the real workflow proof succeeds.
- **Complete:** compared every name in the remaining local rollback files with
  live Infisical injection: 25 development names and 12 TestFlight names have
  zero missing destinations. `TALENT_SIGNAL_INTEGRATION_MODE`, the one
  previously omitted non-secret behavior flag, is now preserved in
  `dev:/web` and the manifest.
- **Pending:** production backend values, a production-only workload identity,
  and the production deployment-script cutover after those prerequisites pass.
- **Complete:** bound GitHub environment `testflight` variable
  `INFISICAL_TESTFLIGHT_IDENTITY_ID` to the protected project-managed identity;
  legacy workflows do not consume this variable, so the new workflow will enter
  the OIDC path immediately after merge.
- **Pending:** PR #74 final iOS check is running with a 60-minute job budget
  after the previous all-passing test run was cancelled by the old 45-minute
  timeout. Real TestFlight release/access proof and deletion or revocation of
  the old GitHub secrets, `.env.testflight`, root duplicates, and any bounded
  local `.env` recovery copy.
- **Verified:** workflow actionlint, shell syntax, documentation, secret
  scanning, Agent/Web/Backend tests, the web production build with a synthetic
  auth secret, and name-only `dev`/`staging` contracts pass. A clean-worktree
  web process injected from `dev:/shared` plus `dev:/web` returned HTTP 200.

## Remaining cutover

1. Complete PR #74 checks and merge the isolated workflow cutover.
2. Run the audit-only TestFlight access workflow from `main` and a real
   TestFlight release,
   then observe their external outcomes.
3. Rebase and merge the core secret-management branch, then remove the three
   verified local rollback files.
4. Remove and revoke the superseded GitHub secrets, old Match deploy key, and
   old Tailscale OAuth client only after the release/access proof succeeds.
