# Backend r33 independent review

**Final bounded verdict: B1 and B2 are dynamically closed, and B3's requested guards are present with executed repository regressions. No remaining or newly introduced P0/P1 was identified in this backend/contracts delta.** Independently inspected parent evidence contains **27/27 passing PostgreSQL cases across ten scripts**, with stable source hashes; the repository integration log records **81/81 tests, no skips**. This is a frozen mid-repair backend/contracts assessment, not Pi readiness, integrated Web/native approval or live-provider acceptance.

## Source binding

- Read-only snapshot: `/Users/cubxxw/.codex/worktrees/account-sync-backend-proof-r33/talent-signal`, clean commit `78c2a85fb318ae8833ce6999318f30c1065af7d7`.
- Comparison: r29 `625e3b36ba51940252104bd0c1a1810a8d5b9450`, restricted to backend/contracts. Only `desktopAuth.ts`, its integration test and `desktopAuthSchemas.ts` changed there. Other snapshot-baseline differences are outside this review.
- All **451 manifest files** match `/private/tmp/ai-test-account-sync.umqxBi/macos-pi/backend-r33-snapshot.json`, captured `2026-09-25T04:29:40.729053+00:00`; manifest SHA256 `bccef1f7f3051924e383b44c342ee0559933ee604bdd4f82e4eb6662c926e74f`.
- No source, database, provider, runtime or old receipt was changed or executed by this reviewer. Only this report is owned here.

| Source | SHA256 |
| --- | --- |
| `apps/backend/src/modules/desktopAuth.ts` | `9f4e703ef65de863c464cf12ae7c7b697d5a918c31df7624b79ccc971c2d126a` |
| `apps/backend/src/modules/desktopAuth.integration.test.ts` | `945957c152ffd71ecb74b95062ff188b1d2b56bd55e33b528000568384784737` |
| `apps/backend/src/modules/accountLoginMethods.ts` (unchanged) | `8aa9f7b1d2b8b88264bbacbe415acc7c0f24f71c63d064ee826863173d495f06` |
| `packages/contracts/src/desktopAuthSchemas.ts` | `c46ed8116dbceb6776fe280020ef8662362c4b5d0ba0c76f739422d0984c01c7` |

## B1 — ordinary target commit can finish ACK

**Source and independent dynamic evidence closed.** `desktopAuth.ts:1622–1637` validates exact pairing, verifier, requested grant and original live actor before reading the committed fact. A desktop row need not have been consumed by the desktop consumer when its associated grant was already committed by the ordinary consumer. Pending ACK still requires `D.status === consumed` and unchanged original pending authority (`1647–1659`). Only a verified committed effect bypasses those pending conditions.

The recovered cache write (`1660–1668`) touches only this route's already-locked D. Repeated ACK uses `COALESCE` for the timestamp and does not re-run the credential mutation. Original account/user/session/fingerprint checks and live session locking remain at `1345–1360`. The new tests exercise direct ordinary commit→result→ACK, repeated ACK, wrong grant/actor, and cancel→result→ACK (`2663–2817`).

The final `parent-desktop-ordinary-committed-ack-pg-receipt.json` passes all four cases. Both previously failing target schedules now execute ordinary link→WK/system cancel (`consumed`)→result (`committed`)→target ACK (`200`, `acknowledged:true`, `status:committed`), while D remains `authorizing`. Each has the exact consumed grant, one `link_provider` audit and only one revision increment. Its set/change-password controls also complete result+ACK successfully. This closes the actual r29 B1 failures, rather than inferring closure from a status-only unit test.

## B2 — anonymous pending login

**Source and independent dynamic evidence closed.** `1376–1379` skips only the nonexistent initiating actor for a login without a session; it still applies expiry. Result has already validated fixed origin, pairing and verifier before reaching this branch. Credential rounds cannot take this bypass and retain exact live actor, revision and credential fingerprint (`1381–1392`). Authenticated login still checks its live initiating identity; credential revision comparisons now apply specifically to credential rounds, consistent with the existing login consume behavior.

