# CI/CD and GitHub operations

## Design

The delivery system separates reversible verification from external
publication:

```text
pull request / push
        |
        +--> CI required
        |      docs + workflow policy
        |      web lint/typecheck/test/build
        |      backend typecheck/test/build
        |      iOS Release build + unit tests + bounded UI smoke when relevant
        |
        +--> Security required
               dependency review on pull requests
               credential hygiene
               CodeQL for web and Actions

main / weekly / manual Security
        |
        +--> Swift CodeQL when relevant

successful main CI + iOS product change
        |
        +--> main-only testflight environment
                isolated match signing -> archive
                TestFlight upload -> processing complete
                internal group automatic distribution
                provenance attestation
                version tag + GitHub prerelease + retained IPA
```

`CI required` and `Security required` are intentionally stable job names for
branch rules. Matrix jobs and path-sensitive jobs feed those aggregators, so
branch protection does not depend on a changing list of individual contexts.

## Workflow inventory

| Workflow | Trigger | Mutation | Concurrency policy |
| --- | --- | --- | --- |
| `CI` | pull request, `main` push, manual | none | cancel stale run per branch or PR |
| `Security` | pull request, `main` push, weekly, manual | CodeQL results | cancel stale run per branch or PR |
| `Pull request labels` | pull request metadata | labels only | one short job |
| `Release iOS` | successful `CI` run on `main`, explicit manual request | TestFlight, tag, prerelease, attestation | serialize all releases; never cancel |
| `Refresh iOS signing` | explicit manual confirmation on `main` | App Store profile in the isolated match repository | serialize with releases; never cancel |
| `TestFlight Access` | explicit manual request on `main` | scoped tester group/build access and invitation | serialize access repair; never cancel |

All third-party actions are pinned to full commit SHAs. Dependabot proposes
weekly updates for GitHub Actions, pnpm, and Bundler.

## Release gates

An ordinary release workflow dispatch defaults to **not** publishing
TestFlight. A manual caller must explicitly set `publish_testflight`, and an
automatic release is considered only when the verified `main` tip contains iOS
release inputs that have changed since the latest successful semantic release.
The `testflight` GitHub Environment permits only `main`; it intentionally has
no required reviewer because internal TestFlight delivery is the continuous
delivery target.

On a `main` push, CI also compares the current tip with the latest reachable
semantic release tag. Unreleased iOS work therefore remains in scope after a
newer non-iOS push cancels an older run. The replacement run tests the complete
unreleased iOS range, and `Release iOS` applies the equivalent cumulative
comparison before publication. The release-specific set includes product,
Fastlane, signing dependency, versioning, classifier, and release-workflow
changes. A change to the release decision itself therefore receives the same
real TestFlight proof as an iOS product change.

The blocking iOS job compiles the Release configuration, runs the full unit
suite, and executes the small no-external-write UI set in
`scripts/ios/ci-smoke-tests.txt`. This protects compilation, core navigation,
explicit-action, language, accessibility, and retained-evidence boundaries
without starting a fresh XCTest runner for every UI journey. Use the CI
workflow's manual `full` scope for the complete isolated UI regression suite;
the default manual and automatic scope is `smoke`. Keep the smoke list bounded
and move scenario expansion to full regression rather than silently restoring
a long blocking gate.

Swift CodeQL still runs on relevant `main` pushes, the weekly Security run, and
manual Security runs. It is not duplicated in pull-request latency because the
blocking iOS Release compilation and tests already reject build failures, while
the main and scheduled scans preserve repository-wide Swift security analysis.

The release job exchanges GitHub's OIDC token for a short-lived Infisical token,
loads only `staging:/release`, and checks required names without printing their
values. It joins the internal TestFlight tailnet as an ephemeral `tag:ci` node,
writes the validated `TALENT_SIGNAL_API_BASE_URL` into the app build
configuration, verifies tailnet reachability and a current Apple
authentication challenge before signing, writes signing material only under
the runner temporary directory, verifies
read access to the isolated private match repository, and removes those files
even after failure. Fastlane waits for App Store Connect build processing. The
tag and GitHub prerelease are created only after that stronger acceptance
point, not merely after transport upload.

Provisioning-profile renewal is a separate maintenance operation. The
`Refresh iOS signing` workflow requires explicit confirmation and a dedicated
`MATCH_MAINTENANCE_DEPLOY_KEY` with write access to the isolated match
repository. The workflow regenerates profiles for `com.talentsignal.app`,
`com.talentsignal.app.share`, and `com.talentsignal.app.live-activity` after
the required App ID capabilities are enabled. It then downloads the primary
app profile through the scoped App Store Connect credential, verifies its
bundle ID, profile name, Sign in with Apple entitlement, and isolated match
distribution certificate, and encrypts the profile into match. It
does not archive or upload the app and shares the release concurrency lock.
Ordinary TestFlight CI keeps using its dedicated read-only key and cannot write
the signing repository.

App Store Connect owns the last delivery hop. Talent Signal must have an
internal testing group with automatic distribution enabled and at least one
eligible App Store Connect user. A green workflow proves upload and processing;
the App Store Connect group and an invited-device installation prove that the
build is usable on a phone.

