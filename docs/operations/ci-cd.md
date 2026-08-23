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
        |      iOS build/test when relevant
        |
        +--> Security required
               dependency review on pull requests
               credential hygiene
               CodeQL for web, Actions, and relevant Swift changes

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

All third-party actions are pinned to full commit SHAs. Dependabot proposes
weekly updates for GitHub Actions, pnpm, and Bundler.

## Release gates

An ordinary workflow dispatch defaults to **not** publishing TestFlight. A
manual caller must explicitly set `publish_testflight`, and an automatic
release is considered only when the verified `main` change touches iOS release
inputs. The `testflight` GitHub Environment permits only `main`; it intentionally
has no required reviewer because internal TestFlight delivery is the continuous
delivery target.

The release job checks required secret names without printing their values,
writes signing material only under the runner temporary directory, verifies
read access to the isolated private match repository, and removes those files
even after failure. Fastlane waits for App Store Connect build processing. The
tag and GitHub prerelease are created only after that stronger acceptance
point, not merely after transport upload.

App Store Connect owns the last delivery hop. Talent Signal must have an
internal testing group with automatic distribution enabled and at least one
eligible App Store Connect user. A green workflow proves upload and processing;
the App Store Connect group and an invited-device installation prove that the
build is usable on a phone.

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
- Private match repository: `getyak/talent-signal-certs`, with only encrypted
  Talent Signal signing assets and a dedicated read-only CI deploy key.
- Public App Store submission remains an explicit promotion after metadata,
  agreements, App Review readiness, and a human release decision are verified.

These settings are managed through the GitHub API during repository bootstrap.
Review them after ownership, plan, or maintainer membership changes.

## Link checking policy

Lychee checks committed Markdown. HTTP 202 is accepted because EUR-Lex uses it
for reachable legal-document pages, and HTTP 429 is retried/accepted to avoid
turning rate limiting into a false documentation failure. CAC URLs are excluded
because that host is not reachable from GitHub-hosted runners; their sources
remain in the documents and should be manually reviewed when edited. Three exact
OpenAI documentation URLs are also excluded because their anti-automation layer
returns HTTP 403 to GitHub-hosted runners; the rest of those domains are still
checked.

The repository documentation check separately verifies the knowledge map,
required Agent guidance, canonical-document context budgets, local links, and
the boundary that keeps implementation-level specifications out of
foundational documents.

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
- A failed TestFlight upload creates no release tag. Rerun the failed workflow
  after correcting credentials or signing state.
- If TestFlight accepts an upload but processing or later metadata fails,
  verify the version and build number in App Store Connect before rerunning to
  avoid duplicate uploads.
- If a release waits before receiving a runner, inspect environment protection
  rules and the global `release-ios` concurrency group. Cancel obsolete waiting
  runs before changing a gate so a stale build cannot begin unexpectedly.
- Never bypass the `main` environment restriction to solve a signing problem.
  Rotate or repair the scoped deploy key or secret instead.
