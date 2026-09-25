# Native r27 snapshot review

Conclusion: This candidate snapshot has 6 concrete P1 findings, 4 independently reproduced by the controller probe, and 1 launch-argument P2 finding. It does not establish completion of the current → continuation → backend ACK → target flow required by ADR0020. No P0 is confirmed. This is an in-progress implementation snapshot from Pi turns 343–360, not a ready or final candidate; this report makes no claim about Pi's subsequently changing implementation.

## Scope and snapshot verification

- Only source read: `/private/tmp/ai-test-account-sync.umqxBi/parent-macos-manual/r27-source`.
- Manifest: `/private/tmp/ai-test-account-sync.umqxBi/macos-pi/native-r27-snapshot.json`; capturedAt `2026-09-25T03:22:11.724075+00:00`.
- Independently verified every manifest entry before and after review: **61 files, 0 mismatches**.
- Manifest SHA-256: `66d37f66ea9abe8e0dd456c6e55bec46f252aaad363a66bbd4f619ff4ef8d3b8`.
- Reviewed accepted ADR0020 from parent checkout, SHA-256 `6724740e44036382b24b5cf0df220c13a0b4ef2ae0c68311215f210955a35b8c`. ADR0019 snapshot is background only.
- Did not read moving Pi product files, edit product/tests, run a build/test, launch an app/Simulator or access providers. Backend/Web correctness remains the other reviewers' scope. HTTP examples below are inputs the native host must handle, not claims about the current moving Web server.

Paths below are relative to the snapshot root. `Controller` means `apps/macos/Sources/Services/DesktopAuthenticationSession.swift`; `Host` means `apps/macos/Sources/Features/QuietWorkspaceView.swift`; `Tests` means `apps/macos/Tests/DesktopAuthenticationSessionTests.swift`.

## P1-1 — Normal fixed return navigation retires the attempt before ACK

**Observed:** Host `:184–186` retires the host epoch for an active main-frame navigation whose URL is outside `isHandoffOwnedNavigation`. That helper (`:310–324`) lists protocol routes but excludes `/workspace/settings`, `/workspace` and `/login`. Those same routes are the accepted terminal paths at `:327–330`. Controller `:791–796` then calls `retireHostEpoch`, whose implementation at `:500–504` deletes the attempt/verifier and makes the operation inactive.

**Trigger / consequence:** A normal consume redirect to `/workspace/settings` passes through `decidePolicyFor navigationAction` before `didFinish`. The former retires the operation, so Host `:302` later sees no active attempt and cannot dispatch the ACK. Normal login return and prepare-error return have the same early invalidation. This is a concrete contradiction within the native host's two policies; the actual route response must still be verified by the parent.

**Minimum correction:** Track a generation- and phase-owned navigation/redirect chain. Allow its exact fixed terminal routes without retiring the operation; retire an unrelated navigation to those same URLs. Adding all Settings/login URLs to a global allowlist would instead reintroduce stale-page/account behavior. Use one navigation policy for action, response, finish and failure.

**Required test:** Drive the production host policy through prepare navigation → pending → consume POST → 303 Settings redirect → didFinish. Assert that the original verifier is retained and one ACK is dispatched. Also prove that an unrelated user navigation to Settings does retire the active browser round.

## P1-2 — ACK dispatch is treated as ACK confirmation, and target is not gated

**Observed:** Controller `:824–830` accepts only the Settings URL, calls `acknowledgeContinuation`, then immediately calls `state.finished()`. That clears the retained attempt/verifier before the ACK receives any response. It neither checks purpose/role/phase nor verifies an ACK response. `awaitingAcknowledgment` and `awaitingTarget` are declared (`:158–159`) but never entered. `start` (`:652–662`) can supersede any state, with no acknowledged-current/continuation constraint for a target round.

**Trigger / consequence:** Even after correcting P1-1, let consume return to Settings and then drop, reject or delay the ACK. Native has already erased the only verifier needed by paired result/ack recovery and can start a target. A backend refusal remains an enforcement backstop but does not satisfy the native ordering or recoverability required by ADR0020.

