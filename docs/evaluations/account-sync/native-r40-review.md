# r40 independent native production-wiring review

## Decision and evidence scope

**Not accepted: seven concrete P1 groups remain; no P0 identified in this bounded review.** The singleton application coordinator is now created, but the real browser path bypasses selection resolution and does not implement the accepted entry/settlement boundary. A new prepare-correlation regression also prevents ordinary native provider login before the system authorization session begins.

Candidate: `cff4946a04df816cbdf0fe1bc52464395baba6c3`, frozen at `/Users/cubxxw/.codex/worktrees/account-sync-ready-r40/talent-signal`. The complete 1,253-file manifest matched both the initial review check and the final check; git status was clean. Manifest SHA256: `1a29769a639ff13b924a1e0309551d41485c529ea6dddc6f96eb98c7059f0353`.

Scope: actual macOS bootstrap, browser/coordinator composition, native round transport and the two corresponding Web receipt producers. No product edits, installed app, WK instance, Simulator, standard registry, installed preferences, live OAuth, or backend mutation were used. The parent owns actual app and HTTP/backend acceptance. Pi's reported 178 native tests and release build were not independently rerun here and do not override the source/probe counterexamples below.

The native inert entry shell and isolated-world status reader are **accepted implementation requirements in ADR0021**, not unresolved design choices. Their admitted absence cannot be deferred as a request for a new architecture decision.

## P1 findings and smallest complete fixes

### N1 — Bootstrap never resolves the persisted selection before constructing a browser

**Source:** `apps/macos/Sources/App/AppModel.swift:225`; `apps/macos/Sources/Services/PrimaryLoginStoreRegistry.swift:513–537,563–590`; `apps/macos/Sources/Features/QuietWorkspaceView.swift:96–144`.

The actual chain is `AppModel.bootstrap → LoginStoreApplication.bootstrapAtLaunch → QuietWorkspaceView → WorkspaceBrowser.init → coordinator.context(for:)`. There are **no production callers of `adopt` or `hostState`**. The coordinator begins with an empty selection map; `context` invents a fresh, unrecorded UUID at epoch 0 on every unresolved call. Browser construction immediately opens that store and loads `/workspace`. It has neither read the selected persisted store nor acquired the registry lock nor resolved an unresolved entry from a prior process. Thus an existing signed-in installation/relaunch does not reopen its recorded cookie jar, and registry damage/another process's lock is not checked before WK construction. The actual UI also maps a nil coordinator to the ordinary connection form (`QuietWorkspaceView.swift:695–714`), hiding the registry failure reason.

The durability helper does not yet provide the accepted missing-journal protection across restarts: `PrimaryLoginStoreRegistry.swift:120–136,145,173` checks an in-memory `initializedOnce`; the `initialized` flag is inside the journal that can go missing. A fresh registry object after journal deletion treats it as first run. Reading an existing journal does not set the in-memory flag either. This is a source-confirmed restart gap, not a destructive experiment.

**Fix:** make bootstrap/host resolution the sole way to obtain a construction context. Under one process lock, load/adopt a first installation exactly once, rotate an unresolved restart selection before authentication, persist the selection and independent initialization evidence, then publish a bounded host state. Remove the random fallback from `context`; no selection/error means unavailable before WK. Preserve an actionable failure reason. Disposable mode must allocate/reuse only its own recorded task stores.

**Required check:** exercise the actual resolver used by the view for first adoption, saved selected UUID, unresolved restart, lock denial, corruption and a missing journal after a new registry instance. Assert that the browser factory is never called on failure and receives the persisted UUID on success. Manually calling `adopt` in a helper test is insufficient.

### N2 — The application singleton does not implement per-window ownership or complete entry retirement

**Source:** `PrimaryLoginStoreRegistry.swift:481–503,543–560,597–610`; `QuietWorkspaceView.swift:187–225,267–272,310–340,563–577,695–697`.

There is one coordinator-global `hostID`, no registered window ID, no requesting-host argument, no foreground/explicit-entry reason, and no published selection map observed by existing windows. Its registry also has a separate application-wide host ID. Every caller can be reported as the owner of the same lease; the `owner != hostID` condition cannot distinguish two windows. A second caller can invoke `beginPrimaryLogin` and supersede the first, while the first browser keeps its old store/controller. `hostState` is not used by production at all.

