# Native and Web receipt consumers: r30 mid-repair review

This immutable mid-repair5 snapshot still has **8 confirmed P1 findings**. No P0 is established. Several r27 defects have narrower source-level fixes, but the actual native/WK/Web chain does not yet satisfy ADR0020. This is not an assessment of Pi's subsequently changing worktree, a test-pass claim, or full app readiness.

Subsequent evidence update: the parent reports that all 94 original hashes remained identical when Pi declared repair5 `ready_for_review` at turn 413, with raw evidence saved under `macos-pi/repair5-ready`. This reviewer did not inspect the moving worker. The findings bind to the exact hashes below and therefore also apply to any candidate carrying those same bytes; a ready label does not close them. The parent-executed exact-source probe adds five failing cases and one controlled-header passing sequence, assessed below.

## Evidence and scope

- Snapshot: `/private/tmp/ai-test-account-sync.umqxBi/parent-macos-manual/r30-source`.
- Manifest: `/private/tmp/ai-test-account-sync.umqxBi/macos-pi/native-web-r30-snapshot.json`, captured `2026-09-25T03:57:14.987909+00:00`, base `25435d5f8f412fdd25eddecb4991fce3319ef317`.
- Independently hashed all **94 manifest files before and after inspection: 0 mismatches**. Manifest SHA-256: `45be7238ffaaaf0823bae9d2ee1cc927f205db3e614c69fc4c381fa30f6e2562`.
- Read accepted parent ADR0020 and the independent r28 WK receipt-boundary review. The latter supports response-header classification and same-jar cookie transport, and explicitly establishes that cancelling rendering does not undo Set-Cookie. It does not validate this implementation.
- Read only the frozen snapshot and these reference documents. No product/test edits, builds, test executions, providers, GUI, Simulator, or moving Pi source were used. The parent owns any subsequent bounded executable probes.
- A separately captured, immutable three-file supplement at `/private/tmp/ai-test-account-sync.umqxBi/parent-macos-manual/r30-web-supplement` supplies the actual credential Server Actions, `components/settings-workspace.tsx` and `lib/server/loginMethods.ts`. Its manifest was captured at `2026-09-25T04:02:12.891378+00:00`; all three hashes were independently verified. The manifest reports no original r30 files changed in the worker at that capture. These are explicitly cross-capture observations, not a claim of one simultaneous snapshot. The nested account/login-method form component remains outside these supplied files; no actual form rendering or submission was executed.

All source references below are snapshot-relative and use one-based lines. Abbreviations:

| Name | Snapshot path |
| --- | --- |
| Controller | `apps/macos/Sources/Services/DesktopAuthenticationSession.swift` |
| Host | `apps/macos/Sources/Features/QuietWorkspaceView.swift` |
| Tests | `apps/macos/Tests/DesktopAuthenticationSessionTests.swift` |
| Receipt | `apps/web/lib/server/desktopReceipt.ts` |
| Web helper | `apps/web/lib/server/desktopAuth.ts` |
| Prepare / Consume / Result / ACK / Cancel | `apps/web/app/api/desktop-auth/<name>/route.ts` |
| Credential Actions (supplement) | `apps/web/app/workspace/settings/login-methods/actions.ts` |

## P1-1 — Native references can be invalid, and validation runs after effects

**Observed:** Controller `770–772` builds each reference from the first eight characters of `DesktopAuthSecrets.random()`, whose encoding is base64url (`208–228`). It can contain `_`. Receipt `64–70` accepts only `[A-Za-z0-9-]`, rejecting that valid native-generated character. More seriously, Consume validates this reference only at `128–133`, after `consumeDesktopAuth` at `103–112`; ACK validates at `94–98`, after the authoritative ACK and pairing-cookie deletion at `76–93`. Result validates at `73–76`, after the read and continuation resealing at `52–65`. Prepare and Cancel do not invoke the reference validator at all.

**Concrete trigger:** Use a native reference such as `xchg-1-0-2-ab_cd123` with otherwise valid paired consume or ACK input. Backend work succeeds, then Web reports HTTP 400. On ACK it can also delete the only pairing cookie while returning no accepted receipt. No probability estimate or live-provider run is needed to establish this producer/consumer mismatch and ordering error.

