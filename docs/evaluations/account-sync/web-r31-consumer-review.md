# Independent review of r31 Web consumer counterexamples

The five recorded failures are supported as **controlled actual-consumer counterexamples** against frozen repair5. They execute the real Web Actions, routes, cookie cryptography and contracts client at the stated boundaries. They do not establish a backend mutation, provider authentication, real browser cookie delivery, WK navigation, or macOS UI outcome. No additional product defect is needed to explain them; they substantiate the previously reported r30 boundaries.

## Source and execution binding

- Frozen checkout: `/Users/cubxxw/.codex/worktrees/account-sync-relay-proof-r31/talent-signal`.
- Independently read HEAD: `a41b154f7218fbca9aa3a44a1140ce4613d32215`; `git status --short` was empty.
- Manifest: `/private/tmp/ai-test-account-sync.umqxBi/macos-pi/relay-r31-snapshot.json`, captured `2026-09-25T04:09:17.045941+00:00`. Independently checked **1,225 files, 0 mismatches**.
- Reviewed the complete 145-line test, its config and the receipt timestamped `2026-09-25T04:15:19.827Z`. The receipt records five failed cases and identical before/after hashes for 11 source/runtime files. Those 11 current hashes independently match the frozen checkout.
- The config aliases `@` to this checkout's `apps/web`, keeps the real Next and next-auth packages, and runs the test in Node. The contracts package resolves to this same checkout's `packages/contracts`, whose import entry is `dist/index.js`; the actual `dist/client.js` is explicitly hash-bound by the receipt.
- This reviewer did not rerun tests, alter source, start a browser/app/Simulator, or inspect the moving Pi worker. The reviewed receipt is parent-executed evidence. A Vitest process exit code was not supplied in this receipt; the recorded assertions establish the five failures independently of any process-exit claim.

References below use one-based lines in `r31/parent-desktop-web-r31.test.ts` unless explicitly marked as product source.

## Harness boundary and positive controls

The test mocks `next/headers` with an in-memory cookie adapter, including recorded options (`11–16`), and mocks only the external `signIn` entry with an intentional throwing spy (`17`). It uses real `next-auth/jwt` encoding and the actual imported helper/Action/route functions (`18–28`). Global fetch is controlled (`53–78,90`); it checks the backend origin and relevant request payloads before returning synthetic responses. No product request is permitted to reach a real backend/provider through this seam.

`seedPairedBoundary` now executes the actual provider-current Action and prepare route (`41–50`). It asserts the native request redirect, actual sealed operation/round, pending redirect and pairing-cookie options. Its response fixtures carry the same actual flow/round refs created by those Actions. The set-password case explicitly selects `set_password` and the password target. Thus the missing continuation finding is not produced by manually inventing an unrelated operation shape.

The helper clears the call list at line 51 after these setup controls. The receipt's short call list for a case therefore covers its observation phase, not the entire setup. A list containing only consume/ACK does not imply that Action/prepare were bypassed. Test assertions and the completed case receipt jointly support that those positive controls executed.

The fixtures deliberately substitute backend proof and result authority. The presence of a sealed fixture JWT, expected challenge, verifier or pairing secret is not evidence of a verified real identity. Cookie flags are recorded and asserted, not enforced by an actual browser; expiration, cross-site policy and network behavior are outside this adapter.

## Assessment of the five cases

| Case and harness lines | Supported observation | Claim boundary and repair relevance |
| --- | --- | --- |
| Invalid query/body reference, `99–105` | Query and header use `parent-ref-query-header`; body uses `parent-different-body-ref`. Response is 400 **after** `/v1/desktop-auth/consume` was called. `cookiesChanged` is false. | This remains invalid regardless of the allowed reference alphabet. It confirms late validation before backend dispatch is missing (r30 P1-1). It does **not** demonstrate an actual backend mutation or cookie effect in this case. |
| Pending ACK then Result, `106–112` | Real consume and ACK return valid pending receipt outcomes. ACK removes pairing; the next real Result route returns 409 without calling the backend Result endpoint. | Confirms the Web consumer destroys pending recovery authority (r30 P1-4). No browser transport is needed to explain this route-level rejection. It does not exercise a lost ACK response or a later actual password mutation. |
| Current proof to password completion, `113–121` | Actual set-password Action/prepare setup, consume and ACK execute. The attempt-specific continuation is sealed, but the operation remains `awaiting-reauth` without `attempt`; real `completeStagedPassword` rejects it and never calls the completion endpoint. | Confirms disconnected continuation consumers (r30 P1-5). The synthetic backend completion branch is deliberately available and asserts the intended grant/password if reached; it is not reached. This is an actual Action-consumer failure, not a full rendered form submission. |
| Password-first target, `122–127` | The real Action reads settings, sends the password step-up request, then invokes the embedded `signIn` spy once despite `nativeHost: 1`. | Confirms the capable target relay branch is missing (r30 P1-6). The recorded `/workspace/settings?link=error` destination is caused by the intentional throwing spy; it must not be reported as the normal production provider destination or evidence that OAuth itself failed. |
| Delayed A cookie writes after B, `128–145` | A runs against a cloned request-cookie map; its actual changed cookie writes are retained. B executes and installs its grant. Applying only A's retained writes afterward changes the shared credential grant away from B while the B operation, B attempt-specific continuation and original login remain intact. | Confirms the shared-cookie overwrite in the controlled Next adapter (r30 P1-3). The fixture models response delivery order rather than holding a real socket or WK response. It does not show B's subsequent mutation executing under A, session-cookie replacement, or a backend authorization bypass. |

