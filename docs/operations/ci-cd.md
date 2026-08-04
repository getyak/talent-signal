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
        |      iOS build/test when relevant
        |
        +--> Security required
               dependency review on pull requests
               credential hygiene
               CodeQL for web, Actions, and relevant Swift changes

successful main CI + iOS product change
        |
        +--> testflight environment approval
                signed archive -> TestFlight
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
inputs. Both routes must pass the `testflight` GitHub Environment approval.

The release job checks required secret names without printing their values,
writes signing material only under the runner temporary directory, and removes
those files even after failure. The tag and GitHub prerelease are created only
after App Store Connect accepts the upload.

## Required GitHub settings

- Repository visibility: public.
- Workflow token default: read-only.
- Actions must be pinned to full commit SHAs.
- Secret scanning, validity checks, and push protection: enabled.
- Dependabot alerts and security updates: enabled.
- Private vulnerability reporting: enabled.
- `main`: pull request required, force-push and deletion blocked, `CI required`
  and `Security required` required.
- `testflight`: only `main`, with a required reviewer.

These settings are managed through the GitHub API during repository bootstrap.
Review them after ownership, plan, or maintainer membership changes.

## Link checking policy

Lychee checks committed Markdown. HTTP 202 is accepted because EUR-Lex uses it
for reachable legal-document pages, and HTTP 429 is retried/accepted to avoid
turning rate limiting into a false documentation failure. CAC URLs are excluded
because that host is not reachable from GitHub-hosted runners; their sources
remain in the documents and should be manually reviewed when edited. Two exact
OpenAI documentation URLs are also excluded because their anti-automation layer
returns HTTP 403 to GitHub-hosted runners; the rest of those domains are still
checked.

## Failure and recovery

- Use `gh run list`, `gh run view RUN_ID`, and `gh run rerun RUN_ID --failed`
  to inspect or retry checks.
- A failed TestFlight upload creates no release tag. Rerun the failed workflow
  after correcting credentials or signing state.
- If TestFlight accepts an upload but a later metadata step fails, verify the
  build in App Store Connect before rerunning to avoid duplicate uploads.
- Never bypass the protected environment to solve a signing problem. Rotate or
  repair the scoped secret instead.