**Minimum correction and check:** Agree on one reference alphabet; validate capable-mode query/body/header correlation before any backend transition or cookie mutation in every covered route. Test a deterministic underscore reference plus duplicate/mismatched refs against the actual route consumers. Assert invalid input makes zero backend calls and changes zero cookies. A mocked receipt accepting the native reference does not test this boundary.

## P1-2 — The actual WK response/failure path still bypasses exchange ownership

**Observed:** Dispatch registers the returned `WKNavigation` identity (`Controller:775–797`), but the Host passes `ObjectIdentifier(response)` for a `WKNavigationResponse` (`Host:247–256`). The controller falls back to `latestExchange` (`903`), but its `.failure` branch only calls `exchangeFailed` when that response object is in the navigation registry (`913–917`). It never is on the actual host path. Thus 200 invalid MIME/headers and 401/403 responses are allowed to render with no controller recovery (`Host:261–266`); tests instead pass the registered fake navigation identity.

Valid receipt handling also calls `advance` and dispatches the next POST synchronously (`Controller:918–921,946–953`) **before** the Host invokes the response policy's `.cancel` (`Host:252–258`). No exchange is marked as intentionally cancelled or consumed. The corresponding `didFail[Provisional]Navigation` always calls `navigationFailed` (`Host:369–375`), which still owns the old exchange in the same generation and can overwrite the accepted result with recovery (`Controller:1194–1197`). The exact callback ordering remains a real-WK acceptance item; the absence of an intentional-cancellation fence is directly visible in source.

There is a further semantic gap in this same policy: an exchange records `phase` but never checks it, and does not capture expected purpose/role/flow/grant (`396–407`). Parsing validates enum membership, not equality to the operation (`469–492`), accepts a MIME prefix (`460`), and `.ack` calls `state.acknowledged()` before checking its outcome (`997–1008`). A correlated ACK response with `result-unknown` opens the target gate before being classified as failure. Old registered exchanges are not retired after successful adjudication, so a repeated accepted response can dispatch another ACK in the same generation.

**Minimum correction and check:** Resolve the response through its exact request reference and fixed URL to an immutable exchange, separately retaining the real navigation identity for failure events. Return a classification/next-action value; the Host must cancel rendering first, suppress only that exact expected cancellation, and then dispatch the next POST. Match the operation's purpose, role, phase, flow/grant and allowed outcome before advancing; consume an accepted exchange once. Exercise the production host seam with a different response-object identity, 401/403/200 malformed responses, valid receipt followed by cancellation failure, repeated receipts and an invalid ACK outcome. Do not supply a fictitious WKNavigation identity to a response callback in the test.

## P1-3 — Request-time flow checks do not prevent a delayed A response overwriting B

**Observed:** `sealDesktopContinuation` writes an attempt-specific cookie (`Web helper:167–177`) but also writes the shared `CREDENTIAL_ATTEMPT_COOKIE` (`184–197`) when `readAuthOperation()` in that request matches A (`182–183`). That is the request's captured cookie state, not the browser's state when the response arrives. Consume login similarly writes the shared `AUTH_SESSION_COOKIE` and deletes the shared Lab selection (`Consume:135–166`). Native generation rejection cannot undo those response cookie effects, as the r28 WK experiment already demonstrated.

**Concrete trigger:** Start A's consume/result while the request carries A's operation. Hold A's response after it has passed the flow check and staged its Set-Cookie. Start and receive B in the same jar. Release A. A overwrites B's shared credential cookie even though its native receipt is stale. For login, two admitted login consumes can similarly return B then A and leave A's session installed. Backend request-time fingerprint checks alone cannot adjudicate the later response order.

**Minimum correction and check:** Keep relay continuations and their downstream consumers keyed by immutable flow/attempt; do not mirror them back into a shared mutable credential cookie. Define an explicit installation/ownership protocol for the ordinary login cookie rather than assuming cancelled rendering rejects Set-Cookie. Test held-response A/B ordering against the same real jar, then invoke the actual downstream consumer. Verify cookie authority and preserved B state, not merely that native ignored A's headers.

