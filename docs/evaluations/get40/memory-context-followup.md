# GET-40: per-turn memory context

Date: 2026-09-22. Baseline: PR 235 at e6b9dcf3.

## Delivered behavior

Private workspace turns load the authenticated user's accepted self memory
before invoking the model. The core keeps statement kind, speaker/reporter,
time, version, conflicts and source pointers, without copying source excerpts.
It admits at most 100 records and 24,000 serialized item characters. These are
initial engineering limits, not a measured optimal token allocation.
Overflow is explicit; unavailable reads differ from an empty profile.

Typed response settings enter the SDK context before the answer, independently
of self-memory prose. The current request overrides ordinary presentation
defaults. Existing scoped preference reads remain available.

On-demand recall preserves full provenance and exact retained excerpts, returns
20 records per Agent page, and exposes continuation. The public read endpoint
retains its existing 100-record maximum. Pagination preserves PostgreSQL
microseconds and record-ID ordering; scope/cursor filters never widen owner or
business access. Evidence reads are batched rather than queried once per item.

Existing source-generation invalidation protects resumed SDK sessions. The
workspace host checks authority before/after bootstrap, around recall, and
after the provider returns. Failed relationship recall no longer masquerades
as an empty successful result.

## Verification

- Agent suite: 296 passed, 1 skipped. Includes no-tool provider-wire checks for
  service preference and self-context delivery, instruction/data separation,
  business isolation, source metadata and explicit partial coverage.
- Backend focused suite: 141 passed across Memory review, workspace Agent,
  response preferences and harness sessions. A dedicated disposable PostgreSQL
  17 database ran all 85 repository migrations.
- New database cases cover two fresh clients reading the same self, same-account
  owner separation, 105-record pagination with identical microsecond timestamps,
  business scope exclusion, invalid/foreign cursors, and an answer rejected
  when a concurrently loaded memory is corrected or its source revoked.
- Agent typecheck, backend build, Web typecheck, documentation and architecture
  checks passed. No Web/native UI implementation changed.

Reproduce database tests with a synthetic migrated database:

```sh
CONTACT_AGENT_TEST_DATABASE_URL=<synthetic-database-url> pnpm --filter @talent-signal/backend exec vitest run src/modules/memoryReview.integration.test.ts src/modules/workspaceConversationAgent.test.ts src/modules/memoryReview.test.ts src/modules/agentPreferences.integration.test.ts src/modules/harnessSessions.integration.test.ts
pnpm --filter @talent-signal/agent test
pnpm --filter @talent-signal/backend build
pnpm --filter @talent-signal/web typecheck
pnpm docs:check
```

## Remaining boundaries

L1 indexing, thematic L2 synthesis, dreaming, broader service-setting types,
new source retention and research-before-contact workflows are not implemented
by this follow-up. Accepted records and the existing typed preference store
remain the underlying state. No automatic fact promotion or external action
was introduced.

These are deterministic host, database and provider-wire checks, not proof of
model extraction or conversational quality. The paid-model acceptance gap in
[the phase-2 report](phase-2-web-report.md) remains; keep PR 235 in draft.

The required local TestFlight deployment was attempted with
`./scripts/deploy/testflight-local.sh`; it stopped because the Infisical CLI is
unavailable, before deployment. No production deployment occurred.
The baseline iOS CI failure was an accessibility-audit timeout in
`testAX5DarkModeCriticalContentRemainsReachable`; this follow-up does not claim
to resolve that separate failure.
