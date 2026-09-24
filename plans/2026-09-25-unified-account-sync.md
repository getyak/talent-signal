# Unified account and cross-device synchronization

## Outcome and ownership

User request: design one unique email account with multiple settings-managed
sign-in methods, default shared People and Session history, then delegate
implementation/testing to local Pi and independently verify iOS, Web and macOS.

Parent owns architecture, design, independent review, user interaction, source
integration and delivery. Pi owns implementation and local verification in its
isolated worktree; one active Pi writer. Other root-checkout work is unrelated.
Design authority: [ADR 0018](../docs/decisions/0018-unified-account-login-and-sync.md).

## Baseline and evidence

- Fresh origin/main: `6cad31f449aee8c9d905def7d30b339e1024ce5b`.
- Parent worktree: `/Users/cubxxw/data/talent-signal-account-sync`, branch
  `codex/unified-account-sync`. Original checkout remains dirty and untouched.
- Runtime inspected in preceding inquiry: backend/Web revision `973e7913`;
  same-email Google/password users have distinct account and user IDs. Only
  aggregate metadata was read; no conversation or contact content was accessed.
- Current password registration checks only password_human email duplicates;
  password login also filters that kind. Existing auth_identities already
  supports several provider credentials per user.
- iOS foreground refreshes Sessions but omits workspace/People refresh.
- macOS uses the Web product surface. Its cookie store remains device/origin
  scoped, while product data must be canonical and shared.
- Dependencies: React 19.2.8, Next 16.3.4, Auth.js beta.32, Fastify 5.12.5,
  jose 6.2.12, PostgreSQL 18. Official references are in the ADR.
- Storage audit: 150 GiB available, three allowlisted simulators. Unrelated
  registered artifacts remain untouched. Task artifacts:
  `/private/tmp/ai-test-account-sync.umqxBi`.

## Milestones

1. Complete: design and independent identity-safety review; review identified
   unverified password email claims and the design now requires verification.
2. Shared implementation integrated: Pi completed uniqueness, settings binding
   and sync lifecycle. Parent closed review defects and verified actual clients.
3. Active: finish integrated native checks, then delegate the separate macOS
   system authentication handoff and independently verify live provider flows.
4. Integrate reviewed code, complete applicable CI/delivery gates and live
   runtime readback. Historical production reconciliation requires exact proof
   and review; no automatic database merge during implementation.

## Completion matrix

| Requirement | Required proof | Current state |
| --- | --- | --- |
| New email globally unique | PostgreSQL concurrent registration tests | fresh migration084; independent alias5/5 and integrated account43/43 passed |
| Password email ownership | real delivery plus challenge/replay tests | Resend configuration found; delivery unverified |
| Apple/Google/password same account/user | backend receipts and settings UI | controlled-provider identity and Settings flows passed; live providers pending |
| Safe conflict and relay behavior | hostile/replay/ownership tests | backend tests and independent review passed; live relay proof pending |
| Historical duplicates handled | classified inventory, preview, dual proof | inventory10/10, final reconciliation8/8 and Web consumer16/16 passed; production accounts untouched |
| People sync both directions | real iOS/Web/macOS IDs after refresh | actual native import to Web and macOS; Web Person visible in iOS, same IDs |
| Session history sync both directions | same session/message IDs and deletion | actual iOS/Web/macOS history and draft writes passed; native remote deletion preserved draft |
| Interrupted/offline recovery | preserved draft and no duplicate write | stale-scope native tests and actual draft conflict/deletion passed; live offline-provider flow pending |
| Real Apple sign-in | provider callback and post-login readback | pending |
| Review and delivery | independent P0/P1 closure and exact-head checks | pending |

## Parent verification checkpoint — September 25

- The first migration draft failed on PostgreSQL 18 because `min(uuid)` is not
  supported. Pi repaired it; the actual migrate entry point then succeeded over
  three synthetic legacy users, including a case-insensitive duplicate pair.
- Seven independent database cases passed against that intermediate source:
  preserved legacy collision, each of three first-provider orderings, concurrent
  ownership, direct-insert rejection and atomic rollback. This is not final-head
  acceptance and does not prove OAuth or UI behavior.
- Empty-account classification failed because `harness_source_generations` was
  counted as product data. Independent review also found that credentials were
  misclassified and indirect Lab ownership was omitted. All findings were sent
  to Pi together; safe credential-baseline handling must not expose the missing
  historical-ownership check.
