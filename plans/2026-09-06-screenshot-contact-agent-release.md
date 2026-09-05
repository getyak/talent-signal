# Screenshot contact Agent release

## Outcome and scope

Commit, review, merge, and publish the implemented screenshot contact Agent to
TestFlight. The user explicitly authorized all four actions. Work is isolated
from the shared dirty checkout in `codex/screenshot-contact-agent`, starting
at main `7f437c7`. Preserve the new full-screen Session and voice composer.

## Milestones

1. Complete: integrate the owned Agent, host, backend, Web, iOS, configuration,
   and evidence changes; verify the exact branch.
2. Active: commit, push a PR, inspect CI, and merge after required checks.
3. Pending: redeploy the exact merged backend and observe automatic TestFlight
   upload, processing receipt, and testing-group availability.

## Decisions and boundaries

- Keep already-deployed migration identifiers and checksums immutable. The
  main migration `047_proposed_extracted_text` and task migration
  `047_screenshot_contact_tasks` are distinct full identifiers; retain both.
- Use main's `proposed_extracted_text` for machine-generated message evidence.
- Add the real PostgreSQL authority test to CI after migration and seeding.
- Provider credentials stay in Infisical; no secret values enter this branch.
- Prior UI/live-model evidence is in the linked implementation plan. This
  release requires new branch validation and an actual TestFlight receipt.

## Completion evidence

Pending: exact commit, PR, CI runs, deployment readback, version/build receipt,
and App Store Connect processing/distribution status. A physical-device
installation cannot be inferred from upload success.

## Branch verification

- Agent: 55 tests; Agent Host: 34 tests; backend: 309 tests; Web: 323 tests passed.
- Seven PostgreSQL authority tests passed after applying main and task migrations,
  including the new `proposed_extracted_text` assertion. CI runs this same suite.
- Full Web lint/typecheck/production build, backend build, documentation and
  localization checks passed. Release Simulator build passed.
- Updated old provider test fixtures to the stable content hash, independent of
  request IDs, and health-check assertions to the installed task migration.
- Native retry retains its request only while image, objective, and selected
  scope match. A changed scope receives a fresh idempotency key.

PR: https://github.com/getyak/talent-signal/pull/135. First CI policy check
identified an undeclared database environment name in the local proof launcher.
It now uses the existing DATABASE_URL contract while retaining its explicit
disposable-database guard. No production credential scope was added.
