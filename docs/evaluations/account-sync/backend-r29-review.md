# Backend r29 independent review

**Verdict: two P1 recovery defects remain.** No P0 or new account-takeover path was confirmed. The r26 lock inversions and ordinary-completion result selection are repaired in the inspected backend, but final target acknowledgment and anonymous login recovery are not complete. This is a backend/contracts review only; it does not approve the moving Web/native implementation.

## Frozen source and method

- Snapshot: `/Users/cubxxw/.codex/worktrees/account-sync-relay-proof-r29/talent-signal`, clean commit `625e3b36ba51940252104bd0c1a1810a8d5b9450`.
- Comparison: r26 `854f47beec6e930e8cbfb380551abe530d156a86`. Only `desktopAuth.ts` and its integration test changed within backend/contracts.
- Independently checked all **450 backend/contracts files** against the 1,224-file relay manifest: no mismatch. Manifest SHA256: `d23c96bae288e0f552293f0683b808c61160ce5f4914f20c7814f6ecb9d89fb4`.
- Read-only source and parent harness/receipt review. I did not execute a database, tests, provider, browser or native app. The parent reports fresh migration/typecheck and 76/76 repository tests passing; independent PG evidence below is parent-executed and source-bound.

All source references below are relative to the frozen snapshot.

| Source | SHA256 |
| --- | --- |
| `apps/backend/src/modules/desktopAuth.ts` | `b4afacb4ac493d84f7f577769d060e6b405f5cbda6d6d8becb7f0170170ada12` |
| `apps/backend/src/modules/desktopAuth.integration.test.ts` | `019bc36a3dddfb41c6d28dd036f4c1a80b8c3cf8ed9693bdcd70af22f6e67329` |
| `apps/backend/src/modules/accountLoginMethods.ts` | `8aa9f7b1d2b8b88264bbacbe415acc7c0f24f71c63d064ee826863173d495f06` |
| `apps/backend/src/database/085_desktop_auth_attempts.sql` | `08ece35735de887f3608e02a352bb6b025a3d19dceb481834adf36a322683413` |
| `packages/contracts/src/desktopAuthSchemas.ts` | `f461e1ae1afe5aa31bd2c1f719d8750f3dda101f51b5041c72e8fe622200f206` |

## P1 findings

### R29-1: a proven ordinary target commit cannot finish its desktop ACK

**Confirmed by source and two actual PG counterexamples.** `desktopAuth.ts:1592–1597` requires `D.status === consumed` before checking the shared committed fact. Ordinary completion consumes G and writes its matching audit without changing D. Even cancellation's recovered-success branch only writes `result`/`result_committed_at` (`1816–1822`), leaving target D `authorizing`.

Sequence: real current proof → consume → current ACK → target prepare/authorize → production ordinary provider completion → WK or system cancel → paired result → paired target ACK. Both cancel modes truthfully return `consumed`; result returns `committed` with `link_provider/linked` and correct Settings actor. ACK nevertheless returns HTTP 200, `acknowledged:false,status:unknown`. The grant, one matching audit and exactly one revision increment are already durable. This prevents the protocol's final verified ACK/cleanup; it is not a duplicate mutation or an account takeover.

Fix: verify origin, pairing/verifier, exact requested G and original live actor first. A matching committed fact may authorize acknowledgment of its associated D even if the ordinary consumer never marked D consumed. Keep the existing consumed-state, unchanged revisions/fingerprint and original deadlines for **pending** acknowledgment. Do not let ordinary completion lock other D rows, invent a new mutation, or promote a pending grant to success. Test direct result→ACK as well as cancel→result→ACK, both roles/authorities, repeated ACK and wrong actor/grant.

Evidence: `r29/parent-desktop-ordinary-committed-ack-pg-proof.mts`, receipt at `2026-09-25T03:45:21.410Z`: set/change-password positives 2/2, target ACK negatives 0/2. Scope, exact result, audit and revision assertions pass before the failing ACK assertion.

### R29-2: the credential pending guard rejects every anonymous pending login

**Confirmed by source and an actual PG counterexample.** `desktopAuth.ts:1505–1508` now calls `assertPendingAuthority` for every non-consumed purpose. Its `1369` call to `initiatingIdentity` unconditionally queries account/user/session; an anonymous login has NULL bindings (`370–384`, `568–580`). It therefore throws `401 SESSION_INVALID` at `280–281`, although correct pairing and verifier have passed. The previous login bypass in `authorizePairedCaller:1347` no longer prevents this new guard.

