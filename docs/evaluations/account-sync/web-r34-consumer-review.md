# Independent r34 Web consumer and evidence review

The password continuation and lost-completion-response recovery now have credible actual-consumer evidence, including real loopback HTTP and PostgreSQL. The five controlled consumer tests and two PostgreSQL-chain tests passed as recorded. **Two P1 findings remain, now also reproduced by four additional real-HTTP/PostgreSQL counterexamples**: target handoff is still disconnected after its initial redirect, and capable Cancel does not validate the submitted body reference. No P0 is established. This is a frozen intermediate repair7 Web review, not native or full-app readiness. Keep the three evidence groups separate: 5/5 controlled passes, 2/2 durable password/recovery passes, and 4/4 additional regression assertions failing on the remaining defects.

## Source and artifact binding

- Frozen Web checkout: `/Users/cubxxw/.codex/worktrees/account-sync-web-proof-r34/talent-signal`, HEAD independently read as `6996b6b7b44494a623aaf2db3cfbe405c1950c56`; working-tree status was clean.
- Compared the eight changed Web files with r31 commit `a41b154f7218fbca9aa3a44a1140ce4613d32215`.
- Independently verified the Web manifest's **1,148 files, zero mismatches**, and all artifacts in `web-pg-chain/r34-binding.json`. Both final receipts' before/after source/runtime hashes match the frozen checkout.
- Independently verified the r33 backend manifest's **451 files, zero mismatches**, and confirmed that each also matches its counterpart in the frozen r34 checkout. The binding names backend commit `78c2a85fb318ae8833ce6999318f30c1065af7d7`.
- Read the final harnesses, configs, server adapter, receipts, final logs and typecheck log. The logs show 5/5 controlled consumer tests and 2/2 PostgreSQL-chain tests. The binding reports exit 0 for both suites and Web typecheck. Old syntax/iterator/final-ACK fixture failures are not current product defects and were not used as contrary evidence.
- No source, database, service or existing evidence was modified. This reviewer did not run tests, query the database, start an app/browser, or inspect moving native/Pi source.

Product paths below are relative to the frozen Web checkout and use one-based lines. `Actions` means `apps/web/app/workspace/settings/login-methods/actions.ts`; `Helper` means `apps/web/lib/server/desktopAuth.ts`.

## P1-1 — Target redirect is green, but the following consumer cannot obtain its sealed grant

**Password-first source path:** `startPasswordStepUpLink` successfully creates the credential attempt (`Actions:383–393`), but the new native branch redirects at `397–406` **before** sealing the operation with its attempt (`409–434`) or sealing the target round (`438–444`). The native request link also contains no continuation reference. On a fresh flow, the subsequent prepare route calls `resolveCredentialFlow("target")` (`apps/web/app/api/desktop-auth/prepare/route.ts:113–117`); the helper requires an existing matching operation and target round (`Helper:331–337`) and a sealed operation attempt (`390–391`). It therefore rejects the handoff. Even if operation/round sealing is moved earlier, prepare currently requires an attempt-specific desktop continuation (`prepare/route.ts:135–145`), which a first password-proven target does not yet have.

**Provider-first source path:** `continueTargetLink` still rejects missing `operation.attempt` or a step other than `awaiting-target` before invoking the new flow-owned resolver (`Actions:559–578`). Relay current consume leaves the original operation at `awaiting-reauth` without its own `attempt`; the new resolver supplies a separate continuation rather than rewriting that operation. The successful password test explicitly records this state. Thus a normal relay-created link continuation does not reach the native branch. If a suitable operation is supplied, that branch still redirects at `587` before `sealTargetRound` at `589–595`, leaving the wrong round for target prepare.

**Why the green test does not close this:** `r34-consumers/consumers.test.ts:122–126` correctly establishes password step-up, no embedded `signIn`, and a target request redirect. It stops at the redirect. It never invokes the next target prepare or `continueTargetLink`. The test's narrow routing result is valid; describing it as a completed native target relay would be false.

**Minimum correction and acceptance:** Seal the exact operation, existing grant and target challenge/round before either redirect. Resolve provider-first continuations through their immutable flow-owned grant before legacy `operation.attempt` guards. Let target prepare validate the appropriate existing sealed password proof or relay continuation, without requiring a nonexistent desktop current ACK for password-first entry. Preserve the existing grant, nonce, actor and absolute proof deadline. Extend the actual Action test through the returned target request into the real prepare consumer, then prove target completion uses that same grant. Cover both password-first and provider-first paths, not just URL generation.

