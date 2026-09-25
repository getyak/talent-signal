# r36 native/Web production wiring review

**Verdict: not ready. Five P1 repair groups remain in the frozen final candidate.** The new registry is not connected to the real WK host. Actual primary-login Actions swallow successful Next redirects. Current-to-target native exchanges borrow the previous round's authority. Native request refs disagree with the Web validator. The real WK failure delegate does not forward the information required by the controller's intentional-cancellation handling.

This review is scoped to production wiring and its immediate contracts. It does not review the moving Pi checkout, repeat the backend clock review, or claim live Apple/Google, WK, full-app or restart acceptance. No product files, database, installed preferences, default registry, native app or Simulator were changed or initialized. The only executed work was an explicitly authorized task-owned Web probe; the parent independently compiled and ran the native probe described below.

## Frozen source and evidence

- Source root: `/Users/cubxxw/.codex/worktrees/account-sync-ready-r36/talent-signal`.
- Final HEAD: `3aa05014f1b1d1d65d261e3df4a735c6d87a88ad`, clean. The change from initial `ee9ef2fa06e533eccca457c37bcf6a2df05149d0` added the architecture-checker file; reviewed native/Web files did not change.
- Manifest: `/private/tmp/ai-test-account-sync.umqxBi/macos-pi/ready-r36-snapshot.json`, SHA256 `08dfcdc02926e9c9b738fb07477ac6290cd33243b4d0117294608e1a97e895cc`.
- All **1,234 manifest files match**, checked before review and after the bounded probe. Working tree remains clean.
- Full source/artifact hashes and command binding: `r36-primary-login/review-binding.json` in this evidence directory. Key hashes are repeated below.
- Design: frozen `docs/decisions/0021-primary-login-store-ownership.md`, with ADR0019/0020 as the existing credential-round contract.

## P1-1 — ADR0021 is a disconnected helper; the actual WK cookie store never rotates

**Production evidence:** `PrimaryLoginStoreRegistry`, `LoginStoreLease`, and `LoginSingleFlightGate` have no production callers outside their definition file. `WorkspaceBrowser.init` constructs `WKWebsiteDataStore(forIdentifier: origin.dataStoreIdentifier)` directly (`apps/macos/Sources/Features/QuietWorkspaceView.swift:88–102`) and loads the entry URL immediately (`129`). Root SwiftUI identity is only `.id(origin.url)` (`590–592`). Its real controller receives no store selection, epoch or lease. There is no native caller of `/api/desktop-auth/status`; a login consume receipt immediately calls `settleFinished` (`DesktopAuthenticationSession.swift:1080–1081`).

**Trigger and consequence:** leave a primary-login/session-cookie writer A unresolved, then enter primary login B from the same origin, another retained host or after restart. Both use the same deterministic jar. No journal/lock is consulted before password/provider UI exposure, no old host is retired, and no exact-store authoritative actor readback resolves the entry. Native generation guards cannot prevent an old HTTP response from changing cookies in that same jar. This is precisely the boundary ADR0021 was accepted to close.

The helper also cannot yet satisfy the durable authority contract merely by adding a caller:

- Missing journal is always an empty first-install journal (`PrimaryLoginStoreRegistry.swift:112–115`). There is no separate durable initialization marker. `adoptExistingStore:163–175` can therefore re-adopt the legacy jar after loss of an initialized journal, contrary to fail-closed recovery.
- Directory open/fsync failures are ignored (`152–156`) even though the API then reports persistence success.
- `markUncertain:234–240` and `markResolved:244–251` compare only store/epoch, not the held immutable host/operation lease. A value with the same store/epoch and a different host/operation can change the marker. `canExposeLoginForm:214–216` compares the stored operation to itself, not to a requesting host's captured lease.
- `beginPrimaryLogin:182–202` unconditionally replaces the selection and held lease. The API has no requesting-host parameter or check distinguishing a permitted explicit new entry from a hidden host attempting another operation. A shared coordinator must make that ownership decision before granting a new lease.