Sequence: anonymous public login prepare→authorize→approve/code → paired result before consume. Result returns 401; consuming that **same attempt** immediately succeeds as `logged_in`, proving the fixture/authority was valid. The authenticated-login positive returns `200 pending` and consumes successfully. Do not generalize this failure to all authenticated logins.

Fix: distinguish login pending authority from credential continuation authority. Preserve login's pairing/verifier, origin, applicable initiating-scope rules and absolute expiry without requiring a nonexistent anonymous actor. Never skip the original actor/revision checks for credential rounds. Add anonymous prepared/authorizing/approved pending reads, expiry/wrong-pair negatives, and same-attempt successful consume controls.

Evidence: `r29/parent-desktop-pending-login-pg-proof.mts`, receipt at `2026-09-25T03:48:16.936Z`: anonymous fails; authenticated control passes. The copied top-level receipt boundary mentions revocation/admission pauses; this two-case script does **not** exercise them. Only its narrower per-case boundary is relied on here.

## r26 closure and lock analysis

Let D be the route's own desktop row, G an existing credential grant, A/U/S the initiating account/user/session and P provider-proof rows.

| Consumer | r29 ordering / evidence |
| --- | --- |
| Target prepare | G `510` → A/U/S `529` → new D `588`. Current-ACK lookup `543–549` is a plain read. Parent forced prepare/consume probe passes with both first locks G, zero DB errors, one audit/revision increment. |
| Target consume / ordinary completion | D→G→A/U/S, or G→A/U/S→P for ordinary (`accountLoginMethods.ts:790–838`). Parent replay/consume probe gives exact `409 APPLE_CHALLENGE_INVALID` plus one completed desktop commit, not a 503/40P01. |
| Approve | D→existing G for target `789–792` → A/U/S `794–795` → P `797`. Current has no existing G. Parent's forced target approve/ordinary collision now passes both first-winner orders: real G admission, exact replay rejection, zero DB errors, one final committed audit/revision increment. |
| Authorize / issue code | Own D then account-share before proof writes (`673–679`); code issuance writes only own D. Expiry branches terminate without subsequently taking G. |
| Cancel | D→G `1811` before any D write/retirement-trigger A SHARE (`085:132–133`). It does not lock another D behind G. Parent forced WK/system × cancel-first/consume-first probe passes 4/4. |
| Result / ACK | Own D→live A/U/S, then **plain MVCC** G/audit reads (`1405–1428`), not G locks behind A. No new inverse was found. |
| Current consume | A/U/S then creates its new, unpublished G; its subsequent G lock is not a lock on another consumer's existing grant. |

F2 is closed for ordinary first/change-password result and ACK: the exact consumed G plus audit is found before pending revisions are enforced (`1483–1491`, `1607–1620`). Thus the mutation's own revision does not invalidate its receipt. Exact original live actor remains required (`1347–1357`); anonymous/foreign/revoked pending consumers return precise `DESKTOP_AUTH_FINGERPRINT_CHANGED` in the parent regression.

F3 truthful result/cancel is closed for ordinary target completion; **final ACK remains R29-1**. Open-target cancellation still atomically expires only its G, rejects ordinary completion before provider verification, and cannot manufacture a credential commit. Original proof deadline tests show zero extension and exact domain rejection after expiry. Unverified Apple hints remain unclaimed; admitted-then-revoked login cannot mint a new session.

## P2 completeness / regression-test gaps

1. **The committed-fact discriminator is weaker than its documented contract.** `1432–1440` verifies audit kind equals G intent, but not G intent equals frozen D intent, nor a valid intent/outcome pair; any string outcome qualifies. Target prepare checks G intent is link (`521`) without requiring the request's frozen intent to agree. Also, cancel ignores `consistent:false` from `readCommittedEffect` (`1816–1832`), so consumed-with-missing/mismatched audit can fall through to a claimed cancellation. Tighten frozen-intent/target and permitted outcome agreement; inconsistent history must be unknown or a precise refusal. These are source-only invariant gaps, not a demonstrated normal-transaction corruption or cross-account exploit. Ordinary successful production writes currently commit G/audit together (`accountLoginMethods.ts:855–894`).
2. **Repository test names overstate concurrent coverage.** The test at `desktopAuth.integration.test.ts:2104` says “prepare and cancel,” but never calls cancel (`2169–2179`). It omits current ACK, accepts either 200 or arbitrary 409, and uses a 300 ms delay without proving the waiting request actually reached G. The test at `1947` also uses a timing barrier. Replace with instrumented actual lock admission and exact expected success/domain outcomes. Parent probes now supply prepare/consume, all four cancel/consume outcomes and both approve/ordinary winners; port these assertions into repository regressions. The independent coverage gap is closed for these specified schedules, while the repository-test omission remains. F3's repo test (`2428–2542`) stops at result and omitted the target ACK that exposes R29-1.

