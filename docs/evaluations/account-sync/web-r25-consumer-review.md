# r25 Web consumer counterexample review

Reviewed the supplied test, receipt, configuration, and nine frozen source copies on 2026-09-25. This review did not run tests, access a database/provider/browser/native app, or change product source. All source references below resolve under `parent-macos-manual/r25-source/`, not the moving Pi worktree.

## Conclusion and evidence boundary

All four observed failures are valid for the tested consumer boundaries and supported by the frozen source. They identify P1 defects in the required current-proof and lost-response protocol. Cases 2 and 3 exercise different branches of the same premature-pairing-cleanup defect. No account takeover or live OAuth result is established.

The final receipt reports four failed assertions, executed at `2026-09-25T02:59:14.060Z`, after the parent tightened the positive success assertions. I independently matched all nine copied files to both receipt manifests. The Vitest configuration resolves `@` to the actual worker Web package; the test invokes the production Server Action and Route Handlers, real JWT encoding/decoding, and the compiled contracts HTTP client. It mocks Next request/cookie transport, the external backend HTTP boundary, and the embedded `signIn` entrypoint. The latter throws if invoked; the successful native redirect is independent of it.

Case 1 proves an actual `startProviderReauth → seal/read → prepare` incompatibility. It calls prepare directly after the action redirect; it does not execute the native request page or system authentication. “Provider-only” describes the intended entry path: the fixture is not evidence of a live linked Apple identity or a real passwordless account. Cases 2–4 deliberately begin with a synthetically paired WK cookie and controlled backend continuation. They are valid local consumer tests, not proof that case 1 currently reaches those later stages. The in-memory cookie jar does not implement browser cookie delivery, WK navigation, SameSite, or separate cookie stores.

## Confirmed findings

### R25-1 — P1: native current-proof start cannot reach backend prepare

`apps/web/app/workspace/settings/login-methods/actions.ts:229–249` creates ordinary credential operations with `reauthChallengeId`; the action seals a matching current round at lines 250–267 and redirects the native entry at lines 273–288. It does not populate `roleChallenges`. That optional field is explicitly for reconciliation roles in `apps/web/lib/server/stagedAuth.ts:77–85`.

`apps/web/lib/server/desktopAuth.ts:314–316` nevertheless requires `operation.roleChallenges.current` for every current credential round. Consequently `apps/web/app/api/desktop-auth/prepare/route.ts:109–110` returns stale before backend admission. The executed test at `parent-desktop-web-r25.test.ts:73–81` records valid sealed operation and round, missing recovery-specific field, `/workspace/settings?desktop-auth=stale`, and no `/v1/desktop-auth/prepare` call.

Required repair: consume the canonical credential operation/round challenge, checking agreement of the sealed flow, current role, provider, purpose, and challenge. Do not fix this by bypassing the challenge check or treating a reconciliation proof as a credential proof. No backend behavior is needed to explain this failure.

### R25-2 — P1: successful consume deletes pairing before acknowledgment

`apps/web/app/api/desktop-auth/consume/route.ts:116` unconditionally deletes pairing after a successful backend response, before `sealDesktopContinuation` at lines 161–167. The actual acknowledgment handler requires that same pairing and the sealed continuation at `apps/web/app/api/desktop-auth/ack/route.ts:54–64`.

The executed test at lines 82–92 starts from the paired fixture, invokes consume, decrypts its real sealed continuation, then invokes the real ack handler. It observes consume 303 and a sealed matching credential attempt, but pairing is absent and ack returns 409 without reaching the backend. The mock does not manufacture this failure: the Web handler deletes the cookie before ack can read it.

Required repair: retain this round's pairing until the original WK continuation has been acknowledged, or until its original deadline/appropriate terminal cleanup. ADR 0020 lines 136–149 explicitly require this lifecycle. Preserve the existing primary login throughout credential continuation.

### R25-3 — P1: uncertain consume destroys durable-result recovery authority

The `failure` helper at `apps/web/app/api/desktop-auth/consume/route.ts:82–85` also deletes pairing. A transport error takes this branch with `unknown` at lines 102–106. The result handler requires pairing before backend access at `apps/web/app/api/desktop-auth/result/route.ts:40–41`.

The executed test at lines 93–100 injects a fetch `TypeError`, then calls the actual result handler. It records `/login?desktop-auth=unknown`, missing pairing, and result 409 with no backend result call. This proves broken recovery after uncertainty. It does not simulate or prove an actual backend commit during the lost response; that distinction does not weaken the cookie-lifetime counterexample.

Required repair: preserve the same attempt, pairing, and original deadline for uncertain recovery; use the paired result route instead of replaying consume. Route uncertainty back to the operation's recovery surface. Do not report cancellation or completed mutation from this transport error.

### R25-4 — P1: result returns the credential secret to the page and fails to seal recovery

`apps/web/app/api/desktop-auth/result/route.ts:43–57` obtains the backend result and returns it wholesale through `Response.json`. It neither calls `sealDesktopContinuation` nor removes the continuation's `attempt_secret` from the page response. The normal consume path demonstrates the intended server-only seal at `consume/route.ts:161–163`; its helper uses actual encrypted cookies at `apps/web/lib/server/desktopAuth.ts:167–193`.