**Smallest complete repair:** place the production browser construction and login-entry decision behind one application coordinator. Persist the selected UUID/epoch and unresolved lease before exposing either method; keep credential settings rounds on their original WK store; retire every superseded host/controller; include store/epoch in SwiftUI identity; bind status readback to the exact lease/store and expected actor. Repair missing-initialized-journal, durability-error and full-lease checks in the same slice. Do not clear/copy cookies or replay a prepared POST into a replacement store.

**Required acceptance:** exercise the actual host factory with task-owned roots: held A then B, hidden second host, second process lock, unresolved restart, missing initialized journal, directory-sync failure, forged host/operation with matching store/epoch, and correlated same-store status readback. Existing registry tests only instantiate the helper (`PrimaryLoginStoreRegistryTests.swift:16–20`); their comments about form exposure do not construct a real WK host. The restart test only reads a marker (`104–115`), not replacement-host selection.

## P1-2 — the real primary-login gate swallows successful redirects and poisons later entry

**Production evidence:** `apps/web/lib/server/loginSingleFlight.ts:23–28` treats every thrown value as an uncertain outcome and stores the key in a process-global set. Normal Next redirect control flow is thrown. `signInWithPasswordAccount` rethrows that successful redirect (`app/login/actions.ts:138–153`), then the newly used wrapper converts it into an unconfirmed error (`95–113`). Google/Apple inner Actions explicitly rethrow `NEXT_REDIRECT` (`267`, `290`), but their outer wrappers swallow it and return `undefined` (`251–256`, `274–279`). There is no production caller of server `clearLoginUncertainty`.

**Dynamic evidence, 05:39:00Z:** the task-owned `r36-primary-login/primary-login.test.ts` runs the actual frozen Actions and `loginSingleFlight`. It uses the real installed Next `redirect`, `getRedirectError`, and `isRedirectError`; the AuthError adapter re-exports the real installed class. It does not invent a `NEXT_REDIRECT` digest or replace `next/navigation` with a no-op.

| Case | Observation |
| --- | --- |
| Real Next redirect baseline | PASS: real redirect throws a recognized redirect with the expected destination. |
| Password success redirect | FAIL: the exact valid 303 success object is not propagated; the Action returns `unconfirmed: true`. A synthetic recorded cookie side effect occurs first. Retrying calls signIn only once and returns blocked. |
| Google success redirect | FAIL: actual Next redirect to the prepared synthetic provider URL is swallowed; Action returns undefined; retry remains blocked. |
| Apple success redirect | FAIL: same result as Google. |

The cookie side effect is **controlled, not a live cookie/backend write**. Its ordering matches installed NextAuth `lib/actions.js`, which applies returned cookies before throwing its redirect. The probe proves the actual wrapper loses that completion signal; it does not prove a live account login. The initial run could not import the unrelated NextAuth server adapter under plain Node and executed zero tests; that setup failure is preserved separately as `before-next-auth-adapter.log`, not counted as product evidence.

The same gate slice has two additional source-confirmed wiring errors:

- Server keys use a process-global identifier or provider-plus-redirect target (`actions.ts:100`, `252`, `275`), not an authenticated browser/lease. Different visitors can block each other; alternate methods use different keys and are not mutually exclusive.
- Client `beginLoginSubmission` is called only by the password/registration form (`components/account-access-form.tsx:75–80`). `OAuthSubmit:9–13` only observes render-time pending; native handoff anchors have no gate (`desktop-auth-handoff-links.tsx:49–55`). Registration acquires the same gate but only the sign-in state effect releases it (`account-access-form.tsx:29–38`), so after registration success/failure the resend/switch-to-login submit is prevented. There is no UI caller of client `clearLoginUncertainty`, despite the recovery copy instructing the user to start again.