## P1-4 — Pending ACK destroys final-mutation recovery; committed consume skips ACK

**Observed:** ACK deletes pairing at `92–93` for **every** `response.acknowledged`, before distinguishing `response.status === "committed"` from a pending acknowledgment (`104`). Native intentionally keeps a flow verifier across a pending ACK (`Controller:932–972,1002–1022`), but Result requires that now-deleted pairing cookie (`Result:46–47`). Native memory retention therefore cannot recover the later password change or target outcome. Loss of the ACK response after its Set-Cookie can also make a retry impossible.

In the opposite direction, a committed consume immediately calls `settleFinished` (`Controller:973–974`), clearing its verifier (`1027–1035`) without a paired committed ACK. Consume's capable `completed` response contains no grant/flow continuation (`Consume:181–189`); a subsequently recovered committed result without a continuation cannot pass Web ACK's unconditional continuation requirement (`ACK:54–71`). These are not equivalent to confirmed completion acknowledgment.

**Concrete trigger:** Current proof for first password → consume seals the grant → pending ACK succeeds → normal password completion commits but its response is lost → native Check Result receives 409 because pairing was deleted. A simple happy-path ACK receipt test misses the later operation this authority must recover.

**Minimum correction and check:** Pending ACK confirms continuation installation only. Retain pairing and verifier until same-grant recovery responsibility is safely transferred, a committed result is acknowledged, or the original deadline expires. Give immediate/recovered committed results a matching committed-ACK path with the required immutable identifiers, without fabricating a pending secret. Test both pending ACK followed by lost password completion and immediate unlink/target completion followed by held/lost ACK.

## P1-5 — The installed continuation is disconnected from real consumers and recovery

**Actual consumer mismatch, confirmed by the supplement:** Current-provider start seals an `AuthOperation` with `step: "awaiting-reauth"` and no attempt (`Credential Actions:229–250`). Relay consume calls `sealDesktopContinuation`, which writes only its own continuation and the legacy `CREDENTIAL_ATTEMPT_COOKIE` (`Web helper:167–197`); it does not update or replace the operation consumed by the actual next steps. `completeStagedPassword` reads `readAuthOperation().attempt` and rejects its absence (`Credential Actions:466–474`); `continueTargetLink` additionally requires `operation.step === "awaiting-target"` (`523–533`). `readAuthOperation` only decodes its own cookie (`stagedAuth.ts:335–346`). A successful relay consume/ACK therefore has not installed the object those actual continuation consumers require. The fix must connect the consumers to the same immutable flow-specific grant, without recreating the shared-cookie race in P1-3.

**Observed:** `checkResult` prefers `flowContext` over the live attempt and sends that context's attempt/verifier (`Controller:1119–1133`). `dispatch`, however, records the **current** state's generation, epoch and attempt ID (`782–788`), not the selected recovery context. Starting target or a new current operation does not transfer or clear the previous context (`802–820`). A recovered `result-pending` only updates text (`989–992`); it does not install the recovered context, ACK it, or return to its password/target continuation. Web emits precisely `result-pending` after resealing a recovered pending grant (`Result:64–65,83–90`).

**Concrete triggers:**

1. Current A → consume/ACK → target B → uncertain B result → Check Result sends A, but validates against expected attempt B and rejects A's authentic result. Starting unrelated current B has the same stale-context preference.
2. Lose the initial current consume response → read Result → backend returns/reseals the same pending grant → native remains in the unknown-result UI with no continuation/ACK progression. The current test stops after proving that the Result POST was sent.
3. After a valid pending ACK, the flow remains in memory but a normal password form's unregistered navigation failure is ignored by `navigationFailed`; ordinary Reload sees no `recovery` and reloads the page (`Host:136–151`). The actual password action clears staged auth both after success and in every catch (`Credential Actions:476–486`), including transport uncertainty. Its error copy acknowledges an unknown result (`80–93`), but there is no retained same-operation recovery contract in this action connected to the native flow. The form component's visual behavior remains an acceptance boundary.

