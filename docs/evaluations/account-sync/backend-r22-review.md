# Backend desktop-auth review — immutable r22

**Decision: not ready; five P1 findings remain.** Three have parent-owned public-route/PostgreSQL counterexamples; two are confirmed source paths with concrete regression sequences specified below. No P0 found. This is a backend/contracts review, not approval of moving Web/native code or live OAuth.

## Source and evidence boundary

- Reviewed repository: `/Users/cubxxw/.codex/worktrees/account-sync-backend-proof-r22/talent-signal`.
- Commit: `f4143338685f305a237a450c59a44964dc083122`; baseline: `25435d5f8f412fdd25eddecb4991fce3319ef317`.
- Independently checked all **451/451** files against `/private/tmp/ai-test-account-sync.umqxBi/macos-pi/backend-r22-snapshot.json`; no differences; Git status clean.
- Design: parent ADR0020, `/Users/cubxxw/data/talent-signal-account-sync/docs/decisions/0020-macos-credential-proof-rounds.md`, SHA256 `74fe3b86d1941c83ce15054c84652ed9664dd62d768c471d81dd255873d3306f`; also read parent-repair1/2 and the r18 review.
- I inspected production source and tests; I did not execute databases, providers or native UI. Parent executed the independent receipts below against this exact snapshot; I read their results and matched their source hashes. Parent reports the existing snapshot suite passes 61/61, which does not cover the counterexamples.
- These findings/closures apply to the immutable snapshot only. Compare final Pi hashes before carrying them forward.

All implementation paths below are relative to the reviewed repository.

## P1-R1 — Result and acknowledgment bypass the original live actor/session

**Locations:** `apps/backend/src/modules/desktopAuth.ts:1186–1200`, `1202–1249`, `1282–1306`; public routes at `1629–1644`.

`readDesktopAuthResult` checks origin, pairing and verifier but never checks `caller.authFingerprint`, the frozen account/user/session, current revisions or credential fingerprint. An open recovered credential attempt is returned, including its original `attempt_secret`, even to an anonymous caller or another account. The committed branch can combine A's operation receipt with B's current Settings. `ackDesktopAuthResult` likewise accepts pairing/verifier/credential ID without caller identity or pending grant freshness, and persists `acknowledged_at`.

**Dynamically reproduced by parent:** `/private/tmp/ai-test-account-sync.umqxBi/parent-macos-manual/parent-desktop-credential-pg-receipt.json`, case “Pending credential result and acknowledgment require the original live session”. A real current round produces a grant. Original-session positive control passes. Repeating the same result request anonymously, as another account, and after production revocation of the original session returns HTTP200 `pending_continuation` with the same original secret. Anonymous/other-account ack returns HTTP200 `acknowledged:true`.

This is a broken continuation/ack authority boundary. It is **not** proof that another account can commit A's credential: normal completion still checks the original session. It nevertheless exports A's grant outside its authorized scope and can falsely tell the host it may discard recovery authority.

**Required fix/test:** Under consistent transaction locks, require the exact live original account/user/session/fingerprint for result and ack. Pending continuations also require original revisions, credential state and absolute deadlines. Completed receipts must tolerate their **own** revision change while retaining original actor/session authorization. Test same-account sibling session, account switch, anonymous, revoked session, stale revisions/expired grant, and committed receipt readback after its own mutation.

## P1-R2 — Provider-proven password removal cannot enter or complete

**Locations:** `apps/backend/src/modules/desktopAuth.ts:437–442`, `1057–1059`; `apps/backend/src/modules/accountLoginMethods.ts:708–709`.

Prepare restricts both `link_provider` and `unlink_provider` targets to Apple/Google. The existing supported operation `unlink_provider/password` therefore fails with HTTP400. A second independent error would remain after removing that rejection: current redemption maps every password target to `provider:null`, whereas `completeUnlink` requires `provider:"password"`. The null mapping is appropriate only for set/change-password intents.

**Dynamically reproduced by parent:** credential receipt case “Provider current proof can unlink the password while retaining its Apple method”, at the real public prepare route: HTTP400 `DESKTOP_AUTH_REQUEST_INVALID` with the existing password/provider intact.

**Required fix/test:** Validate provider by intent; preserve `password` for unlink. Exercise actual prepare → current approve → consume with a linked Apple/Google subject and a password, assert password removal, provider retention and one audit/result. Keep provider/password last-method and concurrent-removal regressions. The present integration unlink test (`desktopAuth.integration.test.ts:731–765`) removes Apple only.

## P1-R3 — Password-first phase-one grants cannot use the desktop target consumer

**Locations:** `apps/backend/src/modules/desktopAuth.ts:1134–1138`; `apps/backend/src/modules/accountLoginMethods.ts:927–936` (origin equality); phase-one public route `apps/backend/src/modules/accountManagementRoutes.ts:32–40,81–87`.

