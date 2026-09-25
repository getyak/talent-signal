# Independent review of parent R4/R5 PostgreSQL counterexamples

**Conclusion: both counterexamples are valid against frozen `f4143338685f305a237a450c59a44964dc083122`.** The final five-case receipt records two successful controls and three failed safety assertions, not setup failures: one deadline case and both cancellation modes. This upgrades R4/R5 from source-only findings to controlled dynamic evidence. It does not prove live OAuth or browser/native behavior.

Reviewed without executing the harness or modifying product source:

- `/private/tmp/ai-test-account-sync.umqxBi/parent-macos-manual/parent-desktop-deadline-cancel-pg-proof.mts`
- `/private/tmp/ai-test-account-sync.umqxBi/parent-macos-manual/parent-desktop-deadline-cancel-pg-receipt.json`
- Referenced frozen production consumers in `/Users/cubxxw/.codex/worktrees/account-sync-backend-proof-r22/talent-signal`.

The final receipt was executed at `2026-09-25T02:42:43.538Z`. Its five source hashes are equal before/after and independently match the current immutable files. This report was updated after reading the parent's corrected final harness and five-case rerun; the original r22 report remains unchanged.

## R4 — Delayed current-proof redemption

The harness runs production desktop prepare/authorize/approve/complete/consume through the registered Fastify routes. Apple verification is injected; challenge, nonce/assertion consumption, identity, session, credential creation and password completion remain production code with real PostgreSQL.

At script lines172–180, the synthetic stored authority represents a current proof approved 240 seconds earlier, with 60 seconds remaining on its original five-minute deadline and 360 seconds remaining on the ten-minute flow. Production consume then creates the credential grant. The final receipt shows its expiry exceeds `approved_at + 300 seconds` by **240004ms**. This directly exercises the renewal at frozen `desktopAuth.ts:1024–1028`.

Lines183–200 move the relevant desktop timestamps and the credential row's timestamps back another 90 seconds, then invoke the real auth guard and production `completeCredentialChange`. At this point the modelled original proof is about330 seconds old, its deadline is about30 seconds past, and the incorrectly renewed credential still has about210 seconds left. Readback confirms:

- `original_proof_expired:true`
- `credential_still_valid:true`
- production completion returns `password_set`
- a password row is stored and the grant is consumed.

This is a valid logical-time fixture for the disputed deadline. It does not replace production authorization with a mock or forge a credential row. The success is not explained by an expired session, wrong origin or a different account: the real guard and credential consumer check those independently.

**Time-fixture wording limit:** the script/receipt says “all authority times” were translated, but only the specified desktop and credential timestamps move. Session timestamps, already-consumed provider challenge/assertion timestamps, and some lifecycle timestamps do not. That does not create this false acceptance on the frozen source: those omitted fields do not reauthorize the pending password grant and the session remains live either way. Describe this as a translation of the **relevant stored deadline fields**, not a complete physical-clock simulation. The short code remains fresh, which represents issuing it after the four-minute wait; it is not proof that a previously issued one-minute code survives a four-minute real wait.

## R5 — WK/system target cancellation

Script lines212–230 perform real current consume → result → ack → target prepare/authorize, verify the bound Google challenge is still unused, then invoke the actual cancel route. WK cancellation presents pairing with the original token; system cancellation presents state without that token. Each returns `cancelled`.

Both receipts then show target prepare still returns200, and production ordinary credential completion accepts the **same original grant and secret**. Before/after identity inventory changes from `[apple]` to `[apple, google]`, and the original credential grant is consumed. This is stronger evidence than merely observing a still-valid expiry.

The extra target prepare at line234 does not manufacture the result: frozen prepare only reads/locks that existing grant (`desktopAuth.ts:480–500`) and does not renew or reopen it. Thus it cannot explain away the subsequent ordinary completion as an explicitly reauthorized operation. It is a second manifestation of the surviving cancelled grant.

**Controlled boundary:** ordinary completion is the production `completeCredentialChange` function, preceded by the production `createAuthGuard`, not an injected request to `/v1/account/login-methods/complete`. Its explicit `requestOrigin:null` follows the supported native/server request case; the production function derives and checks `client:talent-signal-desktop` from the stored attempt. Only Google cryptographic verification is injected. The returned identity uses the target's actual nonce; production challenge/label/single-use assertion checks still run (`googleAuth.ts:85–93`). The injected verifier is not proof of JWT signatures, provider consent, Apple/Google UI or live OAuth.

## Final harness corrections and controls verified

1. **Preparation-time flake fixed:** line167 now derives the exact600-second flow deadline from `Date.parse(extra.original_proof_at)`, removing the extra `Date.now()` tick that could make setup exceed the backend limit.
2. **Fresh password positive control passes:** lines118–133 use the same real current-proof and ordinary completion consumers. The final receipt records `password_set` and a stored password. This proves the completion path works with a fresh proof; it does not test a subsequent password login.
3. **Uncancelled target positive control passes:** lines135–161 use current/result/ack → target authorize → the same production ordinary completion with controlled Google verification. Final provider inventory is exactly `[apple, google]`. The cancellation failures cannot be attributed to a generally unusable completion path.
4. **Rejection predicates tightened:** line205 requires409/410 with `CREDENTIAL_ATTEMPT_INVALID`/`CREDENTIAL_ATTEMPT_EXPIRED`; line253 requires409/410 for retry and completion plus an explicit invalid/cancelled/expired credential code. An arbitrary500 no longer passes the safety assertions. Current failing cases still reach actual successful writes, so none depends on error categorization.

Optional receipt refinements remain: assert initial password absence explicitly, check the retry's specific error code as well as its status, and record the original cutoff immediately before completion. For a fully chronological time fixture, issue the code after ageing the approved record and shift lifecycle timestamps consistently. These do not invalidate the final counterexamples or the added positive controls.

Required broader acceptance remains outside this sequential harness: deterministic cancel-first/consume-first lock races, preservation of a newer/unrelated grant, and truthful recovery after an already committed result. The present evidence does not establish those concurrent outcomes.

## Hash binding

| Input | SHA256 |
| --- | --- |
| Harness | `bb0e49102cd6ab1c98ce4d396c2de30a40a49dbc0c1f9f4532f0df20c9031909` |
| Receipt | `5baaf1201cd1521b2e5375538abf30c76d4ff16020231ca1e008e58f0939deb0` |
| `apps/backend/src/modules/desktopAuth.ts` | `7348cc54ae7a7949890c9a4e6c26a5bbe11d2f94fd329157d5435a550608cc19` |
| `apps/backend/src/modules/auth.ts` | `196ccaf8a1c8d356e8b4715dd3c0125451cdf02180ba575a173dca0d96d8761c` |
| `apps/backend/src/modules/accountIdentity.ts` | `cccd8c7d84cd7b5b226bf981a2f62b523fce13c4cb9705f263df964ac4ad0645` |
| `apps/backend/src/modules/accountLoginMethods.ts` | `8aa9f7b1d2b8b88264bbacbe415acc7c0f24f71c63d064ee826863173d495f06` |
| `packages/contracts/src/desktopAuthSchemas.ts` | `f461e1ae1afe5aa31bd2c1f719d8750f3dda101f51b5041c72e8fe622200f206` |

No test/database/provider operation was executed during this independent review; no source or r22 report was edited.