**Minimum correction and check:** Make each result/ACK exchange explicitly own one immutable recovery context, with an intentional same-grant transfer between current and target. Preserve the correct verifier through every subsequent await/response. A recovered pending result must restore that exact continuation and run the corresponding ACK/return flow. Exercise A-current→B-target→held result, A→unrelated B, and lost current consume→pending Result→ACK→continuation; include the real password completion consumer before claiming final recovery.

## P1-6 — The target gate is a global flag, and blocks password-first linking

**Observed:** Every target start is rejected unless `currentRoundAcknowledged` is true (`Controller:802–813`). A fresh controller receiving a legitimate password-first target has no native current round and can never reach prepare, contrary to ADR0020's explicit password-first link path. Conversely, an acknowledgment sets a single bool (`625–631`) without flow, grant, intent or provider binding. `teardown` and `hostEpochRetired` leave it true (`644–659`); target starts do not clear it (`567–569`). A different target, or multiple target starts, can pass on an earlier acknowledgment. The test itself switches the target from Apple in the current context to Google in the next context (`Tests:247,263–275`) and treats acceptance as success.

The supplement also confirms the actual target producers do not reach this native gate: `startPasswordStepUpLink` calls `signIn` and redirects directly to the provider (`Credential Actions:430–438`), and `continueTargetLink` does the same (`543–551`). Neither branches to the native target relay based on capability. Only current-provider start has the native branch (`273–288`). Consequently both requested target routes still use embedded Web OAuth; merely fixing the native bool would not complete them.

**Minimum correction and check:** Model the gate as an acknowledged, immutable continuation bound to the exact operation, grant, target provider and lifetime; clear/retire it on all relevant lifecycle transitions and consume its entry permission deliberately. Allow password-proven target entry only through the real server-sealed password continuation, not a fabricated native ACK. The backend remains an authority backstop; these findings do not claim a backend authentication bypass. Test fresh password-first entry, wrong provider/grant/flow after ACK, two target clicks, and target after host/account retirement.

Accepted repair clarification: a native current-provider round requires its own same-flow pending ACK. A fresh password-first target instead enters server prepare, which verifies the existing sealed Web password step-up and grant. That path must not require a native current ACK that never existed; removing that inappropriate client gate does not remove backend proof requirements.

## P1-7 — Continuation teardown and WK cancel can still claim false cancellation

**Observed:** `mutationPossiblyDispatched` is true only in `.consuming` and `.awaitingAck` (`Controller:549–552`), but a pending consume receipt moves directly to `.awaitingPassword` even before ACK (`621–623,932–955`); `.awaitingAck` is never entered. During held ACK, the normal password form, or a later uncertain password completion, window close/timeout/host change can therefore classify the operation as unused cancellation (`1069–1086,1092–1107,1215–1233`). The held-consume case fixed since r27 does not cover these phases.

Cleanup also loses the captured attempt before deciding what to cancel: `state.teardown()` clears it (`644–650`), then `cancel` reads `state.attempt` (`1072–1078`). Before a continuation exists this sends no paired cleanup at all. With a retained old flow, cleanup may instead address that old flow. After local teardown, the ambiguous button can call Check Result with no usable context and perform no action (`Host:160–165`; Controller `1119–1130`).

Web's WK cancel branch ignores `cancelled.status`, catches authoritative HTTP failure, clears the continuation anyway and returns `desktop-auth=cancelled` (`Cancel:88–102`). A backend `consumed` or failed cancellation therefore still produces the cancelled presentation path. The system-browser branch checks the status correctly, but that does not fix the WK branch.

**Minimum correction and check:** Track possible effects across the entire credential flow, including the ordinary form; distinguish unused-grant cleanup from a dispatched or committed mutation. Capture immutable cleanup authority before local retirement, and never derive cancellation truth from local cleanup or a failed backend request. On verifier/window loss, show a truthful non-secret unresolved outcome with a usable exit; do not offer a no-op paired retry. Test window close during held pending ACK, during a lost password completion, after target result, and real WK cancel responses `consumed`/HTTP failure.