**Smallest complete repair:** preserve recognized Next redirect control flow and release the matching gate on known success; scope any server gate to the actual entry/session ownership, not globally to user-input identifiers or destinations. Wire one synchronous client gate to password Enter, registration lifecycle where applicable, ordinary providers and native anchors. Provide a real explicit recovery entry that obtains the new native lease before reopening methods. Do not mark every thrown control-flow signal as unknown.

**Required acceptance:** retain the three actual-Action redirect assertions above, plus simultaneous visitors, rapid password/provider alternate input, registration failure/resend/switch, and a genuinely lost completion response followed by the visible recovery action. Existing login tests import the ungated password Action and mock `next/navigation.redirect` as `vi.fn()` (`app/login/actions.test.ts:26`, `49`); that mock cannot detect this production regression.

## P1-3 — retained current-round context is incorrectly reused for the target round and recovery

**Production evidence:** current consume and ACK retain A in `flowContext` (`DesktopAuthenticationSession.swift:1104–1122`, `1194–1198`). `start(target B)` creates a fresh native B (`909–927`), but `dispatch` automatically prefers A's `flowContext` for **every** exchange (`872–898`), including B's prepare and consume. The body is built from B, while the expected attempt/verifier are taken from A. Response policy then rejects B's correct attempt (`486`).

**Parent-executed dynamic evidence, 05:37:52Z:** `r36-native-probe/Probe.swift` compiles the exact frozen controller and exact WorkspaceOrigin excerpt. I independently confirmed the excerpt is present byte-for-byte in `QuietWorkspaceView.swift`. It sends real Foundation `HTTPURLResponse` values through `classifyNavigationResponse`, intentional-cancellation marking and `performPendingAdvance`, with a controlled AS browser:

- Fresh password-proven target prepared receipt: PASS, phase `authenticating`, no recovery.
- Actual current prepared → callback → continue-target consume → confirmed pending ACK → new target prepare → B prepared receipt: FAIL. B request dispatches, but its receipt is rejected; phase stays `preparing`, recovery appears, retained context is `parent-current-round`. Original deadline preservation passes.

This is stronger than the repository target test, which bypasses prepare via `acceptPending` and stops after asserting one extra request was loaded (`DesktopAuthenticationSessionTests.swift:251`, `278–280`). A request count does not prove target response acceptance.

Recovery has the same incomplete-context problem. `FlowRecoveryContext` retains no role or intent. After timeout/cancel teardown removes `state.attempt`, `checkResult` can use retained credential A (`1369–1383`), but dispatch assigns role `.login` (`891`); the legitimate current/target receipt then fails role matching (`488`). A committed result's final ACK reads `state.attempt?.verifier ?? ""` (`1149–1155`) instead of the immutable verifier of the result exchange. These paths must not borrow B's verifier or send an empty value after teardown.

**Smallest complete repair:** make immutable round/exchange context explicit: generation, host/store lease, purpose, role, intent, attempt, verifier, flow/grant and target. Prepare/consume bind to the newly created round; result/ACK bind only to their captured recovery round. Transfer the acknowledged flow relationship deliberately when B starts without replacing B's attempt/verifier with A's. Preserve a valid retained context through unknown-result recovery; retire it only after its own committed ACK or truthful expiry policy.

**Required acceptance:** extend the exact parent A→B test through B callback/consume/result/final ACK, then test timeout/cancel followed by successful old result and final ACK, while a newer round exists and while `state.attempt` is nil. Assert actual serialized request bodies and complete receipt acceptance, not helper state alone.

**Related actual Web entry/target blockers:** see sibling `target-r36-review.md` (separately bound below). It independently confirms missing target grant-secret resolution, provider-first target flow rejection, wrong target receipt role, missing target-D ACK context, and the missing visible current→target caller. Native pending ACK returns to plain `/workspace/settings`; that return does not itself call the Action that seals the next target round. Do not treat direct test invocation of `continueTargetLink` as proof of visible native reachability. This review does not duplicate the separate backend/HTTP investigation.

## P1-4 — legitimate native request refs are rejected before every exchange