Target redemption unconditionally passes `requestOrigin:"client:talent-signal-desktop"`. Phase-one password step-up preserves its own origin: the frozen base Web helper uses `client_label:"talent-signal-web"` and a normal `TalentSignalClient` without an Origin header, resulting in `client:talent-signal-web`; a public browser-origin request instead stores that actual allowed Origin. Both valid grant kinds are rejected by the hardcoded desktop comparison. Only relay-created grants use the hardcoded value and pass current tests.

**Dynamically reproduced by parent:** credential receipt case “A password-first Web credential attempt continues through desktop target proof”: the real password start returns a grant with `originalOrigin:"client:talent-signal-web"`; desktop target approve succeeds but consume returns HTTP409 `CREDENTIAL_ATTEMPT_INVALID`, leaving the grant unconsumed. The test uses a valid same-subject Apple reassertion after password proof; it proves this backend compatibility failure, not a visible new-provider button or live-provider flow.

**Required fix/test:** Preserve and validate the existing grant's actual origin/client context through prepare and target commit, without deleting the origin check or substituting arbitrary request JSON. Add password-first actual start → desktop target → commit for both allowed context shapes. This report does not assert which helper the still-moving Web implementation currently selects.

## P1-R4 — Current-proof redemption renews its authorization deadline

**Locations:** `apps/backend/src/modules/desktopAuth.ts:749–754` (approval time), `1024–1028` (new expiry); migration085 retains `original_proof_at`/`approved_at` but no later deadline enforcement uses them.

The credential expiry is `min(Date.now()+300s, flow_deadline_at)`. It is not capped by the provider proof's original verification deadline. Approve promptly, wait almost the desktop attempt's five minutes, issue a fresh code, then consume: redemption grants almost another five minutes if the original ten-minute flow still permits it. The phase-one completion only checks the newly written `expires_at`, so the expired original proof remains usable. This contradicts ADR0020 lines80–84: proof ≤300 seconds and no renewed proof deadline on return/target continuation.

**Source-confirmed; no dynamic result claimed.** A deterministic regression can backdate the synthetic approved proof/initial timestamps while retaining a still-valid desktop attempt and fresh code, then consume through the public route. Assert the new credential expiry is no later than the original approved-proof deadline (and all applicable earlier deadlines), not consume time +300 seconds. Attempt actual password or target completion after that original cutoff and assert no mutation. Preserve the original verified timestamp across result read and target start; do not trust a newer timestamp supplied by the client.

## P1-R5 — Cancelling an uncommitted target leaves its credential grant usable

**Location:** `apps/backend/src/modules/desktopAuth.ts:1477–1486`; ordinary completion `apps/backend/src/modules/accountLoginMethods.ts:790–835`.

Cancellation changes only `desktop_auth_attempts.status`. It does not invalidate that target's open `credential_change_attempts` record. Reproduction path: current proof produces a link grant; prepare/authorize its target; cancel that target **before approve consumes the provider challenge**. The original secret and unconsumed challenge remain valid. The ordinary phase-one completion can still use them and a valid provider assertion to commit the cancelled operation; that consumer never checks the cancelled desktop record. Another desktop target can also be prepared for the still-open grant. This is specifically the unused-grant revocation required by ADR0020 lines119–122, not a request to undo a committed link.

**Source-confirmed; no dynamic result claimed.** Regress with real current grant → target authorize → system/WK cancel → ordinary completion using the exact original grant/challenge. Both cancellation modes must make unused grant redemption fail. Race cancel against consume under the same lock order: cancel-first revokes only that unused operation; consume-first returns truthful `consumed`/committed result and never relabels or reverses it. Preserve unrelated/newer grants and result history.

## Separate integration/coverage limits — not account-takeover findings

- **Current ack → target gate:** target prepare (`desktopAuth.ts:464–500`) checks a credential grant but never reads the originating current round's `acknowledged_at` or matches its stored flow reference. The existing current→target test at `desktopAuth.integration.test.ts:649–729` starts target without ack and expects success. The backend alone therefore does not enforce ADR0020's ordering. Check the final Web/native consumer before assigning the whole-stack defect: it may enforce the gate there. Add a real end-to-end pre-ack rejection/post-ack acceptance test; do not cite the existing test as proof of the complete ack choreography.
- **First-password completion omitted:** the “provider-only first password” test (`560–646`) stops at awaiting_password/result/ack; it never calls the actual password completion. Add that consumer and verify the password works with unchanged canonical IDs and original session.
- **Lock order deserves an explicit collision test:** desktop target takes account/user/session locks before the credential row; normal completion takes the credential row before account locks (`accountLoginMethods.ts:790–814`). Existing locks protect stale authority, but a same-grant concurrent ordinary/desktop completion can form opposite waits. Current concurrency test pauses via an alias advisory lock and uses fixed sleeps (`desktopAuth.integration.test.ts:1087–1117`); it does not cover this collision. No privilege escalation or data loss is established from this possible deadlock.
- **Public schema attachment:** the new TypeBox request schemas are exported, but `registerDesktopAuth` does not attach them to Fastify routes. Malformed/unsupported bodies are consequently handled by ad hoc checks/SQL/runtime failures rather than the declared contract. Include invalid discriminator/extra-field/body tests when wiring schemas; this review does not classify it as an independent P1.