## Dynamic evidence ledger

All entries are under `/private/tmp/ai-test-account-sync.umqxBi/parent-macos-manual/r29/`, use synthetic accounts and isolated real PostgreSQL, and report unchanged source hashes. Public desktop route consumers are real; ordinary completion is the production helper with real auth context/guard. External provider verification is controlled: none establishes live OAuth, browser, WK cookie or native lifecycle behavior.

Original six receipts: **15/15 pass**. Extensions: cancel/consume **4/4 pass**; approve/ordinary **2/2 pass**; committed ACK **2/4 pass**; pending login **1/2 pass**. Do not summarize these as a complete backend acceptance pass.

The approve/ordinary extension (`2026-09-25T03:55:27.289Z`) pauses the first consumer only after its actual matching G query returns, launches the second consumer and observes its G request before release. It records both eventually acquiring G. Approve-first returns `approved`, ordinary loses with exact `409 APPLE_CHALLENGE_INVALID`, G/audit remain uncommitted until subsequent real desktop code/consume succeeds. Ordinary-first commits `already_linked`, and public approve loses with that same exact challenge error. Both final states require G consumed, exactly one audit with matching account/actor/intent and `already_linked` outcome, and revision +1; database errors, 503 and arbitrary 4xx cannot pass. This is the valid same-Apple-subject idempotent fixture, not two independent fresh provider assertions or new-provider UI proof. The archived `before-idempotent-fixture-approve-ordinary-receipt.json` failure expected `linked` instead of the fixture's correct `already_linked`; it is a harness expectation error, excluded from product findings. No product-source change accompanied that correction.

| Receipt | SHA256 |
| --- | --- |
| `parent-desktop-login-pg-receipt.json` | `9d3e1d2a49051ad34b4439c849244b9a3960fd332826cd7ce7e24e4a357102eb` |
| `parent-desktop-credential-pg-receipt.json` | `5923eb9b9dc4d3b78e94c95877b2cb66637df613e0d2b55733c1aee3e652f4b5` |
| `parent-desktop-deadline-cancel-pg-receipt.json` | `ce1a7a38758afc445257842547e4e038599d848d885c56c077c4079bb5bfcef6` |
| `parent-desktop-lock-pg-receipt.json` | `41473a2575f1f5d1d76640899a4f3a211fbc1abf6ecc312c9f9b86a8ea56ac76` |
| `parent-desktop-prepare-consume-lock-receipt.json` | `ab5b9220d93dd2747f2de8ecfd20d8f889d24918be24a526ac75af39e3d0cdcf` |
| `parent-desktop-ordinary-receipt-pg-receipt.json` | `ad32d9f3de06630c3318e8c519013127476641b112f6de995634d1271cd74074` |
| `parent-desktop-cancel-consume-lock-receipt.json` | `08f2ee0b1aac15542f64a685789f87394112024196c6b153a7ea01a551cc0884` |
| `parent-desktop-approve-ordinary-lock-receipt.json` | `56868dd5eb83776a54fbc523c599ef6c55e21e23bb58e176eb0201fd61d2690a` |
| `parent-desktop-ordinary-committed-ack-pg-receipt.json` | `2ae033ca6167561d0c3fdb5abab1e541e1b145f88db8cfc236511ab6fcb7e247` |
| `parent-desktop-pending-login-pg-receipt.json` | `6d58876d6b01d81143b99a72738c74dce708dd974b82acb04f6b1f6939a08821` |

Extended proof script SHA256s: committed ACK `c3062404e413860dea381a1d04597988dffa4fd2383e3fde452058a2723dc75d`; pending login `3e984c5d9c63e521742521a6f2a63c3bb0c9daf494a00407a9ca1a89da927950`; cancel/consume `10ea42ef33df1ea8ee3d4da850ecdbe50d937b67389e69a920c2c628d98697dc`; approve/ordinary `3a509cdd2844a56dc204bccd60769ac088d1ec117abe113c974643ab5c204bc6`.

Final Pi/integrated hashes must match these sources before any closure carries forward. The old r26 report is untouched.