For the invalid-ref case, the cookie observation is computed before the first failing expectation. Although the later cookie expectation is not reached after the backend-call assertion fails, the recorded `cookiesChanged: false` is still an actual observation. Describing this case as “backend call plus cookie effect before 400” would exceed the receipt.

For the held-A case, the clone is appropriately taken before A's consumer runs (`130`), so its request-time `readAuthOperation` sees A. The adapter's setters replace map entries rather than mutating shared value objects. `writesA` captures only values actually changed by the real consumer/crypto (`132`), and the test reapplies those values rather than replacing the entire browser map (`141`). Positive checks establish B before replay (`138`); B operation/continuation and the original login are asserted intact before the final expected-preservation assertion fails (`144`). This isolates the shared credential cookie overwrite without relying on accidental whole-jar restoration. This specific path has only relevant set operations; the net-diff adapter is not general proof of arbitrary cookie deletion/expiry behavior.

## Suitability as reusable acceptance cases

The reference-validation, pending-ACK, actual password-completion and native target-routing cases express useful consumer outcomes. Keep their actual Action/route calls and negative request-count assertions when testing the repair. Preserve the corrected unequal query/body fixture; the earlier alphabet-only receipt is historical evidence, not the current contract regression.

The held-A case needs a small expectation update if the repair removes the unsafe shared credential mirror, as recommended. Its current positive control requires `readSealedCredentialAttempt()` to equal B before replay (`138`). A correct flow-specific implementation that never writes this legacy cookie would fail that precondition even if A cannot harm B. Keep the captured-request and delayed-write schedule, but assert the repaired B consumer resolves B's immutable grant and remains usable. Do not retain a deprecated shared cookie merely to turn this existing test green.

Do not treat these fixtures as the complete macOS acceptance set. They do not test actual HTTP response serialization/Set-Cookie application, native receipt/generation handling, final committed ACK, same-grant target transfer, absolute deadlines, account-switch/revocation under backend locks, or live provider approval. Those remain separate evidence layers. The current five counterexamples are sufficiently concrete to validate the corresponding repair boundaries without broadening into unrelated tests.

## Artifact hashes

```text
7d34a255145fc5bd50cc7394f245e0e9d0eb113d124a4c8c2a99e2259dbab7d7  macos-pi/relay-r31-snapshot.json
2b4d9476918bc8747cc7b08d65c279b024b9b1cfe4c5438564889a78ea606061  r31/parent-desktop-web-r31.test.ts
11094edc21f664df8fc556e39f4ef0b83a5130423fd3918f97f5c75f50a2e118  r31/parent-desktop-web-r31.config.mjs
41a6a06e678759da3d6e55d642650427679cd7d5d1a3999cba7859fbbdf7eb5e  r31/parent-desktop-web-r31-receipt.json
```

The complete source binding remains in the manifest and receipt. Relevant consumer hashes are unchanged from r30:

```text
d2ad843bcd294ca74815db430860ce0aafc53da21b7d28dd13955332bef259f9  apps/web/lib/server/desktopAuth.ts
06a78aac462d35f2e4879dfd92e13ceaba0309c200515e4ee8e4fb01b7750804  apps/web/lib/server/desktopReceipt.ts
28f2a49d30a4e906407ae515e35e2653792e7170be7dbd6859918712493bba58  apps/web/app/api/desktop-auth/consume/route.ts
8328a32916206b511d8031576dfd874fa3f8ce8f10543abf0e50241a727735c4  apps/web/app/api/desktop-auth/ack/route.ts
dae7a4b3cfd80bdc780bd171800c69e9c63ef8dbf2ad30068b99ff37d7e3561c  apps/web/app/api/desktop-auth/result/route.ts
9148a6191f10b2efc2a5c20567b51a503306d12b721574f7f2a8217be0e1e163  apps/web/app/workspace/settings/login-methods/actions.ts
f8b399836c96864c3b31d9b5f22b1d5271fc180c4ba8c0a155a48e75379a4a75  packages/contracts/dist/client.js
```