- Read-only production inventory found a deleted Lab workspace owned by the
  Google duplicate, with its target user retained. Zero ordinary product rows
  therefore do not establish that this account has no historical relations.
- Existing Resend configuration uses the sandbox sender domain `resend.dev`.
  Sending-only key scope prevents a domain-list check; no email was sent and
  delivery remains unverified. No user-supplied key is currently needed.
- The installed macOS wrapper loses OAuth continuity when it opens the system
  browser, and cancelling Apple leaves its login controls disabled. The separate
  reviewed [handoff design](../docs/decisions/0019-macos-system-authentication-handoff.md)
  will be a sequential Pi implementation after the shared account work.
- Parent artifacts are under the registered task directory's `parent-db/`;
  the isolated `account-sync-parent-pg` container is task-owned and must be
  stopped after durable evidence is saved. No resident database was migrated.

## Independent client checkpoint at 04:18 local

Pi task `20260925-013010-76d8a6ad` continues in the same isolated worktree,
repair9, with the complete client review. Parent has not integrated implementation
or changed resident services/accounts. The macOS handoff remains a sequential
second phase after the shared implementation is coherent and reviewed.

- Independent backend expected-revision tests passed7/7 through helpers and7/7
  through actual loopback HTTP. Prior reconciliation lock-boundary8/8 and
  classified inventory10/10 remain intermediate receipts, not final-source proof.
- Actual Web received a committed remote message while its original Session
  stayed open, preserving the unsent draft. Source hashes stayed unchanged.
  Observation upper bound16.460seconds includes tool dispatch and does not prove
  the15-second target. A separate remote-draft overwrite race still needs fixing.
- Independent Web review found stale direct password forms can target another
  account with matching revisions, provider recovery challenge-label mismatch,
  absent duplicate-provider proof flow, and the draft-baseline race. Recovery
  must additionally bind original session/revisions and support cancel/retry.
- Independent native review found the initial Settings/provider and refresh
  types were not wired to real workflows. Pi must complete provider-only
  step-up, binding/unlink completion, actual People/open-Session subscriptions,
  scope invalidation and accessible account/sync/device controls before handoff.
- Native registration may use the existing trusted HTTPS email confirmation
  followed by an explicit return-to-app continuation with pending credentials
  held only in memory. Raw secret copying is not the primary product flow;
  unconfigured universal links must not be invented.
- Parent stopped a broad native script before it could uninstall the shared
  simulator app. Verified orphaned task build processes were terminated. All
  shared simulators remained shutdown;142GiB was free. Subsequent verification
  uses guarded focused Debug build-for-testing/test-without-building, explicit
  task DerivedData and preserved shared application data.

## Execution boundaries

### Client review continuation at 04:48 local

Repair10 combines the remaining full-flow findings after Pi's selected native
tests passed. Those tests do not establish actual View or provider behavior.
The Web stale-actor ServerAction/HTTP regression passes4/4 with positive controls;
reconciliation boundary regression passes8/8. An independent disposable Session
was deleted through HTTP and the open Web UI disabled its composer within an
observed7.813seconds. Native and live-provider acceptance remain pending.

Open findings are independent current/duplicate provider proof slots in Web
recovery, ownership of delayed OAuth errors, native password operation parameters,
current Apple challenge preparation, default open-Session refresh registration,
and honest readback after a potentially committed credential change. Pi has the
complete review and stays the implementation owner in its isolated worktree.

Parent owns the optional native build-origin plumbing in
`scripts/ios/configure-build-environment.mjs`, its tests and
`apps/ios/Config/Environment.xcconfig`. `TALENT_SIGNAL_WEB_ORIGIN` is encoded into
`TALENT_SIGNAL_WEB_ORIGIN_BASE64URL`, accepts only an origin, requires Release
HTTPS and permits exact Debug loopback HTTP. Missing configuration stays empty.
Seven script tests and nine independent reviewer assertions pass. Pi owns the
corresponding Info.plist decoder, active-backend matching and fixed recovery
route; those require integration and actual UI verification.

Use synthetic accounts and records in isolated task-owned test infrastructure.
Never seed, migrate or repoint the resident production/TestFlight database during
Pi implementation. No secrets in contracts/logs/docs. No external messages or
Linear/GitHub writes from Pi. Parent retains delivery ownership.

Native build/test/interaction must use `/Users/cubxxw/.local/bin/dev-ios-session
run -- ...`, Primary iPhone selected by `dev-ios-session select`, and task-owned
DerivedData/results/screenshots. No new simulators, erase, shutdown-all or
cross-task cleanup. No backend Compose stack with permanent restart.