`TestFlight Access` audits the active team user, pending team invitation,
TestFlight tester state, internal group membership, and latest valid build
without exposing the configured tester email. It repairs missing group or build
relationships and resends an unaccepted invitation when requested. A result of
`SERVER_ACCESS_READY` proves only the server-side access path; tester states
`INVITED`, `ACCEPTED`, and `INSTALLED` remain distinct, and only the last one
proves a device download.

## Required GitHub settings

- Repository visibility: public.
- Workflow token default: read-only.
- Actions must be pinned to full commit SHAs.
- Secret scanning, validity checks, and push protection: enabled.
- Dependabot alerts and security updates: enabled.
- Private vulnerability reporting: enabled.
- `main`: pull request required, force-push and deletion blocked, `CI required`
  and `Security required` required.
- `testflight`: only `main`, without a required reviewer.
- Infisical `staging:/release/TALENT_SIGNAL_API_BASE_URL`: the stable HTTPS
  origin selected for the current release stage, with a reachable,
  contract-current Apple authentication challenge. The internal stage may use
  a tailnet-only Tailscale Serve origin; external testing and production require
  the public production origin.
- Infisical `staging:/release/TS_OAUTH_CLIENT_ID` and `TS_OAUTH_SECRET`: a
  Tailscale trust credential limited to ephemeral `tag:ci` nodes with
  device-core and auth-key write scopes. The tag is admin-owned and the
  credential is never written into the app.
- `testflight` variable `INFISICAL_TESTFLIGHT_IDENTITY_ID`: the non-secret ID of
  the OIDC Machine Identity. Its Infisical role permits only secret description
  and value reads in `staging:/release`. Its OIDC discovery origin is
  `https://token.actions.githubusercontent.com`, and its subject is the immutable
  repository-ID form for this repository's `testflight` GitHub Environment.
- Private match repository: `getyak/talent-signal-certs`, with only encrypted
  Talent Signal signing assets and a dedicated read-only CI deploy key.
- Public App Store submission remains an explicit promotion after metadata,
  agreements, App Review readiness, and a human release decision are verified.

The release, signing-refresh, and TestFlight-access workflows use only the
Infisical OIDC identity and fail closed when it cannot supply the complete
contract. The former GitHub secret fallback was removed after release
`0.1.13 (20260828111000)` completed Apple processing and internal distribution.
Profile refresh deletes only the three exact App Store profile names, regenerates
them through the maintenance key, then verifies the shared App Group on all
three and Sign in with Apple on the main app before accepting the new Match
repository revision.

## Link checking policy

Repository-owned documentation integrity is a required gate. The deterministic
documentation check verifies the knowledge map, required Agent guidance,
canonical-document context budgets, local links, and the boundary that keeps
implementation-level specifications out of foundational documents.

Lychee separately checks external HTTP links and publishes its findings in the
job summary, but external reachability is advisory. A third-party timeout,
connection reset, rate limit, or anti-automation response is not evidence that
the tested revision is unsafe, so it cannot block CI or TestFlight delivery.
Contributors should still repair confirmed broken destinations when editing the
owning document. HTTP 202 and 429 remain accepted, while known runner-inaccessible
CAC and exact OpenAI documentation URLs remain excluded to keep the report
useful rather than noisy.

## Wiki compilation gate

Knowledge articles are edited in `_index/` and compiled into generated `docs/`
pages. The repository CI runs the compiler tests and a read-only
`node scripts/wiki.mjs check`. The check compares every generated page
byte-for-byte, validates metadata and wiki links, and rejects missing, stale, or
orphaned generated files.

Contributors should install `.githooks/pre-push` with `pnpm hooks:install`.
When a push contains `_index/`, generated `docs/`, or compiler changes, the
hook runs both the repository knowledge contract and the read-only compiler
check. A stale compilation must be resolved by running `pnpm wiki:build`,
reviewing and committing the source plus generated diff, and then pushing
again. The hook never mutates a commit during push.

## Failure and recovery

- Use `gh run list`, `gh run view RUN_ID`, and `gh run rerun RUN_ID --failed`
  to inspect or retry checks.
- If an iOS regression requires the complete UI suite, dispatch `CI` with
  `ios_test_scope=full`. Do not enlarge the blocking smoke list as a substitute
  for an explicit full run.
- A failed TestFlight upload creates no release tag. Rerun the failed workflow
  after correcting credentials or signing state.
- A missing, non-HTTPS, redirected, unreachable, or contract-stale iOS API URL
  fails before signing. Repair the `testflight` Environment variable or backend
  deployment; never substitute the marketing site or a Release fixture.
- If Xcode reports that the match profile lacks a required entitlement, enable
  the capability for every affected App ID, run `Refresh iOS signing` with
  explicit confirmation, and rerun the failed verified release. The scoped App
  Manager API key and maintenance key have live proof for regenerating the app
  and extension profiles. Do not remove a product capability to fit a stale
  profile.
- If TestFlight accepts an upload but processing or later metadata fails,
  verify the version and build number in App Store Connect before rerunning to
  avoid duplicate uploads.
- If a release waits before receiving a runner, inspect environment protection
  rules and the global `release-ios` concurrency group. Cancel obsolete waiting
  runs before changing a gate so a stale build cannot begin unexpectedly.
- Never bypass the `main` environment restriction to solve a signing problem.
  Rotate or repair the scoped deploy key or secret instead.