On a visible `/login` navigation the browser acquires a lease, swaps its WK view/controller, but **does not cancel the original navigation and does not load a fresh GET in the replacement**. It falls through to allow the old view's request. `NSViewRepresentable.updateNSView` does correctly install the replacement view (`545–559`); the problem is that replacement has no initial login load. The old view remains assigned the same delegate, and action/response callbacks do not validate `webView === currentWebView` or a captured full host context. An old callback can therefore operate on `self.desktopAuth`, now the replacement controller. Rebuilding the view property also leaves the old browser lifetime, KVO and observers in place; SwiftUI is keyed only by origin.

`window.isVisible` is not foreground ownership. Hidden hosts fall through to normal navigation rather than waiting. Provider interception at `195–205` starts a round without checking any lease. There is no native inert entry/presentation boundary for Next client routing, history or BFCache; checking only a `/login` navigation cannot prevent those routes from exposing a stale form.

**Fix:** inject a stable per-window host ID outside the rebuilt subtree. Resolve and observe the coordinator's immutable `{origin, storeID, epoch, hostID}` plus captured full entry lease and owned GET destination. Require a foreground or explicit entry reason, and make other hosts passive. Cancel the old login navigation; retire the complete old browser/controller/delegate/observer stack; construct and key the complete new subtree, then load its one owned GET without reacquiring/rotating on that same GET. Apply the already specified native inert shell, document-start display context and presentation gate to client routing/history as well as full navigation. Provider start must validate the captured current lease.

**Required check:** two actual host objects using the production resolver, one foreground and one background; second-host automatic redirect cannot rotate or expose a form. Deliver a retained old delegate callback after a new selection and prove it cannot dispatch in the new host. Assert one rotation and one fresh GET per explicit entry, plus Back/client-navigation/BFCache gating. These checks must instantiate the actual composition logic, not one global-host helper twice.

### N3 — Primary login settles on an OAuth receipt, without same-store actor readback, and can clear a newer lease

**Source:** `DesktopAuthenticationSession.swift:833,1133–1137`; `QuietWorkspaceView.swift:130–132,332–334`; `PrimaryLoginStoreRegistry.swift:613–623`.

A `session-established` consume receipt invokes `onPrimaryLoginResolved` immediately. The host calls `markResolved(for: origin)` with `try?`. That method retrieves whichever lease is currently stored for the origin, rather than the lease captured by the completed operation. An old host completion can therefore clear a newer entry's marker/ownership. Lower registry full-lease checks do not help: the upper layer supplies the newer lease itself. Persistence failure is hidden, and the controller still finishes.

There is no macOS production consumer of the fixed primary-status endpoint, no isolated WK content-world reader, and no distinction between `observedActor` and `settledEntry`. Password login is not covered by this OAuth callback either. A receipt/redirect is not proof of the current selected WK cookie actor and cannot settle a later password/provider entry while an earlier request can still set cookies.

**Fix:** treat OAuth receipt as an intermediate signal. Use the accepted host-owned, fixed-URL same-WK isolated-world status reader; correlate dispatch and completion with the full captured lease, store/epoch and read generation. Reject wrong/changed actor and uncertain errors without releasing ownership. Settle only when no matching session-writing request remains uncertain and authoritative readback belongs to that entry. Pass the exact captured lease to persistence/release methods; never look up the latest lease by origin from a callback. Surface persistence failure and keep the boundary closed.

**Required check:** password and provider login, missing/wrong actor, late A readback after B, an unrelated actor observed while an entry is uncertain, status network/error/redirect failure, and marker-write failure. Assert that A cannot clear B and an observed actor alone cannot settle an uncertain entry.

### N4 — Test launch isolation is parsed but not applied to the actual app origin

**Source:** `PrimaryLoginStoreRegistry.swift:405–445,513–536`; `WorkspaceConnection.swift:7,15–28`; `QuietWorkspaceView.swift:126,568,692–697`.

The configured `isolatedOrigin` is stored but never read by production composition. The real host still instantiates `WorkspaceConnection.shared`, which reads the installed standard preferences and chooses that saved origin. A TEST_HOST with only a root override is accepted; neither an isolated origin nor disposable behavior is required. Supplying disposable/origin switches without a root returns nil configuration, which a non-XCTest app treats as ordinary production bootstrap. Syntax checks for duplicate/missing values do not close these combinations.