## P1-8 — Target start renews the deadline; server deadlines are not applied

**Observed:** Every `start`, including target, assigns `now + 300` (`Controller:816–817`), and `begin` overwrites the retained deadline (`554–566`). The parsed receipt deadline (`478–491`) is never applied. Web defines `receiptDeadline` (`Receipt:95–100`) but none of these route consumers includes a deadline in its receipt. A target started near the end of the original flow therefore receives a fresh native lifetime instead of the earliest frozen original proof/flow deadline.

There is also a demonstrated producer/parser mismatch once the deadline is included: the parent probe supplied a normal JavaScript-style `2033-05-18T03:38:20.000Z`, and the native `ISO8601DateFormatter()` at Controller `480` rejected the whole receipt. Current routes omit the header, so this is a verified contract defect that must be corrected when propagating the missing deadline, not a claim that current successful Web routes already emit it.

The new timer survives retiring the browser and `checkDeadline` is now executable, which is an improvement over r27. However, `deadlineTask` is never assigned the task created by the scheduler (`Controller:710,736–742,1202–1209`), and scheduled callbacks capture no generation/epoch. Those are unproven lifecycle/cancellation properties, not evidence that an old timer has already changed a new account. The definite P1 is deadline renewal/omission and the incorrect continuation-expiry classification described in P1-7.

**Minimum correction and check:** Freeze and propagate the earliest authoritative deadline at prepare/continuation, apply only an equal or earlier receipt deadline, and preserve it across target/result/ACK. Give scheduled work a cancellable, generation-owned lifetime. Test current starting at logical 1000, target at 1290, then expire the original 1300 deadline; also supply a shorter server deadline. The test named `NeverRenewed` (`Tests:281–308`) currently tests only one attempt through consume and cannot establish target behavior.

## Comparison with r27 and evidence that did improve

| r27 finding | r30 source-level assessment |
| --- | --- |
| Normal Settings return retired before ACK | Success now uses headers and an explicit return. Not fully closed: capable failure redirects (`Consume:91–125`) still retire retained authority through Host `205–207`, while the new response/cancellation path has P1-2. |
| ACK dispatch treated as acknowledgment | The target bool now waits for a receipt in the happy path. Pending pairing deletion, semantic validation and committed ACK remain P1-2/P1-4. |
| Second generation reset to 1 | Closed narrowly: one state generation and real navigation registration are used. The new tests retain returned fake navigation objects. This does not validate the actual WK response-object path. |
| Result method disconnected | The recovery button now calls `checkResult`, and nested ObservableObject changes are forwarded (`Host:118–122,154–165`). End-to-end recovery remains P1-4/P1-5/P1-7. |
| No consume deadline | The original deadline is assigned and survives browser retirement. Target/authoritative deadline and continuation expiry remain P1-8/P1-7. |
| Held-consume window close claimed cancellation | Closed narrowly for `.consuming`; held ACK and subsequent form phases remain P1-7. |
| Bare ephemeral flag ignored | Closed at source level and by the parent subprocess probe: the real Host calls `fromProcessInfo()` (`Host:95–101`; Controller `27–32,40–42`); no flag returns false and the bare flag returns true. No persisted preference is read by this production path. This is not an actual AS browser cookie-mode test. |

The strict custom callback parser, source-and-target main-frame entry checks, captured AS callback generation/epoch, and strong browser/anchor retention remain present. No verifier/token/password was found in the new request-reference metadata channel. This is not permission to publish capability version 2 as fully supported: Host `386–402` still advertises it while the receipt/recovery chain above is incomplete.

## Test interpretation and minimum next evidence

These tests use the production controller and real returned fake navigation tokens, an improvement over r27's nil-loader tests. They are still not the actual Host/Web consumers:

- Receipt tests pass `ObjectIdentifier(loaded.navigation)` (`Tests:256–272`), which the actual response callback cannot provide. They omit intentional response-cancel failure delivery.
- The target test accepts a different target provider and does not prove password-first entry, same-grant transfer, second target, or stale ACK/gate retirement.
- The recovery test (`373–399`) stops after sending a Result POST. It never delivers pending/committed Result, ACK, cookie loss, or a normal password form response.
- Deadline coverage now advances time, but only through one consume; it does not test target renewal or a shorter authoritative deadline. Window teardown covers preparing/consuming only.
- The frozen native tests do not call Web's reference validator or actual cookie/ACK consumers, so generated underscore references and pairing deletion cannot fail them.
- This reviewer did not run the Pi native suite or independently validate a whole-app build. The parent's six-case controller probe is separately assessed below; its executable exit and one passing sequence do not override its five failed assertions or the source findings.

Before claiming closure, the narrow necessary evidence is: real Host response/failure sequencing; actual Web routes with held-response A/B cookies and pending-versus-committed ACK; actual password-first and post-password-completion recovery consumers; and a current→target transition retaining the original deadline. Broader unrelated tests are unnecessary for this review.

## Parent-executed r30 probe: independent assessment

The parent compiled the exact Controller with `r30-probe/WorkspaceOriginExact.swift` and the corrected `r30-probe/ParentNativeProbe.swift`, then ran it at `2026-09-25T04:04:51Z`; the final build/launch binding is timestamped `2026-09-25T04:06:06.672493+00:00`. I read the harness, current case receipt and build/launch receipt and verified every artifact hash listed by the final binding. The earlier inspection independently confirmed that the unchanged WorkspaceOrigin excerpt is byte-identical to the struct in the r30 Host. Compilation exit 0 and one unused-variable warning are parent-reported. No probe was rerun by this reviewer.

The harness keeps navigation and response NSObject tokens alive separately and uses actual Foundation `HTTPURLResponse` objects. It models the Host's distinct response identity, avoiding the product tests' fictitious navigation identity. Start, pending and consume positive controls precede the assertions. It substitutes the browser and scheduler and does not run WK, HTTP, Auth.js, a backend, provider UI, real cookies or persisted preferences. Optional date headers are deliberately omitted from later controls to isolate their independent state defects.

| Case | Recorded result | Supported interpretation |
| --- | --- | --- |
| JavaScript fractional deadline | FAIL: accepted=false; last request remains consume | Confirms the native `.000Z` parsing defect in P1-8. |
| HTTP 500 with distinct response identity | FAIL: consuming; recoveryExists=false | Confirms the real Host identity mismatch in P1-2 at the controller boundary. |
| Target after confirmed current ACK | FAIL: deadline extends by 120 seconds; second navigation owned=true | Confirms P1-8 and positively distinguishes the repaired second-generation ownership from the renewed deadline. The pre-ACK start is correctly blocked. |
| Target committed consume | FAIL: inactive; no final ACK; retainedFlow=false | Confirms premature final retirement in P1-4. |
| Pending consume/ACK, Result, committed ACK | PASS: Result is dispatched with a verifier and final committed ACK clears the context | Establishes that this controlled-header sequence is executable. It does not exercise the real Web ACK deleting pairing, real continuation installation, or result-pending recovery. |
| Cancel unused authorization | FAIL: zero new requests; last request remains prepare | Confirms the lost cleanup attempt ID in P1-7. |

The final passing case explicitly sets `intent = .setPassword` and `targetProvider = "password"` before starting the round (`ParentNativeProbe.swift:83`), matching its `continue-password` receipt. The initial wrong-context receipt is preserved separately as `r30-probe/before-correct-password-context-receipt.json` and is not acceptance evidence. The final receipt's evidence dictionary is captured before closure (`86–87`), but the harness also asserts the committed Result, dispatched ACK and final committed-ACK closure at `89–92`. The corrected run still records five failures and one pass. This supports a coherent native password-context sequence under controlled headers; it does not prove real Web pairing, password completion, WK transport or provider behavior.

Separate compiled subprocess launches were rerun after the fixture correction and returned `actualHostProcessPath=false` with no flag and `true` with `--desktop-auth-ephemeral`; both exited 0. This closes the prior launch-reader P2 at the measured entry point only.

