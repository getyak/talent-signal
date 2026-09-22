# GET-40 implementation and acceptance evidence

Date: 2026-09-22. Status: implemented in an isolated worktree; local functional
and visual verification performed. **Real-model acceptance remains incomplete.
Do not close GET-40 or deploy this revision.** This report supersedes the earlier
worker checkpoints; the backend report remains historical evidence.

Design source: [Memory v0.2 in Notion](https://www.notion.so/3e2a444a6c00814ab207df61bbd622f3).
All examples, accounts, names, conversations and screenshots below are synthetic.
The fixture provider exercises production API, PostgreSQL, queue, BFF and UI;
it is not evidence of model quality or measured user value.

## Delivered behavior

The answer remains the primary response. A separate review card offers only the
proposed changes, grouped into self, person and directed relationship memory.
Folded groups show one complete stored sentence; expanded groups show at most
four choices and open the full group in a desktop side panel or mobile bottom
sheet. More than 20 items enables scoped search. Source, speaker, time and the
reason for a suggestion are available in the item detail.

New-contact creation and selected memory share one transactional confirmation.
Skipping a contact retains independent self items, while restoring that contact
preserves earlier choices. Changing identity regenerates against the selected
person's authorized memory and original source, resets dependent choices, and
never transfers another person's statements. Conflicts and sensitive judgments
remain separate from ordinary bulk selection. Changes show old and new text.

A signed rendered entry capability binds requests to the current account,
Session or Pursuit association. Business views project only their allowed
person/relationship data, including receipt IDs and counts. Partial saves keep
unconsumed Chat choices. Unknown commit outcomes reconcile the same operation;
undo checks current versions and reports whether a created contact was retained.
Natural source expiry preserves only accepted minimum evidence. Explicit
withdrawal, deletion, rebind, broken epoch lineage and unavailable pending
sources fail closed.

## Browser acceptance

Production Web build, real PostgreSQL 18 and backend on owned loopback ports
55440–55444. The following were directly exercised through the browser:

| Case | Observation |
| --- | --- |
| 17 proposals, 3 / 8 / 6 | Expanded person group, opened all 8, deselected one, saved 16. Receipt and actual person page persisted after reload. |
| Pure two-image input, 390 px | One composer/turn, 17 candidates; skip left 3 self; restore kept the deselected person item. |
| Lost successful commit response | Proxy drained the real successful backend response and dropped it. UI reported unknown, reload recovered 16; database contained one receipt, not a second commit. Undo then persisted. |
| Business partial save | Saved the 6 relationship items from the Pursuit. Chat then showed 11 remaining with 10 selected, preserving the earlier unchecked self item. |
| 21-item group | Search found one future-plan item; deselection retained 20 hidden choices. Detail/back retained search. Reload retained 20/21. |
| Keyboard | Tab wrapped inside the sheet. Escape returned to the exact “remaining items” trigger. |
| Dark / reduced motion | Dark desktop sheet inspected; reduced-motion media produced 0.00001 s animation. No horizontal document overflow at 1280 px. |
| Contact only | Unchecked all 17, saved only the contact; actual person page reported no saved memory. |
| No contact / no memory | Skipped contact, unchecked 3 self, dismissed. Reload showed the terminal acknowledgement and no pending card. |
| Invalidated source | Replaced source produced a visible unavailable explanation and disabled save. This fixture tests changed source, not clock expiry. |
| Update/conflict | Old→new and separate unchecked conflict; explicit keep-conflict saved two. A later real domain edit blocked undo without a success claim. |
| Identity failure/recovery | Failed target preserved the existing binding; selecting another same-name contact with an explicit relationship regenerated dependent items unchecked. |
| New Chat authority | Sent a real first message, used brand and New Chat for two successive resets, received distinct server-authorized draft Sessions. A third text-only 17-line source produced a useful answer followed by the review card. |

The minimal data was inspected on the real person page; business no-self bytes,
IDs and counts are additionally covered by deterministic BFF and PostgreSQL
projection tests. A screen reader was not manually exercised; accessible names,
roles and keyboard behavior were inspected. Native iOS was not changed/tested.

## Runtime captures

- [Final desktop card](runtime/desktop-final-card.png)
- [Final 390 px contact header](runtime/mobile-final-card.png)
- [Desktop answer followed by card](runtime/desktop-answer-card.jpg)
- [Desktop saved receipt](runtime/desktop-saved16.jpg)
- [Mobile full group](runtime/mobile-sheet.jpg)
- [Mobile unknown outcome](runtime/mobile-unknown.jpg)
- [Mobile undo](runtime/mobile-undone.jpg)
- [Business save leaves 11 / selected 10 in Chat](runtime/chat-remaining11-selected10.jpg)
- [Dark 21-item sheet](runtime/desktop-dark-21.jpg)
- [Desktop review and save recording](runtime/desktop-main.gif)
- [Mobile review, response-loss recovery and undo recording](runtime/mobile-recovery-undo.gif)
- [Update/conflict and rejected undo recording](runtime/update-conflict-guarded-undo.gif)
- [Identity failure and recovery recording](runtime/identity-recovery.gif)

Recordings use actual captured browser frames, with uniform playback intervals;
they do not measure latency. [Recording manifest](runtime/recordings.json) lists
frame selection and viewport. Early rejected-undo and identity recordings precede
final copy refinements; they prove behavior, not the latest exact wording.

## Verification

- Agent suite: **290 passed, 1 skipped**.
- Backend Memory PostgreSQL integration + workspace conversation host:
  **114 passed** (72 database cases and 42 host cases).
- Web suite after navigation and rebase fixes: **1196 passed, 1 skipped**.
- Backend full suite: **706 passed, 289 skipped** without the optional database
  environment; the 72 Memory PostgreSQL cases above ran separately with the real DB.
- Web lint and production build: passed. Build requires an isolated AUTH_SECRET;
  one run without it correctly failed configuration validation, then passed.
- Real pinned Claude SDK `tools/list` and outbound wire probe: **5 tools loaded**,
  including Memory and contact lookup. Local synthetic HTTP endpoint, no paid call.
- Offline evaluator: 20 frozen inputs traversed the real production host with a
  deliberately scripted provider; this is plumbing validation only.
- Fresh synthetic database: all 85 manifest migrations applied. New unshipped
  migrations 076–080 add Memory, credentials, source authority and Pursuit pins.
- Independent reviews required fixes for image/identity authorization, atomic
  scoped undo, source epoch gaps, entry capabilities, provider schema conversion,
  navigation ownership, false success after failed re-open, and persisted contact
  decisions after identity replacement. Final independent source review found no
  unresolved P0/P1. Three real persisted-draft database cases cover new→existing,
  existing→new and skipped→existing, with stale-write rejection, reopen and commit.
  Parent implemented
  fixes personally after Pi's provider balance failure.

Commands (from the task worktree):

```sh
pnpm --filter @talent-signal/agent test
CONTACT_AGENT_TEST_DATABASE_URL=postgres://get40_test@127.0.0.1:55440/get40_test pnpm --filter @talent-signal/backend exec vitest run src/modules/memoryReview.integration.test.ts src/modules/workspaceConversationAgent.test.ts
pnpm --filter @talent-signal/web test
pnpm --filter @talent-signal/web lint
pnpm --filter @talent-signal/web build
node scripts/evals/get40/probe-tool-wire.mjs
pnpm docs:check
```

## Actual-model result: incomplete, not a pass

Frozen 20-case source: `scripts/evals/get40/inputs/frozen-cases.json`, including
at least five expected no-change cases. Admitted model: `anthropic/claude-sonnet-5`
through the existing Hao endpoint. No public research or external business writes.

1. [Initial 20-case run](runtime/actual-model-evaluation.json) exposed an SDK
   schema-conversion defect: the Memory locator's Zod record made MCP tools/list
   fail for the whole server. None of the five tools reached the model. These
   outputs are a failed baseline, not a quality result. SDK estimate USD 0.1932567.
2. [One-case diagnostic](runtime/actual-model-diagnostic.json) confirmed empty
   tools despite MCP connection. SDK estimate USD 0.009018. A prior credential-only
   probe cost estimate was USD 0.004072; it did not test this feature.
3. After equivalent `looseObject` schema conversion and a real SDK wire regression,
   the [corrected run](runtime/actual-model-schema-fixed.json) reached five cases.
   Cases 1–3 did not propose the expected memory. Case 4 invoked Memory successfully
   but the evaluator opened the wrong scope and had not persisted the completed
   bound turn, so its reviewability was not established. Case 5 exceeded the
   evaluator's 24,000-token ceiling after contact lookup. The run stopped at
   unavailable usage, as designed. Known SDK estimate USD 0.1472408; one case's
   cost remains unknown. Billed cost is unknown throughout.

The prompt now distinguishes reusable self preferences from transient requests,
recognizes explicit native handles, and prefers one combined Memory/contact
proposal. The evaluator now persists and reads back the bound turn, opens a
person/relationship view without private self scope, and records sanitized
permission-denial codes and terminal reasons. These final corrections have not
been re-evaluated with a paid model. No budget increase or automatic paid restart
was performed after unavailable usage.

A completed 20-case model evaluation, A/B/C causal comparison, human checking
time, and user-value verification remain unmeasured. The token ceiling must be
reconciled with the observed full tool-schema cost before a bounded continuation.
These limitations remain explicit delivery gates, not hidden in aggregate tests.

## Reproduction and isolation

Use a disposable loopback PostgreSQL database named `get40_test` or `get40_eval`,
apply backend migrations, build packages, then start
`scripts/evals/get40/fixture-server.mjs` with `DATABASE_URL` and an owned
`GET40_MEDIA_DIR`. `seed-fixtures.mjs` documents its required CLI arguments and
writes mode-0600 synthetic credentials. First nine scenarios have independent
accounts; business scenarios share only the account required for partial-save
and identity comparisons. Do not commit the credential receipt.

Run production Web with a generated AUTH_SECRET, AUTH_URL, AUTH_TRUST_HOST,
TALENT_SIGNAL_INTEGRATION_MODE=true and TALENT_SIGNAL_BACKEND_URL pointing at
the fixture host (or the response-loss proxy for the unknown-outcome case).
The proxy is loopback-only and its one-shot file affects only the next Memory
commit/undo response. There is no unauthenticated product admin endpoint.

No production deployment, resident-service change, private customer data,
Simulator run or TestFlight release was part of this acceptance.