Real Apple credentials, verification and grouping may require owner interaction;
prepare the complete reviewable flow before asking for that specific step. Unit
verifier injection is not live provider evidence. Do not end the task just because
Pi reports ready_for_review. Unresolved historical collision or missing live
platform evidence remains explicitly incomplete.

### Independent acceptance checkpoint at 05:17 local

Pi continues repair11 in the original task/session. The parent has integrated
only design, evaluation documents and optional native build-origin plumbing;
implementation remains in the worker checkout until its outstanding review
findings are fixed. The full repair contract and current parent receipts remain
under the task artifact directory.

- The authenticated Apple Developer readback confirms Service ID
  `com.talentsignal.web` is grouped with primary App ID
  `6RG2F8YY59.com.talentsignal.app`. The registered HTTPS return URL uses port
  `10443`. No provider configuration was changed; live Apple identity continuity
  remains unverified.
- The parent launched the exact repair10 simulator binary under the shared
  device guard. It stopped at protected test-workspace recovery before login.
  Code-sign readback shows a linker-signed binary without entitlements after
  Pi's `CODE_SIGNING_ALLOWED=NO` Debug build. A normally signed Debug build is
  needed to test the suspected Keychain cause. No protected state was erased.
- A deterministic test of the production Web refresh defaults starts its first
  read after 16 seconds: 15-second interval plus 1-second coalescing. This fails
  the 15-second target before network latency; the default interval needs margin.
- Repair11's Web review still identifies missing target-round creation in the
  password-first binding action and missing rendered-flow-ref rejection. The
  narrow tests bypassed these real entry points. Stale-error retirement and
  truthful recovery-proof projection also require correction.
- Actual Chrome login encountered an onboarding/login redirect loop. An
  independent HTTP probe reproduced that loop with a deliberately invalid Lab
  selection cookie after successful primary login; the clean-cookie control
  reached the workspace. Chrome's specific cookie cause is not established.
  Recovery must preserve isolation rather than silently fall back to a parent.
- The disposable UI database's empty reconciliation table received its two
  missing development columns after schema comparison against the fresh proof
  database. Existing synthetic Person/Session IDs were retained. This adjustment
  is not fresh-migration proof and did not touch any resident database.

### Independent acceptance checkpoint at 05:43 local

Repair12 is in progress. The Web production timer now starts the first scheduled
read at 11 seconds in the parent's deterministic default-configuration check.
The real HTTP login-loop regression and actual Chrome recovery both pass while
retaining the existing synthetic Person and Session IDs. These close the
specific timing and recovery findings above, not native or provider acceptance.

Independent review confirms the password-first target round, exact rendered
recovery reference and consumed-round retirement fixes in source. Tests still
need to execute the real completion route, both provider-role orders and actual
blank-password recovery form submission. Recovery status also needs to validate
the current actor/session/revisions before presenting a proof as verified.

The parent reproduced another account-splitting defect with real disposable
PostgreSQL and actual backend entry points: account A links a Google credential
with verified email B; B has no reservation; verified password signup for B then
creates account B, while the Google credential still signs in to A. Provider
verification and delivery were controlled fixtures, not live external services.
ADR 0018 now explicitly freezes secondary verified-email ownership, retention
after unlink and complete reservation handling during reconciliation. This P1
is queued for Pi after its current coherent client implementation checkpoint.
Primary-email password lookup remains the chosen scope; a reservation alone is
not an additional password identifier or authorization proof.

### Actual client checkpoint at 06:07 local

The independent Web consumer harness passes 10/10 with 13 source hashes stable:
real start actions, JWT callbacks, LoginPage and completion handlers, with
controlled provider/HTTP transport. The source-bound receipt is in
`docs/evaluations/account-sync/web-completion-independent-2026-09-25.json`.
This is not live OAuth/PKCE or a browser callback acceptance result.

Repair12's normally signed native build succeeds. Actual iOS password login now
passes the protected-storage gate and reads the same Web-created Person and
Session IDs. A synthetic message committed through HTTP appeared in the open
iOS Session after an observed 4.738 seconds; the visible unsent draft survived.
Through the actual native import/review/save UI, the parent created one synthetic
Person and its Session receipt; actual Chrome automatically displayed both
records, and opening their links retained both exact IDs.