This finding is independent of native code and of the known prepare-303 presentation boundary.

## P1-2 — Cancel reconstructs its body reference from the URL

`apps/web/app/api/desktop-auth/cancel/route.ts:54–65` parses the body but retains only attempt and state. Its new capable-mode validation at `76–80` passes a fabricated object whose `request_ref` comes from `new URL(request.url).searchParams`, rather than the actual submitted body. Query/header agreement therefore makes the check pass even if the real body reference is missing or different. The route can then perform the authenticated cancellation at `101–106`.

**Concrete trigger:** Use a valid paired attempt, matching `?ref=parent-query-ref` and `X-Request-Ref`, but submit `request_ref: "parent-other-body-ref"` or omit that field. The validator receives `parent-query-ref` as the purported body value and admits the request. Pairing and backend authority still apply; this is not a claim of unauthenticated cancellation. It violates the required pre-transition exchange correlation and leaves an explicit requested boundary unfixed.

**Minimum correction and acceptance:** Retain and validate the actual parsed capable body, using the same query/header/body contract as consume/result/ACK. Reject mismatch or omission before backend calls or cookie effects. Add this case to the actual Cancel route tests. The current five-test suite covers invalid correlation only on Consume; its pass cannot establish all-route validation.

## What is now supported as fixed

| Boundary | Source change and final evidence | Limit |
| --- | --- | --- |
| Invalid consume correlation | Validation now precedes backend work. Controlled test records HTTP 400, zero consume calls and unchanged cookies. | Does not cover Cancel; see P1-2. |
| Pending ACK retains recovery | ACK now deletes pairing only for a committed result. Both suites perform a real Result route call after pending ACK. | No claim about actual WK delivery or loss of the final ACK response. |
| Password consumer receives relay grant | `Actions:481–500` resolves the active operation's matching flow-owned continuation, rather than requiring the legacy attempt field. Controlled and real-HTTP chains reach the actual password completion consumer. | Does not fix target consumers; see P1-1. |
| Unknown password completion preserves context | `Actions:505–523` preserves the operation/continuation and returns an unconfirmed message on transport uncertainty. The real-HTTP chain drops an actual successful completion response, then recovers the committed result and final ACK without replaying completion. | Actual rendered recovery controls and native response adjudication were not exercised. |
| Held A cannot replace B's credential grant | Relay continuation no longer writes the shared credential cookie. The adapted held-A test resolves B before and after delayed A writes and then executes B's actual password consumer successfully. | Controlled Next cookie delivery; no real browser response scheduling or ordinary login-cookie race proof. |
| Password-first avoids embedded OAuth at entry | The Action now emits a native target link without calling `signIn`. | Entry only; the following prepare still fails as described above. |

## Review of the final controlled consumer suite

The five final passes are supported by their executed assertions and recorded observations. The test continues to use real Actions, route handlers, contracts client and next-auth cookie crypto with controlled backend fetch and a Next cookie adapter. Its iterable cookie implementation matches the API shape used by `resolveActiveCredentialGrant`; the initial missing iterator was a fixture issue, not evidence against the corrected product path.

The held-A adaptation addresses the earlier review correctly. It captures A's request-cookie snapshot, runs the actual A consumer, retains only A's changed cookie writes, executes B, then applies A's writes (`r34-consumers/consumers.test.ts:128–144`). It no longer requires the removed legacy shared cookie. It finally calls the actual B `completeStagedPassword` consumer (`145–146`); the controlled backend asserts the selected grant/secret/password. This is stronger than checking a resolver alone and supports the recorded `actualBConsumerSaved: true`.

These passes do not prove all five original architectural boundaries globally. In particular the target test remains an entry-routing test, and the suite has no Cancel consumer. They must not mask the two source findings above.

## Review of the real HTTP and PostgreSQL chain

The final `web-pg-chain/chain.test.ts` and `server.mts` support the stated stronger evidence:

- The server imports and registers the frozen r33 desktop-auth/account-management handlers with a real PostgreSQL pool and binds loopback port 44339. Its provider verifier is deliberately controlled; it accepts only synthetic fixture inputs. The fixture-installed primary Web cookie contains a session returned by a real backend login (`chain.test.ts:67–74`). This does not exercise Web login-cookie installation or actual Apple authentication.
- The real Web Action, prepare, consume, ACK, Result and password-completion consumers invoke the real contracts client and loopback HTTP (`47–64,84–95`). The Next cookie layer remains an adapter. Provider authorize/approve/complete are called directly over backend HTTP (`33–41`), so Web system-browser authorization/callback/confirmation routes are outside this chain.
- The lost-response case calls real fetch and receives an actual successful `/v1/account/login-methods/complete` response before the wrapper discards it and throws (`75–79`). The subsequent Action response is unconfirmed. This is a post-commit response-loss test, not a fabricated backend completion. The original mutation is not retried.
- Each case then reads `committed` through the actual Result consumer and receives a `committed` final ACK with pairing retired (`94–95`). The final fixture correctly distinguishes this from a pending ACK's `acknowledged` outcome. The preserved older expectation is not a product failure.
- The tests read back canonical account/user and revision +1, compare the primary cookie unchanged, query the audit row by grant ID and verify its kind/account/actor, check password-row existence and grant consumption, and assert exactly one completion HTTP call (`96–102`). These assertions pass in the final receipt. They establish the tested durable effect and recovery; they do not authenticate with the newly set password or verify a real provider credential.

The bound `r34-wire.jsonl` contains 170 rows across earlier fixture runs as well as the final run. It must not be summed as one execution. Its final time window beginning `2026-09-25T04:50:19Z` contains two completion responses with HTTP 200 and the expected final consumer requests, consistent with the two final tests. The final receipt timestamp is `2026-09-25T04:50:20.440Z`; the final Vitest log shows 2/2 passes. Database assertions are assessed from the parent-run harness and final receipt; this reviewer did not independently query the database.

## Additional actual-HTTP/PostgreSQL counterexamples

I subsequently read the complete `web-pg-chain/counterexamples.test.ts`, its config, the final `r34-counterexamples.json` receipt timestamped `2026-09-25T04:56:14.243Z`, and `r34-counterexamples-final.log`. The log records four failed assertions and Vitest exit 1. The receipt's 12 before/after source/runtime hashes are identical and independently match the frozen checkout. These new artifacts are bound separately below; the original locked `r34-binding.json` and its successful-run artifacts were not changed.

The harness retains the established real loopback/backend/PostgreSQL boundary and controlled provider verifier/Next cookie adapter. The following are observed product-path failures, not generic HTTP errors or the earlier fixture syntax/iterator issues:

| Additional case | Positive controls and actual result | Supported conclusion |
| --- | --- | --- |
| Password-first target (`counterexamples.test.ts:92–106`) | First sets a password through the working real Web/backend chain and refreshes settings. The next real password step-up returns 201, and its Action redirects to a native Google target. The sealed operation is still the **prior `set_password` flow**, with no operation grant. Invoking the actual target prepare returns 303 `desktop-auth=stale`, has no attempt, and makes zero backend prepare calls. | Dynamically confirms P1-1's early redirect before sealing the new link grant/round. `operationSealed: true` does not imply correct handoff: the explicit intent/ref observations prove it is the previous operation. |
| Provider-first target (`107–114`) | Real current `link_provider` consume and pending ACK succeed and seal a continuation. The operation remains `awaiting-reauth` with no attempt. The actual `continueTargetLink` returns `link=error`; no target consumer/backend call occurs. | Dynamically confirms P1-1's legacy precondition before the flow-owned resolver. The test fails on the wrong Action destination at line 112, so its target-prepare call at line 113 is **not executed**; do not claim an HTTP target-prepare failure for this case. |
| Cancel with mismatched body ref (`115–124`) | Real prepare produces an attempt whose PostgreSQL status is `prepared`. Query/header stay valid while the actual body reference differs. The real Cancel route calls the backend, receives HTTP 200, returns a cancelled redirect, and the row becomes `cancelled`. | Dynamically confirms P1-2 with an actual durable state transition despite invalid exchange correlation, not merely a mocked backend call. |
| Cancel with missing body ref (`115–124`) | Same valid prepared/paired control, but the body reference is omitted. The backend again returns 200 and PostgreSQL changes `prepared` to `cancelled`; Web returns 303 instead of the expected 400. | Independently confirms omission is also admitted by the fabricated body-reference check. |