The added production-route test reads anonymous prepared/approved/code-issued stages and successfully consumes that same attempt, with wrong-pairing and expiry negatives (`2819–2875`). It does not justify a blanket relaxation of credential-result authorization.

The final `parent-desktop-pending-login-pg-receipt.json` passes the previously failing anonymous approved-login read (`200 pending`) followed by the same attempt's real successful consume (`200 logged_in`), with an authenticated positive control and preserved canonical account. This dynamically closes r29 B2 at the approved stage. It does not prove every intermediate state or revocation scheduling; those claims are explicitly excluded by this receipt's boundary. Separate login and credential receipts retain exact revocation/actor negatives.

## B3 — exact fact and inconsistent history

**Source-level closed for the reported gaps.** Target prepare now rejects a request intent that differs from its existing link grant (`520–525`). Shared fact resolution checks frozen D intent against G intent (`1433–1434`), exact audit account/actor/kind and G account/user/session, and an explicit valid intent/outcome map (`1448–1465`). Invented outcome strings no longer count as committed.

Both cancellation authorities check `consistent:false` under G's lock and refuse with exact `409 DESKTOP_AUTH_RESULT_UNCONFIRMED` (`1858–1887`), without relabelling the row cancelled. Result/ACK continue to return unknown for an inconsistent uncached fact. The test creates a real ordinary commit, then synthetically corrupts its audit outcome to verify both cancellation refusals and ACK rejection (`2878–2925`); this is an integrity test, not evidence normal production transactions create corrupt audit rows. Previously verified cached completion remains the existing trusted immutable receipt path; arbitrary subsequent administrative corruption is outside this repair's claim.

## Lock order, deadlines and contract compatibility

No r29 lock-order fix was reversed. Existing-grant target prepare remains G→A/U/S→new D; approve is own D→G→A/U/S→provider proof; target consume is own D→G→A/U/S; ordinary completion remains G→A/U/S→proof. Cancellation locks G before writing D and taking its retirement-trigger account lock. Result/ACK still acquire their own D and live actor locks, then use **plain MVCC** reads of G/audit; the new ACK cache does not acquire G or another D behind A.

The new continuation `expires_at` is the existing stored grant expiry on initial consume and recovery, not a newly computed TTL (`1197–1200`, `1583–1586`). Its optional contract field preserves older producers' schema compatibility. Consumers must still enforce their protocol's required original deadline; this review does not inspect the moving Web/native usage of that optional field.

## P2 test precision remaining

- B2's “every pre-consume stage” comment overstates coverage: `providerRound` advances authorize→approve before returning, so there is no result read while specifically authorizing. The “wrong pairing/verifier” comment tests only wrong pairing. Add a separate wrong-verifier case and exact HTTP/domain assertions for expiry (`2875`).
- B3's “intent or target” test changes the intent only (`2927–2949`); add actual target disagreement, missing/mismatched audit variants and the result response for inconsistent history if those are claimed covered. The existing direct guards are present; these are coverage gaps, not current P1 evidence.
- Keep exact expected domain codes in wrong-actor/expiry/mismatch regressions rather than accepting any 401/409/410. The older timer-based test titled “prepare and cancel” remains unchanged; the independent forced-lock probes, not that title, establish the relevant schedules.

## Final dynamic evidence

Parent execution used dedicated synthetic database `account_sync_desktop_parent_r33` and the exact frozen snapshot above. This reviewer did not rerun tests: it independently read the final receipts, verified all ten script hashes against the execution summary, checked all 27 `passed` values and all ten `sourceStable` values, compared every recorded before/after runtime hash with the snapshot, and rechecked all 451 manifest files plus clean commit identity.