**Minimum correction:** Enter an actual awaiting-ACK phase on dispatch; retain verifier/attempt/generation and original deadline. Finish only after the owning ACK exchange is confirmed successful against an explicit server response contract. Hold the target entry until that current-round ACK is confirmed, then create a fresh native generation/state/verifier bound to the same sealed credential continuation. Do not use a Settings URL, generic didFinish or a display flag as the receipt.

**Required test:** Real controller/host policy with an ACK request held pending: a target click must not start, the verifier must still be usable for result/ACK, and ACK 401/409/5xx/offline must not finish. A verified ACK permits exactly one target round; old current-round response/error/cancel cannot alter it.

## P1-3 — Navigation ownership uses a different generation that resets to 1

**Observed:** Controller has its own `DesktopAuthHandoffState` (`:587`); DesktopAuthHostPolicy contains another (`:526`). Every `start` increments the controller generation but replaces the policy with a new instance and invokes its `begin` once (`:657–660`). Policy generation therefore becomes 1 on every start. Dispatch registers navigations with the controller generation (`:635`); `policy.ownsNavigation` compares them to the independent policy generation (`:560–562`).

**Trigger / consequence:** Start A, then start B (or acknowledge current and start target). B's controller generation is 2 or greater, while policy generation is 1. All B navigation success/failure callbacks fail the ownership check, so the second operation cannot advance or recover through the host. Conversely, policy is not retired when `terminalReached` changes controller state, so it cannot be the authority claimed by its comment.

**Minimum correction:** Keep one authoritative operation generation/host epoch. Navigation ownership should compare its captured context to that controller context; the navigation policy must not create its own attempts, random secrets or independent generation counter.

**Required test:** Return persistent fake navigation objects from the same loadRequest seam used by production. Assert ownsNavigation for first and second operations, current→target, and a post-cancel new operation; assert old object completions are rejected. All current controller tests return `nil` from loadRequest, so no navigation registration or ownership is tested.

## P1-4 — Paired result recovery exists only as an unconnected method

**Observed:** `requestResultRead` (`Controller:834–837`) is called only by a unit test, never by product UI. The only ambiguous-recovery button calls `returnFromDesktopAuth` (`Host:479`), which loads ordinary Settings and immediately calls `terminalReached` (`:144–147`), deleting the verifier without a result or ACK. Retry does the same (`:134–136`). Even manually invoking `requestResultRead` leaves phase `.recovering`; `hasActiveAttempt` is false in that phase (`Controller:394–400`), so Host finish/failure handling ignores that result navigation.

**HTTP boundary observed:** Host response handling (`:226–234`) only rejects selected HTTP errors; it has no protocol phase/content-type/body/receipt interpretation, explicitly allows 401/403, and does not distinguish a protocol error document from a valid result. `didFinish` uses only current page path. Thus native has no implemented result→new sealed continuation→ACK progression or ACK-response verification. A 200 JSON error/body, wrong content type, expired-session response, or transport failure cannot be adjudicated through the required contract. This does not assert that those are the moving Web routes' normal response shapes.

**Minimum correction:** Wire an explicit read-only "check result" action to the retained original attempt/verifier, with a recovering-read/ACK phase and the same owned navigation context. Define and validate fixed response contracts for consume/result/ACK, including status, content type and meaningful success/error outcome; preserve pairing/verifier on retryable failures. A user may leave the screen, but that navigation must not silently convert an unresolved result into successful completion or ordinary cancellation. Ensure controller recovery publications are actually observed by the SwiftUI recovery view: currently it observes WorkspaceBrowser, while reading a nested independent ObservableObject without a forwarded change subscription.

**Required test:** Consume dispatch then response loss; press the actual production recovery action; assert one `/result` POST and zero repeated `/consume` POSTs, original verifier retained, recovered continuation ACKed, and original credential attempt reused. Exercise HTTP 401/403/409/5xx, 200 invalid body/type, and result-response loss. A normal Settings/provider row must never settle unknown password mutation.

