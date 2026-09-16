# Web Session boundary evidence

- Observed: 2026-09-16 (Asia/Shanghai)
- Build: `44f6f60f` (implementation introduced by `3e9735c4`)
- Platform: local Next.js Web in the Codex in-app Chromium browser
- Backend: local Fastify API with an isolated PostgreSQL container
- Fixture: public synthetic `Fixture Alpha Search` seed; no private account data
- Production deployment or external write: none

## TS-006 — unscoped Session

The browser created Session
`0a8c4d73-4138-4eb0-ab3e-ede8a8c1f659` without selecting a Person. The detail
surface visibly labeled the scope as unbound and the display authority as
`stale_unconfirmed`. Creating it produced zero turns and did not invoke model or
external-effect infrastructure.

After entering a two-line draft and reloading the browser, the textarea restored
the exact draft and showed the saved state. A later save advanced the same
canonical Session to revision 3. Read-only PostgreSQL evidence after the browser
run:

```text
id: 0a8c4d73-4138-4eb0-ab3e-ede8a8c1f659
revision: 3
title: 新的对话
person_id: null
composer_draft: A 端已保存的新版本：准备核对林珊的关注点，不发送。
turn_count: 0
deleted_at: null
active: true
```

Screenshots:

- `screenshots/web-session-empty-1440.png`
- `screenshots/web-session-restored-1440.png`
- `screenshots/web-session-list-1440.png`

Known gap: this evidence proves unscoped create, persistence, recovery, and list
readback. It does not yet prove the Person/evidence/review/receipt round trip.

## TS-024 — draft conflict

Two authenticated browser tabs loaded revision 2 of the same Session. Tab A
saved a new draft and advanced the canonical row to revision 3. Tab B then
attempted to save different text with its stale expected revision.

The Web adapter surfaced the backend conflict instead of retrying over the newer
row. The page disabled deletion, displayed the explicit non-overwrite warning,
and retained Tab B's complete local draft for copy or manual recovery. The
PostgreSQL readback above confirms that Tab A's canonical value won.

Screenshots:

- `screenshots/web-session-conflict-1440.png`
- `screenshots/web-session-conflict-390.png`

Known gap: human design acceptance remains `not_reviewed`; the 390 px screenshot
proves the conflict controls are visible and operable, not the full mobile test
matrix.

## TS-011 — Session navigation recovery

The browser followed the product route rather than a fixture-only shortcut:

1. The unscoped Session linked to `/workspace/people` with its validated Session
   return identifier.
2. Contact search, clear-search, new-contact, Person, and relationship-context
   links preserved that identifier without changing the Session's canonical
   `personID` or claiming a new scope.
3. The selected synthetic relationship showed the message-level source and its
   three pending proposed facts.
4. An initial attempt against a deliberately stale identity-correction fixture
   was rejected by the backend. The Web UI displayed the stale-review error and
   left all three claims unchanged.
5. The purpose-built `fixture:web-session-roundtrip` command then created an
   active synthetic source with zero model calls and zero external effects.
6. Confirming `location = Shanghai` produced a durable fact-decision receipt,
   refreshed the same page to `1 / 3` reviewed, displayed the active confirmed
   state and relationship-history event, and kept the Session return link.
7. Returning through that link reopened the exact Session UUID and restored the
   previously saved draft.

Read-only PostgreSQL readback after the browser mutation:

```text
assertion_id: a582a41a-6223-4ca3-a873-52e706c67060
field: location
review_status: confirmed
decision_id: 59c558dd-c847-4c77-bb9c-eef8b689e8fb
decision: confirm
assertion_version: 1
state_id: ae9b1008-b121-4862-9387-72e9048dbab8
state_status: active
state_value: Shanghai
```

Screenshots:

- `screenshots/web-session-review-receipt-1440.png`
- `screenshots/web-session-round-trip-return-1440.png`

Known gap: TS-011 proves the Web recovery path for one current synthetic
relationship. It does not claim that the Session itself became relationship
scoped, and it does not promote the remaining exceptional-state or native cases.

## Post-review draft and directory hardening

Commit `4e932e60fac5d07ef09e6eafa1ee6f7708959cde` adds deterministic
recovery around the earlier browser observation:

1. The renderer serializes one active save plus one latest-state follow-up and
   generation-fences both late responses and already-scheduled microtasks.