This run exposed a real native write defect: `JSONEncoder.agentSession` drops
fractional seconds. A Web-created Session retains creation time
`2026-09-24T19:12:08.180281Z`, but iOS submits `2026-09-24T19:12:08Z`; the backend
correctly rejects changing immutable creation time. Preserve canonical time and
repair native roundtripping, rather than weakening that invariant. The same
retained fixture must pass an actual native write after repair.

Native repair12 tests are not green: request-body assertions failed and the
second Session test deadlocked before a response was delivered. Independent
review also found five P1 operation/lifetime/tombstone defects. After that
coherent build/test checkpoint, the parent cancelled the hung task and resumed
repair13 focused only on native implementation and real controller/consumer
tests. Secondary-email ownership, remaining Web projection checks and the
timestamp defect are queued separately for repair14. All source changes remain
isolated; no production account, deployment or provider configuration changed.

### Native and ownership checkpoint at 06:22 local

Repair13's signed test build succeeded, but the new Model tests deadlocked and
some request-body assertions still failed. Frozen independent review retains
four P1 findings: clients cached across identity changes, incomplete Apple
round selection/ownership, refresh leases missing production lifecycle wiring,
and tombstone recovery not connected to every sending path. The parent stopped
the exact hung test process and resumed the same Pi session as repair14 with
these concrete findings, deterministic test fixes and the actual timestamp
roundtrip defect. No implementation has yet been integrated into this parent
branch; test counters and failed evidence remain intact.

The parent independently added five real PostgreSQL secondary-email regression
cases. All fail against unchanged source, including both signup/link commit
orderings observed with `pg_blocking_pids`. The other cases cover changed
verified email on an existing subject, retained ownership after unlink, and a
foreign email collision during rebind. The source-bound before-fix receipt is
`docs/evaluations/account-sync/linked-email-boundaries-before-fix-2026-09-25.json`.
Backend ownership and the remaining Web projection/form checks are queued for
repair15 after native repair14 reaches a coherent review checkpoint.


### 2026-09-25 06:52 native parent acceptance checkpoint

Native ownership transferred from Pi to the parent before repair15. Backend/Web
remain Pi-owned. Normally signed iOS build and 25 focused tests passed at06:40;
independent native review found no remaining P0/P1. Actual retained-fixture UI
then exposed a same-revision legacy-cache timestamp gap. The parent repaired
only canonical immutable time fields, preserving local draft/state; five focused
Session tests passed, including old ISO8601 persisted-envelope restore -> same
revision read -> upload -> persistence reload. Independent delta review found no
P0/P1. Receipts and both reviews are saved under docs/evaluations/account-sync.

Actual iOS now sends the Web Session creation time as .180Z, matching the
backend's millisecond instant, but the server rejects immutable turn time via
string comparison (.180Z versus .180281Z). Same-Session native write acceptance
therefore remains OPEN. The backend must compare equivalent timestamp instants
consistently while retaining the original stored creation strings, preserving
message IDs/order/objectives/task/context, and rejecting actual time changes.
This follow-up has not yet been handed to running Pi repair15 (no inline steering
API). Do not rewrite the fixture to hide the failure. Native manual guard was
released and the task-started Primary iPhone was shut down. No production data,
provider configuration, installed macOS app, or saved preferences changed.


### 2026-09-25 07:03 actual same-Session write and deletion acceptance

Parent owns agentSessions.ts and its timestamp integration regressions in
addition to native files. Pi repair16 owns secondary email aliases and Web
completion scope/form/copy fixes; cumulative counters/session retained.

Real signed iOS startup PUT returned200 and advanced retained Web Session
 e904c65d-d51d-486e-8ad6-4ce79cb30fa0 from7to8 while restoring the old local
draft. Typing a new draft in the actual iOS composer advanced to9; actual Chrome
at the same Session URL displayed the identical draft. A real HTTP static
history append advanced to10; both native and Chrome showed new message299a9764
while preserving the draft. Original five message IDs and high-precision
creation strings stayed unchanged. Separate disposable SessionC1140259 deletion
showed a native deletion notice, kept the draft, disabled Send, and offered Start
new Session; tapping it restored Send without reviving the deleted Session.
An accessibility identifier wait timed out because the container ID overrides
the button ID; its real label/action and resulting UI were verified. No model
request was sent. Primary iPhone guard released and task-started device shut down.

