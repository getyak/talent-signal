# iOS CI efficiency

## Outcome and boundary

Reduce macOS runner use and time to useful PR feedback without removing unit
coverage or the main-branch Release, accessibility, and publication gates.
Work is isolated on `codex/ios-ci-efficiency`; unrelated local work and PR #248
are outside the change. Deliver a reviewed PR with policy tests and a real CI run.

## Evidence and decisions

- Ten successful iOS jobs in the latest 50 CI runs took 32.6–47.3 minutes
  (median 39.0). Release and Debug cold builds are duplicated; Release builds
  both arm64 and x86_64 on an arm64 runner.
- Run 36114332556 failed unit tests by 09:02 UTC but continued UI work until
  09:21. Automatic runs should stop and preserve native results on failure.
- PRs need Debug compilation, all unit tests, and five core UI journeys.
  Main retains the Release build and ten release smoke journeys. Manual
  smoke/full diagnostics retain complete-result collection.
- CI paths exclude documentation and release-only tooling; PR comparison uses
  the merge base to avoid changes introduced only on the target branch.
- Preserve the cumulative trusted TestFlight receipt baseline on main: using
  only the latest push could release untested iOS work after a cancelled run.
- Do not add cross-run DerivedData caching in this slice: invalidation and
  upload overhead are unmeasured. First remove known redundant work.

## Milestones

1. [done] Add failing behavior tests for scope and execution policy.
2. [done] Implement host-architecture builds, tiered checks, and failure preservation.
3. [done] Run relevant policy, shell, and docs checks; review release and failure paths.
4. [in progress] Push once, create a PR, and inspect the real CI result and timing.

## Completion evidence

Record exact local checks, PR/run URLs, measured iOS duration, and any remaining
uncertainty below. A skipped or partial check is not a passing iOS suite.


## Local verification

- CI/iOS policy and execution tests: 41 passed before the final required-gate
  regression was added; that regression then passed separately (2/2 scope and
  gate tests). Execution fixtures use a synthetic backend and fake platform
  commands, never a real device, Docker service, or external provider.
- `pnpm docs:check`, shell syntax, `git diff --check`, and actionlint 1.7.7 passed.
- Independent review completed with no actionable findings; 24 focused tests
  passed in that review. The added bounded-retry execution test also passed
  (5/5 execution tests).
- Hosted runtime savings remain unmeasured until the PR CI completes.