2. Before leaving the page, it durably records the exact latest draft request
   and, while a request is active, its exact predecessor. A restart continues
   only when canonical state still matches the base or the exact predecessor;
   unrelated state becomes a visible conflict and is never overwritten.
3. Server retry reconciliation includes caller-owned timestamps. An exact
   retry can settle after a lost response, while a same-text/new-time or
   otherwise changed request receives `409`.
4. Recovery records are bounded to 24 hours, contain no credential, and are
   partitioned by an HMAC of account/user identity. The global workspace
   boundary prunes other scopes even when the requested Session is unavailable;
   every reachable logout path clears both Session and MeetingDraft intents.
5. Directory pagination materializes only owner-scoped identity and frozen
   sort keys for five minutes. It is bounded to 5,000 rows and four active
   snapshots, and only first-page materialization consumes the 30/minute owner
   rate bucket. A real PostgreSQL lock-timeout test proved auxiliary snapshot
   cleanup cannot abort sensitive Session scrubbing or a user mutation.

Focused verification passed Web 7 files/47 tests and Backend 2 files/51 tests
against isolated PostgreSQL. The final root check passed Web 99 files/626 tests
(`1/1` skipped) and Backend 59 files/445 tests (`10/139` skipped), plus lint,
typecheck, the 39-page production build, 75-migration architecture checks, and
secret scanning. Independent review found no unresolved P0/P1/P2 in this
hardening diff.

Residual P3 evidence boundary: the returned rows intentionally project current
canonical content, so a concurrent update can make displayed `updated_at`
briefly non-monotonic relative to the frozen directory order. The frozen
identity set/order still prevents duplicates and omissions. No historical
screenshot or TS status is promoted by these tests.

## Verification

- `pnpm --filter @talent-signal/web lint`: passed.
- `pnpm --filter @talent-signal/web typecheck`: passed.
- `pnpm --filter @talent-signal/web test`: 92 files passed, 1 skipped; 577
  tests passed, 1 skipped.
- `AUTH_SECRET=synthetic-build-secret-for-web-session AUTH_TRUST_HOST=true pnpm
  --filter @talent-signal/web build`: passed; both Session routes and the
  relationship routes were emitted by the production build.
- `pnpm --filter @talent-signal/backend typecheck`: passed.
- `pnpm --filter @talent-signal/backend test`: 55 files passed, 9 skipped; 416
  tests passed, 130 skipped.
- `API_BASE_URL=http://127.0.0.1:4327 pnpm --filter
  @talent-signal/backend fixture:web-session-roundtrip`: passed against the
  isolated backend with three pending claims, zero model calls, and zero
  external effects.
- `pnpm docs:check`: passed with 11 canonical documents and 564 Markdown files.

The isolated backend and PostgreSQL volume were stopped and removed after the
readbacks were captured.

## Screenshot hashes

| Evidence | Viewport | SHA-256 |
| --- | --- | --- |
| `screenshots/web-session-empty-1440.png` | 1440 × 1000 | `446632ae4f934882d95ad07eeb2f5c56e6f11e58c250a893b462339310c0fc51` |
| `screenshots/web-session-restored-1440.png` | 1440 × 1000 | `5d67f315f7f4b25b2af3350879ea44e599101394e0303814f00e20c4edb3f1e8` |
| `screenshots/web-session-list-1440.png` | 1440 × 1000 | `1fc56811a1e0f507cc74ccb45624aa9a0a8de94aaf0ec4703ec44e6764e0426c` |
| `screenshots/web-session-conflict-1440.png` | 1440 × 1000 | `b0f76ab2a9c5ff70410584ac82e6c5eefbac3e8daff9166a0d17e6e97779cda6` |
| `screenshots/web-session-conflict-390.png` | 390 × 844 | `f5cb62ff97b88e035ee4d061400d66bd8604e29194567538e0d8feb229279edf` |
| `screenshots/web-session-review-receipt-1440.png` | 1440 × 1000 | `6665a7ff4601001a332c738f9a46b4fa03734c08517d01773b37ea525a1605c1` |
| `screenshots/web-session-round-trip-return-1440.png` | 1440 × 1000 | `cb1f9a639d94fa9292edd487e59c8bd6c1e484a60ebf9768b2c1d3b0c609569e` |