`DesktopAuthSecrets.random()` is base64url (`DesktopAuthenticationSession.swift:209–228`), and `nextRef:857–859` copies its first eight characters unchanged. Base64url can contain `_`. The actual Web contract only permits `/^[A-Za-z0-9-]{8,200}$/` (`lib/server/desktopReceipt.ts:47`), enforced before backend/cookie effects by `requireDesktopRequestRef:87–110`.

The additional deterministic case in the primary probe uses matching query/header/body refs. `xchg-1-0-1-AAAAAAAA` is accepted; `xchg-1-0-1-AAAA_AAA`, which the native generator can produce, returns actual **400 `DESKTOP_AUTH_REQUEST_INVALID`**. This is not a malformed-equality fixture or random sampling. It affects prepare, consume, result, ACK and cancel, including recovery after a committed effect.

**Repair and acceptance:** agree one bounded alphabet end to end or generate a compatible native ref. Keep exact query/header/body comparison. Feed the production request factory's deterministic underscore-bearing output into the actual Web validator; include no-underscore positive and malformed-equality negatives. Do not weaken attempt/secret validation to solve a correlation-token mismatch.

## P1-5 — normal WK response cancellation is fed back as a failure of the successful exchange

The real response delegate correctly classifies first, marks intentional cancellation, cancels the inert render, and then advances (`QuietWorkspaceView.swift:247–261`). However both actual failure delegates call `navigationFailed` **without the error code** (`372–379`). Its default is zero; the new suppression branch only runs for code 102 (`DesktopAuthenticationSession.swift:1444–1449`). The accepted exchange also remains in `exchanges[navigation]` after classification.

**Concrete trigger:** a valid consume receipt advances to a pending ACK in the same generation; WebKit delivers the expected policy-cancellation callback for the consumed navigation. The host passes zero, so the old consume enters `exchangeFailed` and creates unconfirmed-mutation recovery (`1275–1284`) even while the valid ACK is in flight. A valid prepare receipt similarly starts AS authentication and then can be shown as failed by its own deliberate render cancellation. This consequence is source-derived; a real WK callback sequence was not executed in this review.

Forwarding `(error as NSError).code` is necessary but is not the complete fix: the controller currently stores one global Boolean (`1020`), not the exact navigation/ref it cancelled. A later unrelated code-102 failure can consume that flag. Retire or mark the exact adjudicated exchange and ignore only its own expected render cancellation; preserve genuine failures from the active next exchange and stale-generation fencing.

**Required acceptance:** drive the production host/controller callback adapter through accepted prepare and consume, then the owning navigation's policy-cancellation error, with the next ACK held. There must be no false recovery. Deliver an unrelated 102 and a genuine network failure and verify they remain failures of the correct exchange. Existing tests call the controller directly and do not verify these delegate arguments.

## Other closure boundaries and source observations