The executed test at lines 101–106 observes status 200, the exact synthetic secret in the response body, and no server-sealed continuation. It begins from a valid paired transport fixture rather than the already-broken consume path. This is a direct violation of the secret-transport and recovery contract: a sensitive continuation becomes ordinary page-readable JSON, and the existing WK credential/ack consumers cannot use the required sealed state. It is not evidence that an external attacker can read this same-origin response.

Required repair: validate and server-seal the recovered SAME continuation, then return only the fixed purpose destination or explicitly allowlisted non-secret result metadata. Preserve attempt/flow identity and original expiry; do not mint a replacement grant or refresh proof time.

## Repair acceptance: prevent false green

Keep these as real consumer tests. Do not call a mocked backend function directly or manually seal/clear continuation between consume/result and ack. If the repaired protocol requires a pre-existing operation/round for cases 2–4, create a coherent fixture with the real sealing helpers and label that setup explicitly.

The revised test closes the principal arbitrary-error false-green gaps: prepare requires 303/pending and exact actor/revision/challenge/flow fields in the actual backend call; successful consume requires the fixed Settings target route and the same sealed grant/flow/secret; ack requires 303/Settings/acknowledged with this attempt; uncertainty requires the Settings recovery route and successful result sealing; direct result requires 200, absence of the plaintext secret, and the same usable sealed grant. All four contain an unchanged-primary-session assertion. These are repair acceptance assertions, not passing observations: the current failures prevent later assertions in each case from executing.

Remaining narrow acceptance refinements:

1. **Start/prepare:** compare pending attempt/state and the sealed round, original times, outbound bearer token and origin, in addition to the existing exact actor/revision/challenge/flow comparisons. Require exactly one backend prepare request and explicitly verify embedded `signIn` was not called.
2. **Consume/ack:** inspect the actual ack body’s `credential_attempt_id` and its original bearer/origin, not just attempt/pairing/verifier and pathname. Include round/intent/provider in the decrypted continuation comparison. Add a rejected acknowledgment or changed-flow case so failure cannot acknowledge or clear a newer operation.
3. **Lost consume/result:** require exactly one consume and one result, no mutation replay, and a real downstream acknowledgment of the recovered sealed grant. A backend-committed-but-response-lost fixture remains synthetic unless backed by a separate database test.
4. **Secret isolation/result:** also inspect Location and other page-visible metadata, cookie HttpOnly/Secure/SameSite/path options, retention of pairing until acknowledgment, and unchanged original deadlines. Current direct-result assertions already prevent an empty error response or secret omission without usable sealing from passing.

The specific 200/303 shape may be adapted to an explicitly defined, equally safe final native result/ack contract. The invariant is successful same-operation recovery plus server-held secrets and authentic acknowledgment, not a particular status number independent of that contract. Do not weaken assertions to arbitrary non-500 or any redirect.

Use exact expected status/domain errors for negative paths; arbitrary 500, generic 303, or missing backend calls are not successful security rejection. Complete mocked backend responses with the actual contract shape, and check HTTP method/headers/body, not only URL pathname. In particular the current ack fixture at test line 54 omits fields such as status; this does not explain the pre-backend 409 failure, but should not be carried into final contract acceptance. The supplied tests are counterexamples, not comprehensive validation of backend actor/revision enforcement or final native/Web capability negotiation.

## Source and evidence hashes

SHA-256 of reviewed evidence:

- `parent-desktop-web-r25.test.ts`: `8147be0ff11bee3a503d65372f7ca78df05c13e9eb040ea0fa6d0744602daaf8`
- `parent-desktop-web-r25-receipt.json`: `e1392f6e7d877f805da6d5678871830b52054a6e87b6b704248d134a7d220fa2`

All nine frozen copies independently match the receipt's before AND after hashes:

| Path within r25-source | SHA-256 |
| --- | --- |
| apps/web/lib/server/desktopAuth.ts | f4a76da784d879ef836f2ef1a075d90b0970900618564aec0946c92c2437ed79 |
| apps/web/lib/server/stagedAuth.ts | 0e9eef618496ebefafe1ad66ff0049204f54e940ec93146437fb2b1cabab3ace |
| apps/web/lib/server/backendAuth.ts | 571eba8cd8eb178e909db82c091ba9dc958a257bdc7f76b3973a3da7aceb3a86 |
| apps/web/app/api/desktop-auth/prepare/route.ts | 0043c25651645291e592e8e60a6dbf5e004f284d8f1d0af332b9dd5dc6f8c38a |
| apps/web/app/api/desktop-auth/consume/route.ts | 752bf96972cf6fc1b5c52d27851259c6c6f3a99bddb9f9482693f1dd94c46221 |
| apps/web/app/api/desktop-auth/result/route.ts | 4abb03e2a5f1082e28493f996279691f66a56502d94f349d02ab925c2b980b79 |
| apps/web/app/api/desktop-auth/ack/route.ts | 8aa2e7c900e4c705bcc2e5f179704ef3b28e35720dbb597640871faa517795c5 |
| apps/web/app/workspace/settings/login-methods/actions.ts | 9148a6191f10b2efc2a5c20567b51a503306d12b721574f7f2a8217be0e1e163 |
| packages/contracts/dist/client.js | f8b399836c96864c3b31d9b5f22b1d5271fc180c4ba8c0a155a48e75379a4a75 |

This is a nine-file consumer snapshot, not a freeze of all transitive dependencies, backend, native implementation, or Pi's eventual candidate. Re-run against and bind hashes to the repaired integrated candidate before closing these findings.