## P1-5 — The claimed consume/result deadline is not implemented

**Observed:** `deadline` is declared at Controller `:592` but is never assigned anywhere in the snapshot. Therefore `checkDeadline` (`:854–856`) always returns. The only real task is scheduled for a fresh 300 seconds at start (`:867–874`); successful callback invokes `retireBrowser` (`:732`), which cancels that task (`:859–864`) before consume is sent. No timeout remains through consume, result or ACK. The native path does not retain/use a supplied earlier original flow/proof deadline.

**Trigger / consequence:** Return a valid provider callback, then keep consume pending indefinitely. The controller remains in consuming without a deadline or actionable recovery. Advancing the test's injected clock cannot change this because deadline is nil. If the timer ever handles an uncertain write, its generic cancel path also has the problem in P1-6.

**Minimum correction:** Set an immutable absolute deadline and keep a generation-owned timer through consume/result/ACK. Browser retirement must not cancel operation lifetime. Use the earliest applicable frozen deadline and do not renew it for target/result/ACK. Expiry of a potentially dispatched write must retain an unconfirmed outcome rather than claim it did not happen; retire expired proof authority separately.

**Required test:** Advance an injected clock/scheduler in preparing, authenticating, consuming, result and ACK states. Verify old timers cannot affect a newer target. The existing `testDeadlineRetainsThroughConsumeAndAmbiguousOutcomesStayTruthful` (`Tests:306–335`) neither advances its clock nor invokes `checkDeadline`; it only manually calls consumeNavigationFailed and requestResultRead, so its name is not deadline evidence.

## P1-6 — Window teardown and cancellation relabel potentially committed work

**Observed:** `windowWillClose` always calls `cancel` (`Controller:799–800`). `cancel` clears attempt/verifier, emits a cancellation POST and sets `recovery.ambiguous = false` (`:753–764`) without checking whether consume/result/ACK is pending or was already dispatched. `hostLifetimeChanged` also erases the attempt for any active phase (`:791–796`); it does nothing for a retained `.recovering` phase because isActive is false. The terminal `outcome=cancelled` callback additionally chooses return purpose after acceptCancellation has cleared state (`:737–744`), so credential-round cancellation defaults to login instead of Settings.

**Trigger / consequence:** Submit target consume/unlink, let the server commit but delay its response, then close the window or retire the page. The native path cannot know whether cancellation won, yet classifies the result as non-ambiguous and discards recovery authority. This contradicts ADR0020's explicit possibly-committed window-loss rule. The backend may correctly reject cancelling a consumed result; native does not read that rejection.

**Minimum correction:** Phase-discriminate uncommitted authorization cancellation from potentially dispatched mutation abandonment. Best-effort cleanup must never itself establish "cancelled". On window/verifier loss, retain only a safe non-secret unconfirmed-operation marker where needed for subsequent UX; require fresh proof for unused orphan grants, and never repeat an uncertain mutation. Retire host epoch even for retained recovery state. Use the captured closed attempt's purpose for cancellation return routing.

**Required test:** Close/navigate/origin-switch before consume, during held consume, after simulated commit with lost response, and while retained result recovery is open. Validate false success/cancel claims are absent and no stale callback/request can run against the next window/account. Existing window test closes during authenticating, not during a potentially committed stage.

## Improvements and non-P1 evidence boundaries