The target helper accepts either a returned attempt header or a pending redirect, so the password-first failure is specifically **stale scope with no issued attempt**, not an assertion that every 303 is invalid. Provider-first never reaches that helper because the Action already rejects continuation. Setup calls are cleared before the observed target/cancel phase; short receipt call lists do not mean the earlier positive setup was skipped.

For each Cancel case, PostgreSQL before/after reads and the HTTP call list are computed before the first failing assertion (`118–123`). The assertion requiring HTTP 400 fails first, but the recorded backend 200 and row transition are still actual observed values. The inputs retain valid pairing and initiating session authority; these cases demonstrate broken request correlation, not unauthenticated cancellation.

These four failures substantiate the same two P1 findings and do not invalidate the previously successful password-completion and recovery slice. The tests make no WK/native/UI/live-provider claim. This reviewer did not rerun them or query the database.

## Remaining acceptance boundaries

Prepare still returns 303 in the final receipt. `chain.test.ts:53–56` intentionally accepts an attempt from either a response header or the redirect location. This makes the chain useful for Web/backend effect testing, but **does not establish strict 200 capable-native prepare** or the required native receipt semantics.

No evidence here establishes real WK navigation/response cancellation, native generation/timeout/window/account lifecycle, actual Settings rendering and recovery-button dispatch, system-browser provider cookies, or live Apple/Google approval. Target linking and cancellation must pass their actual downstream consumers after the two source fixes. The successful password and PostgreSQL work should be retained as a closed, source-bound slice rather than rerun broadly or described as complete phase2 readiness.

## Hash binding

```text
ac05298af57243ef214e36ef981fa6c6e02a2d133360cea4315a6b863b9cc2bf  macos-pi/web-r34-snapshot.json
bccef1f7f3051924e383b44c342ee0559933ee604bdd4f82e4eb6662c926e74f  macos-pi/backend-r33-snapshot.json
ac461b6dc0c7d487fa4730b8d90bfa49ff7b3a868d238f4aaafd3087b48cd62a  web-pg-chain/r34-binding.json
9473ff2c5ae1c9b4bffd1ced9f16878cb52fccb4cd500f972466406d153bb65e  apps/web/lib/server/desktopAuth.ts
69fb1ac9aa9dfad6328e0fdb5d449a4ad1a306b7ceb0289d21d54e3f0762bc1f  apps/web/app/workspace/settings/login-methods/actions.ts
eb55c848e9bd1c51c37ebf7ff8563f42001cf3517835cb7f1bcf717c8f61070d  apps/web/app/api/desktop-auth/cancel/route.ts
c04f8dcbe34ae433f4b99b39645a2853cc0941534585825b8142004f418d5914  apps/web/app/api/desktop-auth/prepare/route.ts
0029c46afd5311fb0de6e8d33d3873e3b0ec4d8321f672ce27c70daaca254f95  r34-consumers/consumers.test.ts
176be13cfe583ff2ef4a1679a01617a20e3b1a232c73827c8db32e1bfaf2a15b  r34-consumers/receipt.json
6be5ef0ab6e08df4233a16b072487e46fc0445590eefd6b4c0aba6916a4c28cb  web-pg-chain/chain.test.ts
d725283e36243f9477039eaa729e0711b73e52f286aaf7d0189a7e3f688ecf63  web-pg-chain/server.mts
b154d0d778d8e1486ed36d3f80f2c1865457d27bda40c1f80ca63b336a8df0c5  web-pg-chain/r34-final-receipt.json
ae624e09fc07733af18967d2a9aa5b8a486d18ee8ae80e069f92184bbdd0cc94  web-pg-chain/r34-wire.jsonl
```

The complete manifest and `r34-binding.json` retain the additional config/log/artifact hashes, all independently verified during this review.

Additional counterexample artifact binding, separate from the original locked binding:

```text
92d0c350a058437a1936f48d2c391e6f52d808cdc0c398a7b58e8f6f8104f467  web-pg-chain/counterexamples.test.ts
da71912da2c94d73b0af7291cb3f90e4fca7536034199808887daf9d5681c397  web-pg-chain/counterexamples.config.mjs
d7a78e02d8dcd38e08c8fc59e8152c5071744ffa0afb2659a6425c3b32297a86  web-pg-chain/r34-counterexamples.json
fe113ab5f43ed5c3f1c0c4ce6380f28eb7e5fe26f16bb1c21f31ac3a52bc4fc3  web-pg-chain/r34-counterexamples-final.log
```
