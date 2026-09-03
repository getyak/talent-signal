# Deterministic system check summary

- Artifact: `TS-SYSTEM-E2E-2026-09-03-01`
- Frozen commit: `5ba505ae45e3df51b3339427da79c96fde42c137`
- Execution window: `2026-09-03T09:58:30Z` through `2026-09-03T10:06:17Z`
- Data boundary: repository-owned synthetic fixtures and disposable local state only
- External effects: none
- Product-source edits by this check owner: none
- Result: deterministic checks pass; release readiness remains `needs_review`

All times below are UTC. Every command ran from the repository root. Raw output
is retained beside this summary. Secret-injecting and live-provider checks were
excluded. A post-run credential-shaped-value scan found zero potential values
in the retained logs and JSON artifacts.

## Results

| Check and raw log | Command | Start | End | Exit | Pass / fail evidence |
| --- | --- | --- | --- | ---: | --- |
| [Web lint](web-lint.log) | `pnpm lint` | `09:58:30` | `09:58:43` | 0 | 0 lint findings |
| [Web typecheck](web-typecheck.log) | `pnpm typecheck` | `09:58:43` | `09:58:48` | 0 | contracts build and Web TypeScript check passed |
| [Web tests](web-test.log) | `pnpm test` | `09:58:48` | `09:58:56` | 0 | 291 passed, 0 failed, 1 skipped; 52 files passed, 1 skipped |
| [Web production build, unconfigured](web-build.log) | `pnpm build` | `09:58:56` | `09:59:16` | 1 | 0 passed, 1 failed: production page-data collection correctly stopped because `AUTH_SECRET` was absent |
| [Web production build, configured](web-build-configured.log) | `pnpm build` with an inherited synthetic, non-production `AUTH_SECRET` | `09:59:25` | `09:59:42` | 0 | compiled, typechecked, and generated 32/32 static pages |
| [Agent packages](agent-check.log) | `pnpm agent:check` | `09:59:46` | `09:59:57` | 0 | Agent: 50/50 tests; Agent Host: 23/23 tests; all typechecks and builds passed |
| [Backend CI](backend-ci.log) | `./apps/backend/scripts/ci.sh` | `10:00:01` | `10:00:19` | 0 | backend 256/256 tests plus Agent 50/50 tests; contracts, Agent, and backend typechecks/builds passed |
| [Core evaluation validation](eval-core.log) | `pnpm eval:core` | `10:01:03` | `10:01:06` | 0 | 8/8 core cases, 6 review objects, 9 cross-surface assertions, 12 craft dimensions, 2 schemas, and 4 examples passed |
| [V1 P0 oracles](eval-v1-p0.log) | `pnpm eval:v1-p0` with output redirected to [v1-p0-runtime.json](v1-p0-runtime.json) | `10:01:06` | `10:01:08` | 0 | 12/12 journeys, 71 assertions, and 30 deterministic Agent trials passed; live proof truthfully reports `not_run_missing_credentials` |
| [Eval runner package](eval-runner-check.log) | `pnpm eval:runner:check` | `10:01:08` | `10:01:18` | 0 | 39/39 tests and runner typecheck passed |
| [Eval repository](eval-validate.log) | `pnpm eval:validate` | `10:01:18` | `10:01:21` | 0 | 36 scenarios loaded, including 12 P0; 0 contamination findings |
| [Local P0 suite](eval-p0.log) | `pnpm eval:p0 -- --artifact-dir docs/evaluations/2026-09-03-system-e2e-agent-review/checks/eval-p0-artifacts` | `10:01:21` | `10:01:25` | 0 | deterministic safety: 12 passed, 0 failed, 0 not run; release gates: 12 `needs_review`, 0 failed |
| [iOS localization](ios-localization.log) | `pnpm ios:localization:check` | `10:02:16` | `10:02:19` | 0 | boundary passed for 1,025 catalog keys; remaining inventory is 164 transitional bilingual calls and 209 raw SwiftUI literals |
| [iOS script contracts](ios-script-contracts.log) | `node --test scripts/ios/configure-build-environment.test.mjs scripts/ios/probe-auth-backend.test.mjs` | `10:02:19` | `10:02:19` | 0 | 7 passed, 0 failed |
| [macOS aggregation contract](macos-summary-contract.log) | `node --test scripts/macos/summarize-companion-trials.test.mjs` | `10:02:19` | `10:02:19` | 0 | 3 passed, 0 failed |
| [macOS release-validator contract](macos-eval-contract.log) | `pnpm eval:macos:contract` | `10:02:19` | `10:02:21` | 0 | 4 passed, 0 failed |
| [Frozen macOS evidence validation](macos-eval-release.log) | `pnpm eval:macos:release` | `10:02:22` | `10:02:24` | 0 | 38/38 requirements effective-pass, 121 evidence entries valid, 0 contract errors, 0 release blockers; all three category scores are 100 |
| [Evaluation library](evaluation-package-check.log) | `pnpm --filter @talent-signal/evaluation typecheck`, `test`, and `build` | `10:03:28` | `10:03:38` | 0 | 22 passed, 0 failed; typecheck and build passed |
| [Evaluation proof contract](eval-proof.log) | `pnpm eval:proof` | `10:03:38` | `10:03:41` | 0 | proof passed; 2 historical experiments, 0 logical-span retry growth, deletion readback verified; release readiness remains `needs_review` |
| [Brand assets](brand-check.log) | `pnpm brand:check` | `10:03:41` | `10:03:43` | 0 | 5 SVG sources and 20 PNG exports passed |
| [Secret-boundary tests](secrets-contract-tests.log) | `pnpm secrets:check:test` | `10:03:43` | `10:03:45` | 0 | 18 passed, 0 failed |
| [Retained-artifact scan](sensitive-value-scan.log) | local credential-shaped-value scan | `10:06:17` | `10:06:17` | 0 | 0 potential secret values found |
| [Documentation](docs-check.log) | `pnpm docs:check` | `10:05:54` | `10:05:58` | 0 | 11 canonical documents and 380 Markdown files passed; 3 Wiki pages and all 3 architecture diagrams passed |