- The capable prepare success branch now emits an inert 200 receipt (`prepare/route.ts:187–199`); the prior unconditional-303 success defect is closed in source. The actual-body cancel validator now runs before backend effects (`cancel/route.ts:60–93`), consistent with the parent's separate passing malformed-ref counterexamples.
- Fractional JavaScript dates now parse (`DesktopAuthenticationSession.swift:500–503`). Actual response correlation uses URL/header refs instead of inventing a WKNavigationResponse identity. Committed consume now dispatches and waits for a final ACK (`1123–1141`, `1192–1193`) in the simple happy path. These improvements do not close the context, host or Web target failures above.
- Strict receipt closure remains incomplete: known expected flow/grant are only compared when the response also supplies them (`489–494`); missing fields are accepted. Allowed outcomes are selected only by exchange kind (`518–530`), not purpose/role/intent/phase, and MIME uses `hasPrefix("text/html")` (`469`). These are explicit contract gaps to fix/test in the same transport slice, not a separately demonstrated attacker-controlled exploit here. Require the agreed mandatory context and legal per-operation outcomes. The separate target review already identifies real wrong-role responses.
- Deadline scheduling remains incomplete: an earlier authoritative receipt deadline updates state (`1074–1075`) but does not reschedule the timer; `scheduleDeadline` is only called at start. The default scheduler discards its `Task` handle (`823–828`), so the `deadlineTask?.cancel()` calls do not cancel that task. Existing tests invoke `checkDeadline` directly rather than proving the default timer wakes at the shortened deadline. Keep this acceptance item explicit; no real elapsed-time app test was run.
- Cancel's `consumed` response must not be promoted to proof that a credential mutation committed. The Web emits the attempt's consumed state (`cancel/route.ts:139–148`), whereas native calls `settleFinished` and drops recovery (`1238–1241`). A consumed current-provider proof can still be awaiting the password/target mutation. Include that distinct semantic case in the repaired context/outcome tests; this review did not execute the backend cancel sequence.
- The ProcessInfo launch-options path is connected in the real host (`QuietWorkspaceView.swift:97`). No new flag regression was found in this bounded read, but the previous launch probe was not rerun for r36.

## Test interpretation and remaining real acceptance

The reviewer probe ran **5 tests: 1 positive baseline passed and 4 expected correctness assertions failed**. It must not be summarized as a passing suite. The separate parent native probe has **1 fresh-target positive pass and 1 current→target failure**. The parent's prior controlled-consumer/password-HTTP successes and the independent full-target failures exercise different boundaries; do not flatten them into an aggregate pass rate.

Pi's reported 176 native tests / 0 failures / 5 skips do not demonstrate registry-to-host integration, real Next redirect behavior, actual WK cancellation callbacks, or the complete target round. I did not rerun that suite. Its helper tests and the production bypasses above explain why a green helper suite can coexist with these counterexamples.

Before final readiness, the repaired production composition must prove: rotation before every primary method's form/proof exposure; real multi-host/restart/lock recovery; successful primary password and provider redirects; current→target entry through visible UI and complete target ACK; unknown-result recovery with the original context; and actual WK/system-browser cancel/offline/timeout/window-close behavior. Live Apple/Google and full-app actor readback remain parent-owned acceptance. No such outcome is claimed by this report.

## SHA256 bindings

Paths below are relative to the frozen source root or this report's evidence directory, as indicated. `review-binding.json` includes all reviewed source and probe hashes, command, exit code and clean-tree readback.

| Frozen source | SHA256 |
| --- | --- |
| `apps/macos/Sources/Services/PrimaryLoginStoreRegistry.swift` | `d8bde7c35533387aa97399e00f0a0e2f621db54b1c2a644f91ebf04e184e8218` |
| `apps/macos/Sources/Features/QuietWorkspaceView.swift` | `abd2a8947288e2f4c4a3bd810353cfe114004999bc445bb43aa741cc090bf632` |
| `apps/macos/Sources/Services/DesktopAuthenticationSession.swift` | `d70fdab30cee7037535f221bde182649467e4d3561176561c1d576ecbfc111c0` |
| `apps/macos/Tests/PrimaryLoginStoreRegistryTests.swift` | `1c7f4d58eff33137b4b6adc04203ba48f23d3453be733d50b7f5cb182544228f` |
| `apps/macos/Tests/DesktopAuthenticationSessionTests.swift` | `ca9b1f2b4eded3d98d3b400bec2bbe1e44fc197e340ed308fa400f1f136bcf9c` |
| `apps/web/app/login/actions.ts` | `97118b25d88266a11ba5c5a72f9fa10f98d329fcc2874b25ac8437005fe05bd2` |
| `apps/web/app/login/actions.test.ts` | `298580a3d04689863d6e0eb5a5fe7c81334f0b64f14fd354a7fa61d5ee42a1b7` |
| `apps/web/lib/server/loginSingleFlight.ts` | `462397effefa36462bec99f644ee3b14c5d50bf9aed03b5f59e3093813712395` |
| `apps/web/lib/loginSubmitGate.ts` | `07c6e4206929c6ff922d13d48984ca95ace5071c9b9aaa878b39a2f529e3b783` |
| `apps/web/components/account-access-form.tsx` | `a044cb2a811b42c1f2a52600e4e702ccd89f462b9ea18a0ab7b028e422864602` |
| `apps/web/components/oauth-submit.tsx` | `b13c3c14a373cd4c05c9e53e0b8c33fa394cae6348bae4d765f5453829d86877` |
| `apps/web/components/desktop-auth-handoff-links.tsx` | `7ef61b0392d93d7145d315f23bad771d4674f465fb5488c5ba71a5ee7aa87782` |
| `apps/web/lib/server/desktopReceipt.ts` | `0758745a888839a133a27752762799b343657cda3fc6277d7b4947b36c926841` |
| `apps/web/app/api/desktop-auth/cancel/route.ts` | `f259e002b6469da9fa8606bcb96c9f5902180355a8d84780927a2c589e685be5` |
| `apps/web/app/api/desktop-auth/status/route.ts` | `2327b9af2d0082a193c2ab1294d14055c4852aeae9907074e36d7916fb0c65fe` |
| `docs/decisions/0021-primary-login-store-ownership.md` | `d9807d1507fffcca8c3923c0069aa519305e81e576ee2f79e70c85ddb4486735` |