- Source AND target frame checks are now passed by the real host (`Host:158–164`); same-origin iframe→top entry is explicitly tested. This closes the earlier source-frame omission at source level.
- The AS browser callback captures generation/host epoch and hops to MainActor (`Controller:672–680,701–705`); stale A→B errors are fenced. Browser start Bool is now handled. The system ASWebAuthenticationSession and anchor provider are strongly retained during the round. A malformed current callback still falls through without immediate recovery; the deadline fixes above remain necessary.
- Success/cancel callback parsing rejects fragment/trailing slash/userinfo/port/duplicate/empty/unknown fields. Fixed prepare/consume/result/ACK request factories keep raw verifier in native memory/request bodies, not metadata or DOM. Raw state is intentionally transported in the fixed first-party authorization/pending/custom callback URLs for state validation under ADR0019; this is not a bearer/provider credential. No arbitrary script credential bridge or cookie copying was found.
- The normal ephemeral preference value is false (`:18–19`), and an injected true value reaches the ASWebAuthenticationSession property. The actual production launch-reader mismatch is now dynamically confirmed as P2 below; it is not a demonstrated P0/P1 account-data bypass.
- Native publishes authProtocolVersion 2 unconditionally (`Host:356–362`) although the ACK/result/target chain above is incomplete. `credentialRoundProtocolVersion` is declared but not published. Capability/version acceptance must wait for the complete native consumer; the constant alone is not coverage.
- Same-origin cookie/account changes still have no explicit native observer in this snapshot. Do not claim cross-window account lifecycle coverage solely from tests that call hostLifetimeChanged manually. Backend scope/fingerprint enforcement remains necessary and is outside this review.

## Test interpretation

The snapshot is in progress and contains no verification receipt establishing Pi's new native test suite passed; no tests were run by this reviewer. The parent subsequently supplied the independent failing controller probe assessed below. Specific false-confidence risks:

1. All controller tests supply loadRequest returning nil, leaving the real navigation registry entirely unused.
2. The late-browser-cancellation test (`:186–227`) is synchronous: `deliver` schedules a MainActor Task, but assertions run immediately without awaiting its processing. It can pass before the delivered callback is checked. Use an explicit completion gate rather than only an arbitrary yield.
3. The deadline test never advances/checks its clock; the terminal test (`:363–384`) calls terminalReached directly while authenticating, rather than proving a backend ACK.
4. No production current→consume→ACK-confirmation→target or held-ACK recovery test exists in this file. Pure enum/URLRequest assertions cannot close these integration requirements.
5. HTTP response and UI lifecycle methods in WorkspaceBrowser are not exercised by the tests. New injected seams should be the same reducers/policies used by the real host, not parallel test-only state.

## Parent executed controller probe — independently reviewed evidence

The parent compiled the snapshot's exact DesktopAuthenticationSession.swift with an extracted WorkspaceOrigin and `r27-probe/ParentNativeProbe.swift`, then executed the probe. I read the complete harness and resulting `r27-probe/native-controller-receipt.json`; I independently compared the WorkspaceOrigin struct against the snapshot and found it byte-identical. The compile log `/private/tmp/ai-test-account-sync.umqxBi/macos-pi/native-r27-compile.log` is 0 bytes; successful compiler exit 0 is parent-reported. I did not compile or rerun the probe myself.

The harness substitutes only a controlled browser factory and NSObject navigation tokens, and exercises the production controller/request factories. It retains the navigation objects in the ownership case, avoiding object-lifetime/reuse ambiguity. It uses positive controls before its failing assertions, and records no verifier/state values. It has no WKWebView, HTTP server, real ASWebAuthenticationSession UI, provider assertion, persistent UserDefaults write or Simulator. Therefore it establishes controller behavior, not a full app build, actual redirect/delegate ordering, cookie receipt or live-provider behavior.

Final receipt timestamp: `2026-09-25T03:28:58Z`. All 4 cases fail as expected from the reviewed source:

| Finding | Actual recorded evidence | Valid conclusion |
| --- | --- | --- |
| P1-3 navigation generation | First navigation owned=true; second=false; controllerGeneration=2; two prepare dispatches | A second real controller generation loses its own registered navigation |
| P1-2 premature ACK completion | Consume positive control; ACK dispatched=true; ackResponseDelivered=false; activeBeforeAckResponse=false; retainedVerifierAllowsResult=false | No backend response is needed for current implementation to clear the native recovery authority |
| P1-5 missing deadline | Injected time advances 601s after accepted pending; checkDeadline leaves active=true, recoveryShown=false | The deterministic deadline check does not enforce an established attempt deadline |
| P1-6 window close after dispatch | Consume positive control; no consume response delivered; windowWillClose dispatches cancel and returns recoveryAmbiguous=false with a message translated as "The window was closed; the operation did not finish." (original text retained in the receipt) | Window teardown incorrectly classifies an already-dispatched, unresolved mutation as non-ambiguous |