Server time comparison now uses one sameImmutableTurn predicate for validation,
image preservation and share classification preservation. The server retains
original immutable time strings after checking equivalent JS millisecond
instants. Independent review closed an initial image-preservation ordering P1.
Real HTTP9/9 passed before the helper refactor. Focused PostgreSQL image/share
regressions passed2/2 after it. Added canonical timestamp/tamper integration case;
its suite passed2 cases but the concurrent image suite compile encountered Pi's
in-progress auth.ts edit. Repeat the targeted3 cases on frozen source, and reload
the final runtime before treating helper-refactor live proof as complete.

These are actual iOS Simulator/Chrome/password/synthetic-data proofs; live Apple,
Google and macOS system authentication remain separate incomplete checkpoints.
A normally signed isolated macOS baseline build is underway for WebKit password
and same-account readback; no installed app replacement or preference mutation.

### 2026-09-25 07:09 macOS password baseline

Normally signed isolated macOS build succeeded; strict codesign verification
passed for com.talentsignal.macos. Per-process NSArgumentDomain origin/local
flags selected127.0.0.1:4608, verified in actual WKWebView URL. Actual password
login displayed both exact People IDs and the retained Session; its six static
history turns and iOS-authored draft appeared. Editing the actual macOS composer
persisted the new draft at revision12. Chrome displayed a remote draft conflict
notice and preserved its local text. This is intentional conflict handling, not
an automatic overwrite claim. Saved connection-origin/local/inspector defaults
were unchanged; the installed app was not replaced. Candidate quit normally.
Apple/Google system handoff remains phase2. This baseline does not prove OAuth.

### 2026-09-25 07:11 independent secondary-email proof

Fresh parent PostgreSQL database account_sync_alias_parent_r16 migrated through
084. The existing independent five-case linked-email proof now passes5/5 with
source hashes unchanged across execution: same-subject newly verified aliases,
unlink retention, foreign collision with ordinary subject-login continuity,
and both real signup/link commit orders. Earlier before-fix5/5 counterexamples
remain saved. These controlled-provider tests use production entrypoints and
real PostgreSQL locks; no live provider assertion is claimed. Review separately
identified JSONB key-order comparison in reconciliation; Pi's own new alias
transfer test also exposes stale-proof rejection and repair is still underway.


### 2026-09-25 07:29 reviewed shared implementation integrated

Pi repair16 completed backend42/42, Web216/216 focused and1334/1 skipped
full tests, backend814/326 skipped full tests, and both typechecks. Automatic
repair17 tried to address parent-owned native hotspot checks; parent officially
cancelled at turn635 before any extraction edit persisted. All94 source and
operations files were integrated, preserving parent decisions, plan, evidence,
and build-origin configuration. No source checkout or production mutation.

Parent fixed same-owner verified email reassertion so existing provenance and
claim revision remain unchanged. Real prepare/reassert/confirm now succeeds,
while a genuinely new alias still invalidates a frozen claim inventory. The
integrated PostgreSQL account suite passed43/43. Six existing presentation
components were mechanically extracted from the native hotspot files, without
changing bodies. Integrated docs/architecture checks passed; normally signed
native build and focused tests are running. Final native proof remains pending
until those complete. Parent timestamp/image/share integration3/3 and fresh
HTTP9/9 closed the final helper-refactor gap.

Independent frozen Web consumer tests now pass16/16 with stable source hashes,
including five independent current-identity/revision drifts and real cancel GET
scoping. Repository Web focused tests pass29/29; provider-only form exercises
the actual React action and completion tests invoke real GET handlers. Parent
Web source matches this reviewed snapshot byte-for-byte. This is controlled
provider evidence, not a live OAuth completion claim.

Mac system authentication remains a separate planned Pi phase. Existing actual
macOS password login and bidirectional draft proof do not establish Apple or
Google handoff. No Tailnet routes, provider settings, installed app, production
accounts, or release state have been changed.

Integrated source verification completed at07:29: normally signed native test
build passed and all26 selected tests passed with0 failures. Backend and Web
typechecks passed. Independent native extraction review found no P0/P1 and
confirmed unchanged component bodies/remainder/tests plus project inclusion.
Test host emitted SwiftUI frame/AppShortcuts helper warnings; no selected test
failed. See integrated-phase-one-r17.json for source hashes and exact boundaries.
The guarded session ended and only its task-started Primary device was stopped.

Final independent secondary-email review closed the no-op claim P2 against
parent source73e75f47 and test4014f13f. No confirmed P0/P1 remains in the
reviewed shared-account scope. Existing production conflicts are still
unresolved by design; no data reconciliation has been executed.