## Previous backend findings closed in this snapshot

- **Unverified Apple email promotion:** closed at `desktopAuth.ts:1407–1423`. Existing-subject login claims only actually verified email and catches only `EmailClaimConflict`. Parent's `/private/tmp/ai-test-account-sync.umqxBi/parent-macos-manual/parent-desktop-login-pg-receipt.json` proves same canonical identity, no unverified alias reservation, independent verified ownership still possible, and replay rejection.
- **Authenticated login revoke-after-admission:** closed at `desktopAuth.ts:941–955` and `244–281`. Parent's same receipt runs the actual public route, gates after its real live-session read, commits production `revokeCurrentSession`, then observes HTTP401 `SESSION_INVALID`, unchanged session count and unconsumed attempt. A same-token authenticated positive control succeeds first.
- **Credential stale-write window:** account/user/session `FOR UPDATE` locks now surround credential snapshot check and commit (`244–281,955–965`); existing writer-first/consume-first tests cover their stated cases. This closure does not extend to the unguarded result/ack paths in R1 or the opposite lock-order test gap above.
- **Random pairing/HKDF:** prepare generates independent random32-byte pairing (`526–550`); only its hash persists. Authorize does not return it. Derived relay grant secret uses HKDF with random pairing plus immutable IDs (`134–160`), not database configuration. Configuration hashing is only an environment comparator.
- **Separate system cancel authority:** backend now discriminates WK pairing from system state (`1467–1474`) and reports consumed truthfully. R5 concerns revocation of the unused credential grant, not a copied pairing secret.
- **Single-use provider evidence:** approve calls the shared challenge/assertion consumer exactly once (`719–730`), current requires the linked subject (`731–747`), and commit uses the staged internal proof rather than consuming the raw provider assertion twice. Wrong email-matching subject is tested.
- **Schema/retirement inventory:** migration085 registers the new account table and both Lab/retirement triggers; inventory classifies its user-bound identity rows and checks foreign scope. No additional P0/P1 found in this bounded migration/inventory diff.
- **Anonymous status client:** `packages/contracts/src/client.ts:394–406` now explicitly uses `authenticated:false`. This closes the narrow client transport omission; current callback/rendered Web behavior is outside this snapshot review.

## Source hashes

| File | SHA256 |
| --- | --- |
| `apps/backend/src/modules/desktopAuth.ts` | `7348cc54ae7a7949890c9a4e6c26a5bbe11d2f94fd329157d5435a550608cc19` |
| `apps/backend/src/modules/accountLoginMethods.ts` | `8aa9f7b1d2b8b88264bbacbe415acc7c0f24f71c63d064ee826863173d495f06` |
| `apps/backend/src/modules/accountManagementRoutes.ts` | `a8448701319d39bfed02df662f4e278c35711e76609b6e4360d81b8b097ae4ac` |
| `apps/backend/src/modules/accountIdentity.ts` | `cccd8c7d84cd7b5b226bf981a2f62b523fce13c4cb9705f263df964ac4ad0645` |
| `apps/backend/src/database/085_desktop_auth_attempts.sql` | `ab3ffe87faa5fd9f3f87e9f23bd88735b43f699f23f15fad32c8e9a7528ec117` |
| `apps/backend/src/modules/desktopAuth.integration.test.ts` | `6b06d243b4f9e01bf368752c87ec91a9ca2db5b640b7aea8765886e781c5bcbf` |
| `apps/backend/src/modules/desktopAuth.test.ts` | `deb5e31620f4cf6f6d7efd327f271faa4a84ede27c7f80c440c73b916fc37173` |
| `packages/contracts/src/client.ts` | `897f6ac38408e35b79b1f8d7e569f0fbf7a08dd98a79ab37446c98435eb53922` |
| `packages/contracts/src/desktopAuthSchemas.ts` | `f461e1ae1afe5aa31bd2c1f719d8750f3dda101f51b5041c72e8fe622200f206` |

Full manifest and parent receipts preserve the remaining source hashes. No product source was modified by this review.
