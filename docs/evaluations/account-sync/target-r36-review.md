# r36 target relay: independent consumer review

**Verdict: the password-first target failure is a confirmed P1 integration break, not a missing legitimate native parameter. The provider-first test independently confirms a second P1 at target preparation.** The backend correctly refuses an absent credential secret; the same-origin Web adapter fails to obtain the secret it already sealed. Neither fixture should be “fixed” by exposing that HttpOnly secret to native code, a page, a URL or a JS bridge.

This is read-only review of parent-executed evidence and a frozen snapshot. No tests, database calls, provider calls or product edits were performed by this reviewer. It is not a full native review.

## Source and receipt binding

- Frozen source: `/Users/cubxxw/.codex/worktrees/account-sync-ready-r36/talent-signal`, clean HEAD `3aa05014f1b1d1d65d261e3df4a735c6d87a88ad`.
- Manifest: `macos-pi/ready-r36-snapshot.json`, SHA256 `08dfcdc02926e9c9b738fb07477ac6290cd33243b4d0117294608e1a97e895cc`; all **1,234 files** match. The twelve recorded Web/runtime receipt hashes independently match before/after and the snapshot.
- Backend `desktopAuth.ts` is unchanged from r35: `0e95ff9f1de0d7bc1a209326d0ed939ae213fc46d9e483c6c59db246687f13c1`.

| Key source | SHA256 |
| --- | --- |
| Web `app/api/desktop-auth/consume/route.ts` | `77bfcdb3ca5950fd1b1c74c22317c851840b057a9e923b4e67319d6190b6f118` |
| Web `lib/server/desktopAuth.ts` | `626b526267d795aefe117c7dc195f046316aa45b95c1ee2171836a9b11bccfb6` |
| Web `app/workspace/settings/login-methods/actions.ts` | `774a6dccdfaf0120e7576a42426f851a9a283ff90f126a4cfd59897637a225a2` |
| macOS `Services/DesktopAuthenticationSession.swift` | `d70fdab30cee7037535f221bde182649467e4d3561176561c1d576ecbfc111c0` |
| Web `lib/server/desktopReceipt.ts` | `0758745a888839a133a27752762799b343657cda3fc6277d7b4947b36c926841` |
| Web `app/api/desktop-auth/ack/route.ts` | `a2e51d0f5f1726bfefa3175eb3ec391ce733ae1895dc5b5c1eeca65d0fdf6823` |

Parent evidence directory: `/private/tmp/ai-test-account-sync.umqxBi/parent-macos-manual/web-pg-chain`.

| Evidence | SHA256 |
| --- | --- |
| `server-target-r36.mts` | `98de5526c06cc795a32c969d7e4473c168a951cd5b0d9a7269d022b4d852c56d` |
| `target-complete-r36.test.ts` | `7cac6c9faa744acca81862a6a32574e6fa6c47bf9c8a275b4ab5f805473c5a7b` |
| `r36-target-complete.json` | `e4c725c0865be5a37e957df62449a70a442a7e641fdcbf6c4a0e81bba4f719c1` |
| `r36-target-http-receipts.jsonl`, first 38 lines / 4,899 bytes | `19193aafc745d355ee6fb51ff832669041c28aaab0d6e69d5ecec5a9d5e3cb2f` |

The server trace continued to append during review. The reviewed first 38 records remain byte-for-byte intact (prefix hash above); later records are not claimed as this test's evidence. The script, test and JSON receipt stayed unchanged.

## P1 T1 — the Web consume adapter never supplies the sealed target grant secret

The actual password-first chain proves the current password through the production account route (`201`), seals the returned grant in `startPasswordStepUpLink` (`actions.ts:404–437`, secret at `420`), and successfully prepares a target D (`200`). Backend authorize→controlled Google approve→code issuance all succeed. The target consume then returns backend **`409 DESKTOP_AUTH_ATTEMPT_INVALID`**, which Web converts to **303**. The calls are recorded in both the Web receipt and the actual loopback server's HTTP trace.

The failure is deterministically explained by the contracts:

- Native `DesktopAuthRequests.consumeRequest` (`DesktopAuthenticationSession.swift:274–279`) sends only `attempt_id`, `code`, `verifier`, plus its transport correlation fields. The fixture sends those same fields.
- Web consume (`consume/route.ts:112–120`) adds the HttpOnly pairing cookie but only forwards `body.attempt_secret`; it never reads the operation's sealed grant or a flow-owned continuation.
- Backend public consume (`desktopAuth.ts:2123–2134`) passes only that optional body secret to `consumeDesktopAuthAttempt`. Target dispatch supplies an empty string if absent; `consumeTargetRound:1295–1297` immediately rejects it.
- The backend schema's optional secret is for the **server-sealed WK continuation**, not an instruction that native should learn it (`desktopAuthSchemas.ts:213–218`). Sending an opaque `credential_attempt_id` alone cannot satisfy the secret check, and that ID is not required from native's consume factory.

The fixture therefore does not omit a valid native secret parameter. It exercises the missing server adapter. There is no basis for weakening the backend's secret requirement or synthesizing a replacement secret.

### Closely coupled completion defects, source-only

Even after supplying the secret, successful target completion cannot be treated as an end-to-end pass in this snapshot:

- Web's capable `completed` response hardcodes **role `current`** (`consume/route.ts:183–191`), while native rejects a role different from its target exchange (`DesktopAuthenticationSession.swift:486–488`). This is a concrete next completion blocker.
- This completed branch does not seal a target-D continuation/context. Prepare only sets a pairing cookie (`prepare/route.ts:177–183`). ACK requires `readDesktopContinuation(targetD)` (`ack/route.ts:62–79`); the password-first flow has no such cookie, and provider-first has a cookie keyed to its **current** D, not target D. Committed result recovery also defaults to role `current` when the backend returns no continuation (`result/route.ts:82–95`). These consumers need the same target-D binding, rather than a one-line secret injection followed by another incomplete handoff.

These downstream paths were not reached by the failing dynamic test. Its final result/ACK/audit assertions were planned but did not execute. The test's expectation of `x-desktop-intent` is also not implemented in the present receipt type (`desktopReceipt.ts:35–44`); agree the safe receipt contract before treating that particular missing header alone as a new failure. The wrong role above already conflicts with the actual native consumer, independently of that additional assertion.

## P1 T2 — provider-first prepare rejects its legitimate flow-owned grant

The second case reaches actual current proof→consume `awaiting_target`→pending ACK successfully. It then **really calls** `continueTargetLink`, which resolves the relay continuation and seals an explicit target round (`actions.ts:579–611`) before redirecting with the current attempt lookup ref (`624–625`). This is stronger than a test that merely invokes prepare with invented target state.

Prepare first calls `resolveCredentialFlow('target')` (`prepare/route.ts:122–123`). That resolver requires `operation.attempt` (`desktopAuth.ts` in Web, `384–385`). A relay intentionally stores only per-flow/per-attempt continuation cookies and never copies its grant into shared `operation.attempt` (`167–192`). Consequently resolution returns null before prepare can read the supplied `continuation_attempt_id` (`147–160`), and Web returns **303 `/workspace/settings?desktop-auth=stale`** without a backend target prepare call. This is exactly what both receipts show. No extra native JSON field can repair that ordering/data-source mismatch.

### Actual current→target entry, narrow source observation

There is no automatic next target prepare in this frozen native ACK branch: `DesktopAuthenticationSession.swift:1184–1198` transitions to the fixed plain `/workspace/settings` URL (`333`). It does not invoke the server action that seals a target round. The Settings component's query-driven target link (`account-sign-in-methods.tsx:239–244`) is a raw `/desktop-auth/request` anchor, also bypassing `continueTargetLink`; it requires target/attempt/provider query parameters absent from that plain return. The separate staged target page rejects relay operations without `operation.attempt` (`link-complete/link/page.tsx:16`). Thus the dynamic test deliberately bridges a currently missing visible entry by directly calling the genuine action, and still exposes T2. Do not claim its action call proves visible native/UI reachability. The native reviewer owns the wider production wiring assessment.

## Minimal complete contract repair

1. Resolve both grant sources on the server: password-proven `operation.attempt` **or** the exact flow-owned relay continuation. Require matching operation/flow, current primary account/user/session fingerprint, pending revisions, immutable intent `link_provider`, target provider, challenge, original deadline and explicit target round. A caller's continuation ref is only a lookup/comparison key. Do not mirror relay credentials back into a shared mutable operation cookie merely to satisfy the legacy resolver.
2. At target prepare, bind the resulting **target D** to that exact sealed G/secret and frozen flow/round/actor/purpose/role/intent/provider/deadline. Keep this per-attempt sealed mapping server-only. At consume, resolve this mapping using the paired D; reject missing/foreign/replaced bindings and inject the original secret only into server-to-server backend HTTP. Do not select whichever operation happens to be current after a late callback, and do not trust a browser-supplied intent or grant to select authority. Existing backend D/G/actor/revision locks remain the final mutation guard.
3. Reuse the same mapping for truthful target consume/result/ACK metadata and ACK lookup, including role `target`, the exact flow/G and original deadline. Preserve recovery material on unknown outcomes, then retire only this attempt after its genuine committed ACK. Pending checks must not incorrectly reject a committed receipt because its own mutation advanced the revision.
4. Provide one actual current-ACK→target transition that invokes a same-origin guarded server action (or equivalent explicit endpoint) to seal the target round before native prepare. Native metadata and a raw target URL cannot grant this authority. The UI and native flow should consume the same transition tested by the harness; keep the original session and current recovery material until the target has its valid bound recovery context.

## Acceptance boundary

Rerun the existing two full chains after repair; require target consume, paired result and final ACK to succeed with exact role/flow/G and unchanged primary session, one matching audit, expected providers and only one revision increment. Require explicit failures for a replaced operation, wrong G, wrong intent/provider, expired proof and sibling/revoked session, with no credential mutation. Do not use an injected native secret, a manually sealed target cookie or a direct backend mock call to make them green.

The supplied harness uses genuine Server Actions, Route Handlers, JWT sealing, contract HTTP, a live loopback backend and isolated PostgreSQL. Its provider approval is intentionally controlled, initial primary cookie is encoded from a real synthetic backend login, and Next cookie transport is a map adapter. It does not model cookie attributes, Apple form-post transport, ASWebAuthenticationSession or WK rendering. The two failed cases stop before target result/ACK and final database assertions, so the receipt's broad boundary text describes intended test coverage, not completed observations. The existing r35 clock P1 is not retested or closed by these target tests.