- Execution summary: `r33/execution-summary.json`, SHA256 `b18500bab86a83f9819cd13fb76017d0a01988f66d8d37e44eeb1cd3933b9e0b`, completed `2026-09-25T04:32:34.541291+00:00`; all ten exits are zero.
- Repository log: `macos-pi/backend-r33-integration.log`, SHA256 `32b257706d0b56d905d698e7e974758474f9ec23aeecb4ff61fdf75cac8468ee`, four test files and **81 passed (81)**, no skipped tests. This log supports executed regressions, not arbitrary scenarios absent from those tests.
- All receipt paths below are relative to `parent-macos-manual/r33`; hashes bind the exact evidence inspected.

| Receipt | Cases passed | SHA256 |
| --- | ---: | --- |
| `parent-desktop-login-pg-receipt.json` | 2/2 | `e43e7342abb5860dd3aa409b25bce5ad5676726ccc7f5601770ac01ce12edcec` |
| `parent-desktop-credential-pg-receipt.json` | 3/3 | `c5a23e7aec5888ce6af4ea1ee9f1a9a89ffabccc5ff2ffce4655e1b8131c36cf` |
| `parent-desktop-deadline-cancel-pg-receipt.json` | 5/5 | `2b050fed26e7e9e8584be4aadd0faea39b8e71308b52abc80e3f49a82d12012a` |
| `parent-desktop-lock-pg-receipt.json` | 1/1 | `54376e27ada2d3899c47727c3b8ac0cd00a7a7528c9f54f8bda606b5dedb695b` |
| `parent-desktop-prepare-consume-lock-receipt.json` | 1/1 | `30fdebd4358a96e91ec7b51fc1186b85f5e303a94dca0211f498096b0ed967e1` |
| `parent-desktop-ordinary-receipt-pg-receipt.json` | 3/3 | `c6f3ee7f371771d5abe49ce6e8b60151b021ea49809de758f6393af619aad0ad` |
| `parent-desktop-ordinary-committed-ack-pg-receipt.json` | 4/4 | `9735bc0e97e2b5f1bda3271f0d66dd9fd24ba10736f2bacb5cf8361b21374a99` |
| `parent-desktop-cancel-consume-lock-receipt.json` | 4/4 | `05ecd6efe38fe610b4da4a6999afdb36a08345cf7d16800013db65876454e9d5` |
| `parent-desktop-pending-login-pg-receipt.json` | 2/2 | `f0e3b8cdaef9058c61363a8ff5f9e38f94cff3ec3d7f83c0cde91b2306140a4d` |
| `parent-desktop-approve-ordinary-lock-receipt.json` | 2/2 | `b9be8cf156ba586b4b90e2d2fa09a7dd1417dec72df2aa777343da7a8cc4674a` |

The retained defenses have specific evidence: revoke-after-admission returns `401 SESSION_INVALID` without creating a device session; wrong/anonymous/revoked credential actors return `409 DESKTOP_AUTH_FINGERPRINT_CHANGED`; delayed consume does not extend the proof deadline (`extensionMs:0`); WK/system cancellation invalidates the grant and prevents ordinary completion. The four forced-lock families cover ordinary/consume, prepare/consume, both cancel/consume first-winner orders and both approve/ordinary first-winner orders, with exact domain outcomes, mutation audit/revision checks and no database errors. The approve/ordinary fixture deliberately reasserts the same Apple subject (`already_linked`); it is not two independent fresh proofs or evidence of a live new-provider UI flow.

These are real isolated PostgreSQL and production helper/public desktop-route tests with controlled provider verifiers. Deadline cases translate disposable authority timestamps; they do not wait for production clocks. They prove the scheduled backend boundaries, not exhaustive concurrency, real OAuth, cookie transport, WebKit/native recovery-material retention or integrated delivery. The remaining P2 test-precision notes above still apply; parent regression coverage does not silently repair repository test labels/assertions.

Any final integrated/Pi source must match the reviewed hashes before this conclusion carries forward. Old r29/r26 reports remain untouched.