```text
630f6271fd764a61ae70247029b23b7b58830b94d2a796c0364bfaf09de8b5e6  r30-probe/ParentNativeProbe.swift
d25255b74c6c7761d4c058f3ed42c968bea7a2dbee6f66ff0cfe0c477379d98d  r30-probe/WorkspaceOriginExact.swift
db35fb52c3e959efd753b27cdf80cdfd24d2552e348ea7e14ab455a5bc9b9f5f  r30-probe/native-controller-probe
21b6cb20568ade0a4d20bca98c48cc8698945a409b44c80436c3e3d7c5ef9d65  r30-probe/native-controller-receipt.json
dca67fb2007b4c79e54a6ff3503f61c01bd73810d1c164022722b9e7e8699b1e  r30-probe/native-controller-build-launch-receipt.json
69c77c529f3565f8ac5d052653c475e3f87437c45878a65aa9e4f68ef99d52e7  r30-probe/runtime.log
```

## Source binding

All hashes below were checked against the immutable manifest; the complete 94-file manifest is authoritative for omitted unrelated files.

```text
ae0eeb43b081390eb06cfea3a21558d4eec13850224775ce20b7c528a6f2a007  apps/macos/Sources/Services/DesktopAuthenticationSession.swift
934a711dc1fb67b82125ee338196dcf29a6a7fd2a6ae2bd75e48a20fd046498a  apps/macos/Sources/Features/QuietWorkspaceView.swift
8432aa50af6cffefb5017a40c000131796c09fbff41b65a546de55b68f4b4814  apps/macos/Tests/DesktopAuthenticationSessionTests.swift
06a78aac462d35f2e4879dfd92e13ceaba0309c200515e4ee8e4fb01b7750804  apps/web/lib/server/desktopReceipt.ts
d2ad843bcd294ca74815db430860ce0aafc53da21b7d28dd13955332bef259f9  apps/web/lib/server/desktopAuth.ts
0043c25651645291e592e8e60a6dbf5e004f284d8f1d0af332b9dd5dc6f8c38a  apps/web/app/api/desktop-auth/prepare/route.ts
28f2a49d30a4e906407ae515e35e2653792e7170be7dbd6859918712493bba58  apps/web/app/api/desktop-auth/consume/route.ts
dae7a4b3cfd80bdc780bd171800c69e9c63ef8dbf2ad30068b99ff37d7e3561c  apps/web/app/api/desktop-auth/result/route.ts
8328a32916206b511d8031576dfd874fa3f8ce8f10543abf0e50241a727735c4  apps/web/app/api/desktop-auth/ack/route.ts
b8a1579028d2647f28db303bf7bdf4d2f1b6b4edb7365b8ebcb4f8a8279a115b  apps/web/app/api/desktop-auth/cancel/route.ts
```

Supplement binding, separate capture:

```text
b6d9f1d96b6ae4efc8253390d930fd9a894b62307d110c65279d60a9d8020816  macos-pi/native-web-r30-supplement.json
9148a6191f10b2efc2a5c20567b51a503306d12b721574f7f2a8217be0e1e163  r30-web-supplement/apps/web/app/workspace/settings/login-methods/actions.ts
1f2779dbf8c1782f024fcf02c7f1aa70a55dcf67189c096f84fadf0c6d934dab  r30-web-supplement/apps/web/components/settings-workspace.tsx
904027f4422065d29b13fd0832afa34b37c883ccb46e1cd85e311586febf00bf  r30-web-supplement/apps/web/lib/server/loginMethods.ts
```

Reference-document hashes at review:

```text
e3572027326237cb5110479714be8b3d5a9aab643cecab352dab34032a5c916b  /Users/cubxxw/data/talent-signal-account-sync/docs/decisions/0020-macos-credential-proof-rounds.md
439fe4d1d8ed41d907898d6cd01c886d0358bbb066fdc12a92fab3a09432d6fd  /private/tmp/ai-test-account-sync.umqxBi/parent-macos-manual/wk-receipt-boundary/review.md
```