## Exact failure summary

The only non-zero command was the first Web production build. Compilation and
TypeScript completed, then Next.js failed while collecting configuration for
`/api/lab/sessions/[id]/receipts` because production requires `AUTH_SECRET`.
The same command passed with a synthetic, non-production value inherited by
the process; the value was not written to the command line or retained logs.
This is an environment prerequisite, not a released bypass or a claim about
production secret delivery.

`eval:p0` completed with 12 deterministic-safety passes but deliberately
reported all 12 release gates as `needs_review`. That is not a command failure:
the suite requires authorized human-workflow evidence before release and does
not promote deterministic safety into release approval.

## Deliberately not run

- `pnpm backend:check` / the Docker-backed local integration was not started.
  The primary coordinator reported concurrent Docker startup pressure and
  reserved backend integration for a separately coordinated port/project.
  This owner started no Compose project and did not stop or delete another
  Agent's containers, volumes, or network.
- `pnpm ios:check` was not run because `ios_mobile_e2e` owned the live iPhone
  Simulator. The script begins by shutting down every booted iOS device, so
  running it concurrently would destroy the real UI evidence session.
- `pnpm macos:check` and `pnpm macos:e2e:live` were not run because
  `macos_e2e` owned the native build/UI session. The non-conflicting Node
  contracts and frozen evidence validator were run instead.
- `pnpm ios:e2e:remote-chat`, live Agent providers, and remote Opik sync/checks
  were excluded because they require real credentials or remote services.
  No credential absence was converted into a pass.

The separate Web, iOS, and macOS UI Agent artifacts remain the authority for
page coverage and interaction feel. These deterministic results establish
code, contract, safety-oracle, and build health; they do not independently
prove real-device ergonomics, live-provider behavior, or release readiness.