No live app was launched, so this report does not claim an installed cookie jar was actually opened. The confirmed defect is that the supposed task-isolated launch can select the installed origin/preferences, or fall back to the production root for incomplete isolation switches. Registry-root isolation alone is not WK/origin isolation.

**Fix:** validate the complete launch configuration before filesystem/application construction. Any requested isolation switch requires the complete valid task-root/disposable/isolated-origin set; XCTest/UI test entry must remain unavailable without the required context. Inject a task connection configuration into the real root/browser so it never reads installed origin preferences or adopts installed WK identifiers. Route invalid configuration to a specific unavailable state, not normal connection setup.

**Required check:** actual composition factory with each incomplete/invalid argument combination and complete task configuration; assert effective origin/root/store and no standard-defaults/standard-root provider calls. Do not run the real TEST_HOST until this boundary is proved with injected providers.

### N5 — Every fresh prepared response is rejected; current-stage receipt requirements also contradict the Web producer

**Source:** `DesktopAuthenticationSession.swift:486,489–500,520–525,905–941`; `apps/web/app/api/desktop-auth/prepare/route.ts:120–160,208–220`.

For prepare, `dispatch` maps a new round's absent attempt ID to `""` (`912`) and then stores that nonnil empty string as `exchange.attemptID` (`937`). Policy requires the returned actual attempt ID to equal it (`486`). A legitimate first prepared response is therefore rejected for ordinary login and credential rounds before AS authorization starts. The prior A→B fix changed context selection but introduced this universal first-receipt regression.

After fixing that, policy still requires a grant on **every** credential receipt. The real current-proof prepare response has a flow and deadline but no credential grant yet; that grant is produced only after proof. The Web producer reads optional `flowFields.credential_attempt_id`, populated for target, not current. Requiring it at current prepare creates a second independent rejection. Requiring current-stage metadata uniformly on cancel also contradicts the cancel producer, which emits `role=login` and no flow/grant (`cancel/route.ts:129–148`).

**Dynamic confirmation:** exact r40 controller/policy probe in `r40-native-probe/` executed 4 cases: **1 positive control passed; 3 acceptance cases failed**. Direct policy with an absent expected attempt ID accepts login prepare; actual `start → prepare request → HTTPURLResponse` rejects both login and current even with complete synthetic current flow/grant headers; policy independently rejects the legitimate current-prepare shape without a grant. Run exit 1. This is controlled native execution, not real WK/HTTP/provider acceptance.

**Fix:** preserve optional attempt ID for prepare, then bind the server-assigned ID after a valid receipt. Use the new round's immutable context for B, not A's attempt/verifier. Define required metadata by kind, role and stage: do not fabricate a grant before proof. Make native and Web receipt producers agree on current/target/result/ACK/cancel semantics. Retain exact flow/grant equality once those values actually exist.

**Required check:** drive actual production controller requests through prepared receipts before using `acceptPending`; ordinary login, current proof with no pre-proof grant, fresh password-first target and full A-current → real ACK → B-target prepared acceptance. Reuse real Web response producers for receipt fixtures so stages cannot silently acquire invented headers.

### N6 — Uncertain credential recovery loses its role/verifier contract; consumed cancel is treated as completion

**Source:** `DesktopAuthenticationSession.swift:801–809,937–943,1203–1212,1290–1324,1358–1384,1425–1439,1533–1547`; `cancel/route.ts:129–148`.

Retained recovery context contains no role/intent/target. After `cancel` or deadline teardown removes `state.attempt`, a retained credential `checkResult` request gets `role=login` in its exchange despite using the original current/target attempt and verifier. A legitimate credential result will fail the new role check. If committed-result handling is reached, its final ACK body reads `state.attempt?.verifier ?? ""` rather than the result exchange's retained verifier. Cancellation cleanup now captures the attempt before teardown, which is progress, but its semantic identity still falls back to login.

The `.consumed` cancel branch calls `settleFinished`, erasing `flowContext`. For a consumed **current proof**, consumption does not establish that the password mutation or target link committed. This remains the wrong state transition. Under the current Web/policy mismatch such a credential cancel receipt is rejected earlier; the loss-of-recovery branch is a source-confirmed residual that becomes reachable after the receipt contract is repaired, not a claimed successful end-to-end cancellation experiment.