| Evidence artifact | SHA256 |
| --- | --- |
| `r36-primary-login/primary-login.test.ts` | `8ce113521db8e69a2d71d186051b87380c90aa5e449f8756ef352e02e7475db5` |
| `r36-primary-login/primary-login.config.mjs` | `7feb7f79b5c9d2254fd38d612ef42dc66ab90a3e12529f774585727a3af0cf87` |
| `r36-primary-login/primary-login.log` | `c3b768e5b2d8ebabde030af70c926a154ef44da672beca59b8dd965f903b1f11` |
| `r36-primary-login/primary-login-receipt.json` | `4228c3c91d0c8efb982cfdbf118c8601c605aeacd8494103828bded9cc3c3e0b` |
| `r36-primary-login/before-next-auth-adapter.log` | `0c9d680415be7e1fbfc71a840d78700580a91c6ecc90d308e5fc512b8e9d3682` |
| `r36-native-probe/Probe.swift` | `714309c8b98eb6ef85e2bc089f0f745f13d21f82feac84a9c1196698f6ea17cb` |
| `r36-native-probe/WorkspaceOriginExact.swift` | `d25255b74c6c7761d4c058f3ed42c968bea7a2dbee6f66ff0cfe0c477379d98d` |
| `r36-native-probe/receipt.json` | `49231e21651455613657335bd309907373c62b169c957c7490942f5655836c4c` |
| `r36-native-probe/build.log` | `532ca27f1b3a947a90c30b7aabd6b83edd08c9111926efa985c8979361826a91` |
| `r36-native-probe/run.log` | `799fa4575264ab762c17ea205a197c3f4cf486cd0786d28bef7b268368371b5b` |
| `r36-native-probe/probe` | `792eacc1b84f6e539f2cc05784a755232ea6b41ad1b912b3ff717b0040421027` |
| `target-r36-review.md` | `ddfff2053de3b076e8bd32bc19336429597b41d2382ef1651e5242f7c83ae371` |
| `r36-primary-login/review-binding.json` | `734ad393d42d3b246cfc518fb85ec8ce72eb3d38cfdf48a30a59d90c7c6a9b29` |

Installed dependency semantics: Next `redirect.js` SHA256 `52efee4a04852fbfeb0a5160bd057d527055b8de5bc5224ded0f63425cf8ae20`; actual `@auth/core/errors.js` SHA256 `5bbf15f3c7c59e6e62397474c133851e6048524eb0dcab6e87d71f44bce26fb4`. These are local installed dependency evidence, not additional frozen product files.