The second case directly invokes `consumeTerminalReached(Settings)` after a valid consume callback, isolating P1-2. It does not claim to exercise the host's earlier redirect-retirement defect P1-1; that remains a source-proven host-policy conflict pending real delegate acceptance.

The final fourth case (`ParentNativeProbe.swift:92–106`) uses the same pending/callback/consume positive controls, delivers no consume response, then invokes windowWillClose. I read the final harness and receipt; this now dynamically substantiates P1-6. It does not claim that a real backend committed in this probe—its assertion is correctly that native has no evidence to classify the dispatched effect as non-ambiguous.

### P2 — Documented ephemeral process flag does not affect the production reader

Source: Host `:96` selects `DesktopAuthLaunchOptions.from(defaults: .standard)`; Controller `:27–35` provides a separate arguments helper that production never calls. The existing flag test only validates that unused helper (`Tests:389–396`).

I read the final `native-controller-build-launch-receipt.json` and both raw stdout files. Separate compiled-probe processes show:

| Arguments | Actual production-selected defaults reader | Arguments helper |
| --- | --- | --- |
| `--inspect-launch-option` | false | false |
| `--inspect-launch-option --desktop-auth-ephemeral` | false | true |

This confirms the documented `--desktop-auth-ephemeral` option leaves the actual host-selected value false, so the intended isolated system-browser acceptance mode is not enabled by that invocation. No UserDefaults value was written. Default behavior remains false as intended. Minimal correction: use the same explicit ProcessInfo argument parser in production and tests (or explicitly parse only the intended argument-domain contract), without persisted preference fallback; verify the actual launch path and factory receive true when the flag is present. This is a configuration/acceptance P2, not evidence that real ASWeb browser cookies were accessed or that account authority was bypassed.

Final assessed probe artifact SHA-256 (read back against the final receipt):

```text
40203653579759bee4d73ea32779ac8a13daa93011e8f0ce9e7426160de02711  r27-probe/ParentNativeProbe.swift
d25255b74c6c7761d4c058f3ed42c968bea7a2dbee6f66ff0cfe0c477379d98d  r27-probe/WorkspaceOriginExact.swift
59f2f1e1b1a744b87e115439b272fdd34722d9058fed46fb2f4c04de0b688b53  r27-probe/native-controller-receipt.json
851ec5b58c84a35b49b47adfeca69b36dfffc11e642c84558fc1afe4c44da623  r27-probe/native-controller-build-launch-receipt.json
62c2485937b29249cb3bd79f1b16450cbbb6a7a945649436ea22079304fd560e  r27-probe/launch-default.json
acb6923737659e6f0fe3888328bf27ae10db673bc9a739924f4983d259a2c9a5  r27-probe/launch-with-ephemeral.json
c6f2d6c056e00baaeec6056f174bb69fefc4074aa32e8f42a2c9c9d1e03dc71c  r27-probe/native-controller-probe
```

## Source hashes

```text
0c7045933596d988b75b57b4db7a8bf13743c7431fe9e7c892cb3e6f797bef16  apps/macos/Sources/Services/DesktopAuthenticationSession.swift
894f87551c0ac719e52e1deed08105386411d26412d626ddffb7b847de199045  apps/macos/Sources/Features/QuietWorkspaceView.swift
a399e91909549c31a8c9245111f52885bfff0340a0e5d0e79ed0c80fde37b700  apps/macos/Tests/DesktopAuthenticationSessionTests.swift
c3fb9c2115c27ee9e9b5ecca4f19029e46d1f897f17c127a3f769fd08d8c68a1  apps/macos/TalentSignalMac.xcodeproj/project.pbxproj
```