**Fix:** make retained exchange/recovery context include the complete immutable purpose/role/intent/target/attempt/verifier/flow/grant/deadline identity. Construct retry/result/final ACK and its policy expectation from that captured context, never from possibly torn-down mutable state. `consumed` means read the paired outcome; preserve uncertainty and proof until a committed result plus final ACK, or the defined expiry/lost-authority recovery boundary. A pending current proof must retain its next-step continuation.

**Required check:** actual current/target sequence with response loss, cancel/timeout, successful old result response and final ACK; assert exact verifier and semantic fields on each captured outgoing request. Separately test consumed current proof before password/target commit and unknown cancellation. Assert no replay of consume and no false committed/cancelled state.

### N7 — Intentional WK cancellation suppression is still a global flag

**Source:** `DesktopAuthenticationSession.swift:1066–1069,1107–1109,1500–1510`; `QuietWorkspaceView.swift:282–296,442–455`.

The host now forwards the real NSError code, but the controller suppresses the first error 102 globally **before looking up navigation ownership**. If another old/unrelated navigation's 102 arrives first, it consumes the flag; the intentionally cancelled exchange's later 102 is then treated as a real exchange failure. Conversely the unrelated failure was suppressed. This does not implement the comment's claimed exact-render fence. With overlapping old/new host callbacks in N2 it can also cross a replacement boundary.

**Fix:** capture the adjudicated exchange/navigation identity when deliberately cancelling that response, retire its response-render navigation, and suppress only that identity's expected WebKit cancellation for its generation/host context. Do not use one controller-global boolean.

**Required check:** classify A's receipt, dispatch B, deliver unrelated/stale 102 before A's intentional 102, then a genuine B failure. A's expected cancellation must not change B, and B's real failure must remain visible. An actual WK check by the parent remains necessary after the deterministic ownership test.

## What is actually improved, and what is not closed

| Boundary | r40 evidence / conclusion |
| --- | --- |
| One application coordinator | `AppModel.bootstrap` now creates and injects a singleton; the old per-browser registry/force unwrap/temp fallback construction is gone. Selection/host authority is still bypassed (N1–N3). |
| Controller load and anchor after view replacement | A newly created controller weak-captures the replacement WK view (`327–330`); the specific old-load-closure issue is improved. The complete Browser/delegate/observer/SwiftUI lifetime is not replaced (N2). |
| Native request-ref alphabet | Generated references replace `_`/`-` inside the token and emit an accepted lowercase alphanumeric token. The former underscore rejection is source-closed. No random/probability test is needed. |
| A→B round exchange context | Prepare/consume now prefer the current round. Universal empty expected attempt ID and stage requirements block the actual sequence; not accepted (N5). |
| Shortened deadline | Authoritative shortening now calls `scheduleDeadline`; callbacks check captured generation/host epoch (`1119–1129,1515–1527`). The former missing reschedule is source-closed. `deadlineTask` is still never assigned because the default scheduler discards its Task (`847–853`); actual cancellation is not implemented despite comments. This is a residual implementation/coverage issue, not an additional demonstrated P1 corruption. |
| WK cancellation | Real error code forwarding is fixed; exact cancellation correlation is not (N7). |
| Cancel dispatch after teardown | Capturing attempt ID before teardown fixes the previous missing cleanup dispatch. Recovery metadata and consumed semantics remain incorrect (N6). |
| Registry low-level guards/durability | Full held-lease comparison and throwing directory fsync/open failure are improvements. Origin-only upper APIs and non-durable initialization evidence remain unsafe (N1/N3). |
| Native inert entry / isolated status | Neither is wired. These are accepted task requirements and are covered by N2/N3, not optional follow-up architecture. |
| Ephemeral session override | Real host calls `fromProcessInfo`, default false. Source remains correct; no new launch probe was needed for this unchanged boundary. |

## Why existing helper tests do not establish production acceptance

`PrimaryLoginStoreRegistryTests.swift:221–249` manually calls `adopt`, which production never calls, then operates one global host and directly calls `markResolved` without a status response. It cannot prove window coordination, restart bootstrap, real origin injection or status settlement. The XCTest missing-configuration test only covers no arguments; it misses root-only and unused isolated-origin configurations.

`DesktopAuthenticationSessionTests.swift:98–120` adds flow/grant/deadline to every credential receipt, contradicting real current prepare. Many sequences directly invoke `acceptPending`, bypassing the actual rejected prepared response. The A→B test ends by checking a fourth load (`281–283`), rather than accepting B's prepared response and completing B. These are specific coverage gaps; they explain how reported green tests coexist with the controlled failures and are not themselves evidence that the tests did not run.

The next implementation slice should finish the **actual bootstrap → resolved host → owned inert entry → real prepared/current/target chain → same-store status settlement** in one coherent production path. Its tests must call the same resolver and controller transitions used by the UI. The accepted ADR already specifies this composition; no new user design decision is required.

## Source and artifact binding

All paths in the source table are relative to the frozen root stated above. The probe binding records the final manifest verification, clean git status and exact WorkspaceOrigin excerpt comparison. No secrets or real credentials are in probe receipts.

| Frozen source | SHA256 |
| --- | --- |
| `apps/macos/Sources/App/AppModel.swift` | `2bfdefe49cf1666be13f656419cf8c7aae89e95e5fef841e33c240e208f4b030` |
| `apps/macos/Sources/App/TalentSignalMacApp.swift` | `a15bf50a618ca3e350f30fc26a1d2243cb64a96230df88074a1cc21d5516a374` |
| `apps/macos/Sources/Features/QuietWorkspaceView.swift` | `292e583a9107c30589fe26b8f689aa89aacce77272e6c54a46ec7b9ea5fc8979` |
| `apps/macos/Sources/Services/WorkspaceConnection.swift` | `9be6f57759286197fbe3f90a9fc579b2eab13dc258ff458114a36c7a159af774` |
| `apps/macos/Sources/Services/PrimaryLoginStoreRegistry.swift` | `686173023dbf094e0a07fb8cdf124fbc87ebf699c7527df80170f5b5e26ce416` |
| `apps/macos/Sources/Services/DesktopAuthenticationSession.swift` | `44c5cc6ffc0901199497516e46879ae08a7dd4beedfaf311a83690cc737422cd` |
| `apps/macos/Tests/PrimaryLoginStoreRegistryTests.swift` | `b26a114a85541aaca2b8a989fb6c2620517db71485eae42f975a899f5c3a81ac` |
| `apps/macos/Tests/DesktopAuthenticationSessionTests.swift` | `fb702168a925dcf5bfae8b26d0a9164a63fe9df5013947bc69adbaff4446834a` |
| `apps/web/app/api/desktop-auth/prepare/route.ts` | `01a35d48f68bf2c52141b6d384bf8f041dbce413670c745ae9bd91c3f7128bb2` |
| `apps/web/app/api/desktop-auth/cancel/route.ts` | `f259e002b6469da9fa8606bcb96c9f5902180355a8d84780927a2c589e685be5` |
| `docs/decisions/0021-primary-login-store-ownership.md` | `18fb3096d2cec90dd61a2833d01a1a19d5bf35ae7fd6ca9eba6f82f34d394bb3` |

| Reviewer probe artifact | SHA256 |
| --- | --- |
| `r40-native-probe/Probe.swift` | `32eaff2be9f68252d5d355521f5d96ce400e1e8ad2b5328fe70a962735948aa7` |
| `r40-native-probe/WorkspaceOriginExact.swift` | `85c5ee4f7adbe399818243b75e24beb90c4bb8108929fa7349130d89652f0748` |
| `r40-native-probe/build.log` | `54b866215b1a2d0014130c2924ea22f5d1d48d8c7c1b239a539dc17ac0ff608c` |
| `r40-native-probe/probe` | `6f947145afe5d263301343a1889a7390c1391672f8bf71b2009e1cabade098fb` |
| `r40-native-probe/receipt.json` | `b0155af5a4cdb0a35a62d3a03df5195b07903af373546f6ec5887ebcde312edb` |
| `r40-native-probe/run.log` | `687652b04127b41c86accdb76f4e3df7a50daf71768aab6361005a0e7beace80` |
| `r40-native-probe/binding.json` | `d726ad5956032b9aa7cfe81ac3ac0888eb9d052370d0e31e0c72808eb8301a35` |

The controlled probe used the frozen controller directly; only WorkspaceOrigin was extracted byte-for-byte with a Foundation import. Build output contains an unused `purpose` warning. The invocation produced the bound executable; the initial wrapper did not retain its compiler exit metadata, so this report does not invent a compiler exit receipt. The probe execution exit code was captured as 1. No full macOS app build/test, real WK behavior, signed delivery or actual provider success is certified here.
