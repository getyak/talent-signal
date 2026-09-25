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
- Inspected production password registration checks only password_human email duplicates;
  password login also filters that kind. Existing auth_identities already
  supports several provider credentials per user.
- Inspected production iOS foreground refresh omitted workspace/People refresh;
  the integrated candidate now refreshes both directories.
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
3. Active: integrated native checks passed; macOS system handoff is in Pi
   repair 8 review failed on real consumer paths and disconnected
   primary-login store ownership; repair9 was interrupted for app-bootstrap isolation and concrete
   composition guidance; repair10 is now running with the reviewed composition. Live provider flows
   remain pending; no phase2 implementation is integrated.
4. Integrate reviewed code, complete applicable CI/delivery gates and live
   runtime readback. Historical production reconciliation requires exact proof
   and review; no automatic database merge during implementation.

## Completion matrix

| Requirement | Required proof | Current state |
| --- | --- | --- |
| New email globally unique | PostgreSQL concurrent registration tests | fresh migration084; independent alias5/5 and integrated account43/43 passed |
| Password email ownership | real delivery plus challenge/replay tests | Resend configuration found; delivery unverified |
| Apple/Google/password same account/user | backend receipts and settings UI | controlled-provider identity and Settings flows passed; live providers pending |
| Safe conflict and relay behavior | hostile/replay/ownership tests | phase1 and frozen r33 passed; r35 clock regression and r36 primary/target/store blockers independently confirmed; repair10 running |
| Historical duplicates handled | classified inventory, preview, dual proof | inventory10/10, final reconciliation8/8 and Web consumer16/16 passed; production accounts untouched |
| People sync both directions | real iOS/Web/macOS IDs after refresh | actual native import to Web and macOS; Web Person visible in iOS, same IDs |
| Session history sync both directions | same session/message IDs and deletion | actual iOS/macOS Send returned the same Session to all clients; foreground macOS-to-iOS observed in 7.915 seconds; draft/deletion recovery passed |
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

### 2026-09-25 09:30 actual sends and system-auth review

Actual iOS Send persisted turn d0f07095 under the retained e904c65d Session;
Web and macOS showed it. Actual macOS Send persisted d2106300 in the same
Session, visible in iOS/Web. A foreground repeat produced turn0241170b; native
UI showed the reply 7,915 ms after the macOS Send click, within the15-second
design target. All earlier turn IDs and original timestamp remained unchanged.
These sends used a fixed synthetic provider through real queue/stream/save
paths, not external AI or OAuth. See actual-bidirectional-send-r18.json.

Real native response persistence mirrors a block in saved/unbound compatibility
arrays. Parent fixed duplicate Web/macOS rendering by stable block ID, preserving
the saved representation, distinct IDs and input data. Twelve focused tests
passed; independent review found no P0/P1 or order/data regression. Screenshots
were visually inspected and retained. The old macOS candidate quit normally;
Primary iPhone guard was released and only the task-started device stopped.

Phase2 Pi initially reported ready_for_review, but independent review found
nine P1 and one P2 across actual Web consumers, backend authority locks and
native lifecycle. No phase2 code is integrated. Repair1 dispatched under the
same task/session/counters with an explicit600 cumulative-turn cap. The frozen
initial counterexamples are saved in phase2-web-counterexamples-r18.json and
phase2-review-r18.md. Native current-identity reauthentication for older Settings
sessions needs a bounded protocol continuation; it is not marked complete.

Native Person detail is currently read-only. Previous actual Person import and
cross-client directory creation/readback passed; native generic Person editing
was not performed or claimed. Production identity ownership, provider settings,
Tailnet routes and installed apps remain unchanged.

### 2026-09-25 09:36 real Web Person creation

Chrome's actual Add Contact form created Web Sync Person r19 from a synthetic
note after the account-scoped identity search returned zero candidates. It
produced Person43f0e661 and contextb942808b. The normally signed iOS app's
foreground People directory displayed that exact ID; the macOS WebKit window
opened the same Person/context. Authenticated HTTP readback found exactly one
record in the same canonical account/user. See actual-web-person-r19.json and
its screenshots. No confirmed identity claim was added from the optional hint.

This closes actual Web creation to native readback alongside the prior iOS
import to Web/macOS. The iOS app launched after creation, so no active People
propagation latency is claimed. Both manual test hosts were released/quit.
Generic native Person editing remains outside the existing product surface.

ADR0020 defines the next bounded system credential-round continuation: exact
current/target proof for one frozen Settings operation, preserving the original
WK session and existing credential transaction. It is design-only and awaits
independent native protocol review plus subsequent Pi implementation.

### 2026-09-25 09:44 repair2 and canonical credential-round design

Native design review of ADR0020 found no confirmed P0/P1 and added explicit
server acknowledgment, current-to-target generation turnover and unknown-result
window-close rules. Parent encoded those rules and the normal password-form
exception. The credential-round design is now accepted, not implemented.

During repair1, parent found a new deviation: Pi derived the WK pairing secret
from config.databaseUrl and returned that authority to the system browser.
Parent officially cancelled at207 cumulative turns, preserved source hashes in
phase2-rejected-pairing-r19.json, and resumed the same task/session at repair2.
No moving candidate was integrated. The repair2 contract requires random WK
pairing, independently scoped system cancellation, and the complete ADR0020
current/target/result/ack continuation, replacing the unreleased recent-login
direct-link shortcut. Cumulative600 replies/5 repairs remain; no accounting reset.

Parent prepared an independent actual public-endpoint PostgreSQL harness for
unverified Apple hints and revoke-after-admission login. It is not yet run; it
will run on frozen repaired source in its own database, after fresh migrations.
All actual iOS/macOS manual guards are released. Production is unchanged.

### 2026-09-25 10:00 native Apple system checkpoint

Parent started a separate loopback backend on44329 using the production Apple
JWKS verifier and a fresh database migrated through084. The normally signed iOS
candidate launched with that endpoint, preserving the synthetic44319 protected
session. The actual Apple button displayed Apple's device-account sign-in
requirement. Only challenge requests reached the backend; no token, canonical
account or authenticated session was created. The user has a pending request to
sign into Apple Account in Primary iPhone Settings. This is not live Apple pass.

Parent also corrected opaque native Apple failure copy and routed backend Apple
email conflicts through the existing-account guidance. Parser/catalog checks,
normal signed build-for-testing and strict code-sign verification passed.
Independent review found no new correctness or user-state issue. This small
copy change added no tests; compiled tests were not executed, and no new app
install or launch interrupted the user's credential handoff. The manual
simulator guard is currently held for that interaction.
Pi repair2 continues separately; no phase2 source is integrated.

Independent review strengthened the pending parent PostgreSQL race harness:
it now proves an equivalent authenticated request succeeds without revocation,
checks the exact live initiating row/token hash at the admission pause, demands
the specific revoked-session rejection and preserves database evidence before
assertions. The alias case also confirms the staged email remains unverified.
The strengthened harness is still unexecuted until repaired source freezes.

### 2026-09-25 10:16 credential result and exact-form regression

The user has not yet confirmed Apple Account sign-in. The900-second manual
guard ended normally and stopped only task-booted Primary iPhone, preserving
device data. No live Apple token reached the isolated backend. Resume the same
device after the user's response; do not treat the pending request as approval
or provider success.

Parent found that the exported completeStagedUnlink Server Action caught Next's
real success redirect and replaced it with an error redirect. A new focused
regression uses real next/navigation control flow and real staged-cookie
seal/read. Two failures before the fix proved the redirect problem and false
"no effect" copy after a lost password response. Moving success redirect outside
the catch and labeling uncertain responses truthfully fixes both. This tests
the exported Action, not a currently visible unlink form or the provider
callback's separate completion path.

The same staged scope helper also accepted a missing operationRef. A separate
counterexample proved the request could consume a staged unlink without that
ref. It now requires exact equality; the normal staged forms already include
it. Missing/old refs and sibling-session requests all refuse before a backend
mutation. Six new result tests plus ten existing Action/component tests pass.
The UI reports current connected status without claiming that a query parameter
proves this operation completed. These parent deltas must be preserved when
integrating Pi's independently edited Web files. No phase2 source is integrated.

### 2026-09-25 10:27 immutable backend snapshot and counterexamples

To review completed backend work while Pi continued Web/native, parent captured
451 backend/contracts/architecture files with unchanged before/after bytes and
committed the isolated snapshot as f4143338 in the managed worktree
`/Users/cubxxw/.codex/worktrees/account-sync-backend-proof-r22/talent-signal`.
The snapshot has its own dependencies and a fresh disposable database
account_sync_desktop_parent_r20 migrated through085. It is not merged into the
parent and is not the final Pi revision. Final source hashes must be compared.

Backend typecheck and61/61 existing desktop/identity tests passed. Parent's two
independent real-PostgreSQL/public-route probes also passed: an unverified Apple
email hint cannot reserve ownership, and a real revocation committed after the
exact session admission read prevents a new login session. The latter includes
a successful authenticated control, a matched original session/token hash and
specific401 SESSION_INVALID, with unchanged session count.

Three additional independent probes failed and prevent integration:
- Removing password via a provider current round fails at public prepare400.
- Pending result reveals the original credential attempt secret to anonymous,
  other-account and revoked-original callers that retain pairing/verifier;
  anonymous/other-account acknowledgment also succeeds. This violates original
  actor/session continuity; it is not claimed as proof of account takeover.
- A normal password-first grant with client:talent-signal-web origin fails409
  in desktop target consume, which hard-codes client:talent-signal-desktop.
  This uses a valid idempotent Apple target reassertion and production password
  step-up; it is not a visible new-provider button or live OAuth test.

Receipts: desktop-login-pg-r22.json and
desktop-credential-counterexamples-r22.json. Independent review is finishing
the exact backend defects and missing deadline/cancellation cases for repair3.
No production state changed and no phase2 code has been integrated.

### 2026-09-25 10:36 repair3 dispatch

Independent backend review is complete at the immutable r22 snapshot: five P1,
no P0. The report is preserved at
`docs/evaluations/account-sync/backend-r22-review.md`. In addition to the three
executed counterexamples, source review found proof-deadline renewal and
cancellation leaving an unused credential grant redeemable. Those two require
parent dynamic confirmation; they are not yet labeled executed failures.

Parent officially cancelled Pi repair2 at283 cumulative replies and resumed
the same task20260925-073216-41f71cc2 with repair3, preserving the frozen
provider/model, session, worktree and600-reply/5-repair limits. Feedback adds
exact regression sequences, current-ack ordering, ordinary/desktop lock-order
collision, real first-password completion and malformed-request coverage. It
also identifies parent6e1f795c Web regression fixes and64600f56 transcript dedup
that must survive integration. A process-only ephemeral ASWebAuthenticationSession
flag is requested for isolated live acceptance; no saved preference or
provider/production mutation is authorized.

The real Apple device-account checkpoint remains pending. Parent continues
independent disposable-PostgreSQL deadline/cancellation probes while Pi owns
implementation. Phase2 has not been integrated or accepted.

### 2026-09-25 10:45 deadline, cancellation and lock counterexamples

Against unchanged immutable f4143338, parent dynamically confirmed the remaining
R4/R5 findings. Five cases include fresh-password and uncancelled-Google positive
controls, both passing. The delayed-proof case extends credential expiry by
about240 seconds and permits a real password write after the original proof
deadline. A logical-time fixture translates relevant stored deadline fields;
it is not a physical-clock or live-provider test. Both WK/system cancellation
return cancelled yet permit a new target and ordinary completion adding Google
to the same Apple account. Independent review confirms these boundaries and
binds the final script/receipt hashes. See desktop-deadline-cancel-r23.json and
backend-r23-counterexample-review.md.

A separate deterministic real-lock test confirms the suspected opposite lock
order: ordinary completion holds the credential row, desktop consume holds the
account row, and the duplicate ordinary request receives PostgreSQL40P01/500
while desktop completes once. No duplicate credential or data loss was observed.
This tests a repeated already-approved provider assertion, which should produce
a domain replay/consumed/stale error. It is not two independent fresh proofs.
Receipt: desktop-lock-r24.json; independent review in backend-r24-lock-review.md
confirms the final harness and its exact error, single-audit and revision+1 guards.
The ordinary500 is a normalized raw function error; the public ordinary HTTP
error mapping is source evidence, not separately executed.
Repair3 already requires both the security fixes and a consistent lock order.

### 2026-09-25 11:02 bounded Web continuation counterexamples

Parent exercised the actual native-host provider reauth Server Action, cookie
seal/read and desktop prepare: the Action creates a valid ordinary operation
and current round, but prepare looks for the recovery-only roleChallenges field
and refuses before backend admission. Three bounded downstream Route Handler
probes separately start from a paired-WK/backend-continuation fixture. Success
and unknown consume both delete pairing before ack/result, causing Web409;
result returns the exact synthetic attempt_secret in page-readable JSON without
sealing the recovered continuation. These are four failed cases across three
root defects, not four independent end-to-end OAuth tests.

Nine direct Web/compiled-client files stayed byte-identical across the tests
and were copied to parent-macos-manual/r25-source for independent review. The
final harness checks specific success destinations, same flow/grant/secret
sealing, actual backend calls and unchanged primary session; its failing cases
do not establish later assertions passed. Independent review confirms each
counterexample and identifies final contract/transport checks to retain.
See desktop-web-recovery-r25.json and web-r25-consumer-review.md.

Pi repair3 is still implementing backend regressions; its native controller is
still the old protocol at this checkpoint. The new Web evidence must be included
in the next consolidated Pi feedback and final candidate acceptance. No new
ready-for-review or live-provider success has been claimed.

Latest storage audit:133GiB available, three allowlisted devices shut down;
non-task artifact warnings remain and were not cleaned. The isolated live Apple
backend has only two challenge receipts and no real provider token. The user
device-account checkpoint remains pending.

### 2026-09-25 11:26 r26 independent proof and repair4

Parent froze 451 backend/contracts files at854f47beec6e930e8cbfb380551abe530d156a86
in the managed account-sync-backend-proof-r26 worktree. Fresh isolated DB
account_sync_desktop_parent_r26 migrated through085; backend typecheck and
71/71 relevant repository tests passed. Independent public-route/production-
function probes passed login2/2, credential3/3, deadline/cancel5/5 and the
original ordinary-versus-desktop completion race1/1. The parent harness was
adapted to the newly attached error schema (code, message, request_id); its
initial serialization500 is neither product failure nor valid rejection proof.
Final original-actor negative receipts require exact409 fingerprint errors or
specific401 authentication errors and include revoked-session acknowledgment.

Three further P1 prevent acceptance. Two public target consumers for the same
grant acquire account/grant locks in opposite order; deterministic real-lock
scheduling records PostgreSQL40P01, wrapped503, no completion audit and no
revision change. Ordinary first-password completion commits once, but original
paired result and ack fail409 because its own revision increment is treated as
pending-state drift. Ordinary Google completion before target cancel returns
cancelled through both WK and system authorities despite a committed grant,
linked provider and one audit/revision increment. Final assertions bind outcome,
actor/account/user scope, exact audit and acknowledgment identities; passing
some earlier assertions does not imply the recovery assertions passed.

The independently reviewed fix uses a complete desktop/grant/account/provider
lock order including trigger-acquired locks, and the same atomic grant/audit
completion fact for ordinary and desktop consumers. It avoids acquiring other
desktop rows from ordinary completion. The rationale is now in ADR0020; precise
findings and hash-bound receipts belong in the r26 evaluation artifacts.

Pi task20260925-073216-41f71cc2 was officially cancelled at360 replies, then
resumed as repair4 with all counters and source preserved. Feedback includes
r26's concrete counterexamples and r25's actual Web consumer failures, while
preserving repaired R1–R5 and parent Web fixes. Bounds remain600 cumulative
replies,5 repairs,7200 seconds per attempt. Parent independently froze the new
61-file native implementation as r27 for review while Pi repairs backend/Web.
No phase2 code is integrated, and no live OAuth success or production/provider
change is claimed. The user Apple Account sign-in checkpoint remains pending.

### 2026-09-25 11:35 native controller and WebKit response boundary

Independent r27 native review covers61/61 hash-matched files from the
turn343–360 implementation, not a final Pi candidate. It finds six P1 covering
owned redirect navigation, premature ACK completion, diverging generation
counters, unconnected result recovery, missing absolute deadline and ambiguous
window teardown. Parent compiled the exact controller plus a byte-identical
WorkspaceOrigin excerpt and executed four counterexamples, all failing with
positive controls: second navigation ownership, ACK response not yet delivered,
injected deadline enforcement and close after consume dispatch. The probe uses
a controlled browser factory/navigation objects, not a real WK or provider UI.
Actual CLI invocation also confirms the required bare ephemeral flag is ignored
by the host's defaults reader although the unused arguments helper accepts it.
See native-r27-review.md, native-controller-r27.json and native-build-launch-r27.json.

A separate bounded WebKit experiment answers the response-transport question.
Actual WKNavigationResponse exposes a correlated200 HTML receipt; cancelling
its document rendering still lets the next WK ACK POST carry the HttpOnly
cookie set by that response. An allow-render control passes; stale correlation
and HTTP500 produce no ACK. Four cases and six loopback HTTP requests support
this narrow header-receipt transport, without a JS credential bridge or cookie
copy. Policy cancellation actually emits WebKit error102 here, so product
handling must fence the exact intentional navigation instead of assuming only
NSURLErrorCancelled. The fixture server and accessory CLI were precisely
terminated after preserving results; NSApplication.stop alone did not promptly
exit that disposable wrapper. No claim is made about product lifecycle or live
ASWebAuthenticationSession. See wk-receipt-boundary-r28.json and binding.

The response contract and the distinction between pending-continuation ACK and
actual credential completion are being independently reviewed before the next
consolidated Pi feedback. Pi repair4 remains active; r27 findings are not yet
closed or integrated. No production/provider/runtime configuration changed.

### 2026-09-25 11:42 repair5 response contract

The independent WebKit-boundary review supports only the measured transport,
and clarifies two essential lifecycle constraints: response-policy rejection
cannot roll back Set-Cookie, and pending continuation ACK is not committed
credential ACK. ADR0020 now preserves current-flow recovery through the ordinary
password form and distinguishes it from a fresh target provider round. Per-flow
cookie ownership must prevent late A from overwriting B; nonce/generation checks
alone are insufficient. A strict fixed-route200 header receipt carries only
non-secret, correlated metadata after real backend work and sealing.

Pi repair4 was officially cancelled at387 replies after reported backend33/33;
its useful source is frozen as625e3b36 in the managed account-sync-relay-proof-r29
worktree (1,224 files, stable hashes). Parent created fresh isolated DB
account_sync_desktop_parent_r29 and began migration/typecheck/repository and
independent consumer retests. The same Pi task resumed repair5 with six native
P1, the real launch-flag mismatch, controller counterexamples, the supported
WebKit boundary and concrete full-consumer contracts. Limits remain600 replies,
5 repairs and7200 seconds per attempt. Existing checks and counters are retained.
The native rewrite is not integrated and live provider checkpoint is unchanged.

### 2026-09-25 12:00 r29 backend and Web consumer checkpoint

Frozen relay625e3b36 (1,224 files unchanged) passed fresh migration085, backend
typecheck and76/76 relevant repository tests. Independent PostgreSQL probes
passed the original15 cases plus cancel/consume4/4 and approve/ordinary2/2:
actual grant-lock admission was forced in both winner orders, with exact
domain replay/refusal, one matching audit and one settings revision increment.
A same-Apple assertion has outcome already_linked; the initial probe's linked
expectation was corrected and its before-receipt preserved as a fixture error.

Two new P1 remain: ordinary target completion reports committed but final ACK
returns unknown (2 target cases fail; set/change-password controls2/2 pass);
anonymous approved-login result incorrectly requires a nonexistent actor
(401 SESSION_INVALID; same-attempt consume succeeds and authenticated control
passes). The independent report also records exact committed-fact discriminator
and regression-test coverage gaps. See backend-r29-review.md and
relay-r29-binding.json. The raw pending-login receipt retains an inherited
top-level admission/revocation description; only its explicit per-case pending
read/consume evidence is claimed, as the review explains.

The four r25 actual Web consumer counterexamples now pass on r29: each begins
with the real Server Action/prepare, then uses real route handlers and cookie
crypto under production cookie policy. Backend HTTP and Next adapters remain
controlled; this does not validate repair5's new200 native header transport,
full native UI or live OAuth. The initial non-production cookie-policy fixture
was corrected without changing product source; before-receipt retained.

Pi repair5 continues on native/Web receipt integration. A94-file immutable
mid-repair snapshot r30 is under independent native review; it is not Pi's
ready_for_review or an integrated candidate. Live Apple authentication still
needs the device account checkpoint. No production/provider configuration or
remote delivery state was changed.

### 2026-09-25 12:10 r30 native review and repair6

Pi repair5 reached ready_for_review at413 replies with repository checks green,
but independent acceptance failed. Every94-file r30 snapshot hash still matched
the ready worker, as did the three backend r29 key files. Full ready source is
frozen as a41b154f in account-sync-relay-proof-r31 (1,225 files) before repair6;
raw Pi summary/patch/checkpoint remains in macos-pi/repair5-ready.

The independent native/Web report groups8P1 across response ownership and
validation, late cookie writes, pending/final ACK, actual Settings continuation
consumers, target entry, cancellation and original deadlines. Parent compiled
the exact controller plus byte-identical WorkspaceOrigin and reproduced5/6
failures: fractional-date parsing, actual response-object HTTP500 recovery,
target deadline extension, committed consume skipping final ACK, and dropped
unused-cancel authority. One corrected setPassword/password controlled-header
recovery sequence passed, as did both actual ProcessInfo CLI launch cases.
The initial wrong-intent positive fixture was preserved separately and is not
acceptance evidence. No whole native app, WK, HTTP or live provider was involved
in this controller probe. See native-web-r30-review.md, native-controller-r30.json
and native-build-launch-r30.json.

ADR0020 clarifies that a native provider-current flow needs its same-flow ACK,
while password-first entry validates the existing Web password proof at backend
prepare. Consumers must resolve the active frozen operation together with its
flow-owned continuation; relay responses cannot restore a shared mutable cookie.
Parent is separately adjudicating the ordinary-login cookie installation race
across windows/stores; Pi must not invent a device registry or auth-cookie scheme.

The same Pi task resumed repair6 with these exact failures and actual-consumer
acceptance sequences. Cumulative repairs were explicitly extended from5 to8
after inspecting the failed evidence; replies remain600 and each attempt7200s,
with counters and frozen MiMo model retained. No phase2 source was integrated.
Live Apple device-account checkpoint remains pending, and no production,
provider, Tailnet, installed-app or remote delivery state changed.

### 2026-09-25 12:22 r31 actual Web consumer counterexamples

On frozen repair5 a41b154f, five independent actual-consumer Web tests fail:
invalid query/body correlation calls backend consume before400 (no cookie
change observed); pending ACK deletes pairing so Result returns409; real
set-password continuation leaves AuthOperation without its grant so the actual
completion Action rejects it; password-first invokes embedded signIn; held A
response writes overwrite B's legacy shared credential cookie while B's active
operation and own continuation remain intact. External HTTP and Next cookie
transport are controlled; this is not rendered UI, actual backend mutation or
real HTTP delivery. The signIn stub intentionally throws, so only its invocation
is claimed, not the resulting provider behavior.

The independent review verified1,225 source hashes and11 execution-bound files.
These tests substantiate existing repair6 findings; Pi was not interrupted just
for their addition. Future held-A regression must validate the actual B consumer
after shared-cookie removal; it must not require retention of the old global
cookie implementation. See web-r31-consumer-review.md and
desktop-web-consumers-r31.json.

### 2026-09-25 12:31 primary-login store decision and r32 proof

Accepted ADR0021 extends the existing origin-based persistent WebKit store
selection with one active epoch, durable login-entry uncertainty and process
ownership. A new primary login with uncertain old writers starts from a fresh
first-party entry/store before credentials or proof; credential Settings rounds
keep the current store. All hosts reconstruct by store epoch. Actual Web login
controls use a synchronous shared submit gate. Read-only authenticated status
must not emit Set-Cookie or reuse Auth.js's cookie-refreshing session endpoint.
The independent design review closed its two concrete seams; OS locking must
use a stable separate lock identity rather than the replaceable journal inode.
Implementation, crash durability, product interactions and real-provider proof
remain unaccepted. Pi repair6 has not yet received this later store decision.

The r32 real-WK experiment supported shared-store late-A contamination and
distinct-store B isolation. With explicit persistent-cookie attributes and
five seconds of graceful observation, a separate .app process reopened B and
sent CookieB on a real HTTP check. Public WebKit cleanup removed exactly the
three task identifiers and verified absence. Independent review verified the
12 bound artifacts. The first bare-CLI and second .app variants failed reopening;
several fixture/lifetime factors changed, so no single-cause diagnosis is claimed.
The first cleanup crashed before WebKit initialization; a nonpersistent bootstrap
then removed those original three identifiers successfully. All three runs'
stores are removed; no product store/preferences were touched.

See login-store-boundary-r32-review.md, race/reopen/cleanup receipts and binding.
This establishes graceful API persistence and isolation only, not coordinator,
crash or installed-app acceptance. The runner's future reuse needs unique run
identity/fresh outputs and process-code gating; current final timestamps, store
IDs, actual wire trace and all three exit0 results independently align. No
additional rerun is justified for the measured boundary.

Backend repair6 source is separately frozen as78c2a85f in
account-sync-backend-proof-r33 (451 files) for fresh migration/typecheck, relevant
repository tests and the27 independent PG cases. Native/Web remain with Pi.

### 2026-09-25 12:43 r33 database closure and consolidated repair7

Frozen backend78c2a85f passed fresh085 migration, backend typecheck and81/81
relevant repository tests with no skips. All ten independent PG harnesses exited0;
all27 cases and source-stability checks passed, including the two ordinary-target
committed-ACK failures and anonymous pending-login failure from r29. Forced real
row-lock schedules, original actor/revocation checks, deadline and cancellation
regressions remain green. The pending-login inherited boundary metadata was
corrected before this execution. See backend-r33-binding.json and the ten r33
receipts. This covers actual PostgreSQL routes/ordinary consumers with controlled
external verification, not Web/native/live OAuth or phase2 integration.

Pi repair6 encountered service500/503 errors, including a15-minute response gap,
then made two further native state/dispatch edits. Parent officially cancelled
at436 replies, preserved checkpoint/patch/untracked files, and confirmed all451
backend hashes still matched r33. The same task/session resumed repair7 with
unchanged frozen MiMo Pro and cumulative limits600 replies/8repairs. Consolidated
feedback retains repair6 actual-consumer defects and adds accepted ADR0021
implementation/acceptance with task-only test registry roots. No counter reset,
provider fallback or unreviewed integration occurred.

Live Apple still requires the user's device Apple Account sign-in checkpoint.
The simulator session remains released and the task-started simulator shut down;
no human provider verification was inferred from the user's continue message.

### 2026-09-25 12:59 r34 actual Web/HTTP/PG consumer assessment

Intermediate repair7 Web/backend/contracts source is frozen as6996b6b7 in
account-sync-web-proof-r34 (1,148 files). All451 backend files match accepted
r33. Web typecheck passed. The five earlier controlled-HTTP consumer tests now
pass with the final flow-owned resolver and actual B password completion after
held A; the old shared-cookie expectation was removed, not the actor/grant check.

A new real loopback HTTP fixture on44339 uses r33 production route registries
and account_sync_web_pg_chain, with a controlled Apple verifier and fixture
Web cookie encoded from its real backend login. Normal password completion and
dropping its actual HTTP200 response both pass the full Web Action/relay/result/
final-ACK chain. Each checks canonical actor, one completion request, revision+1,
audit1 with exact kind/account/user, stored password and consumed grant. Next
cookie transport remains an adapter; no WK, system-browser callback or live
OAuth claim. Initial fixture syntax, missing iterator and final-ACK outcome
expectation were corrected; raw earlier runs are preserved.

Independent review nevertheless finds2P1, now reproduced by4 additional real
HTTP/PG counterexamples. Password-first step-up returns201 but redirects before
sealing the new grant/round; next prepare is stale and never reaches backend.
The apparent sealed operation is the previous set_password flow. Provider-first
current consume+ACK succeeds but continueTargetLink rejects its operation before
using the resolver, so no target prepare runs. Cancel accepts mismatched and
missing body ref by substituting the query ref, and both actual attempts change
from prepared to cancelled. These4 failures remain separate from5+2 passes.

See web-r34-consumer-review.md, the successful and counterexample receipts and
separate bindings. Prepare still returns303 in this snapshot, so these tests do
not establish the required strict200 native transport. Pi repair7 continues on
store ownership/native code; these newer findings are pending consolidated
feedback. No phase2 source is integrated and no production/provider/installed
application state changed. The chain fixture server/DB are task-only and retained
for final-source reruns, not resident deployment.

### 2026-09-25 13:01 consolidated repair8 dispatched

Parent officially interrupted ongoing repair7 at471 replies to supply the
completed r34 target/cancel counterexamples before another full local check
cycle. This checkpoint was still in progress, not ready_for_review. The actual
patch, untracked sources and812 native/Web/contracts hashes are retained in
macos-pi/repair7-checkpoint; all451 backend hashes still match r33.

The same task/session resumed repair8 with existing cumulative limits600replies/
8repairs and frozen MiMo Pro. Feedback names both actual downstream target
failures, invalid-body cancellation effects, every required strict200 native
route, actual Settings consumers and ADR0021 production wiring. It preserves
the successful5+2 Web slices and accepted backend81+27. No counters were reset
or source integrated. Parent live-provider and final signed native acceptance
remain open; the user Apple Account checkpoint is unchanged.

### 2026-09-25 13:40 ready520 rejection on exact consumers

Pi repair8 returned ready_for_review at520 replies. Its local checks report
81 backend,1367 Web(+1skip),176 native(5skip), types/docs and a signed local
candidate. Parent froze1,234 source files as r36 commits ee9ef2fa/3aa05014,
including the worker architecture checker in the second commit. The five
controlled-HTTP Web cases and two actual HTTP/PG password/drop-recovery cases
still pass. The prior four target/cancel cases now pass3/4: password-first
target prepare and both invalid-body cancellation cases close, while
provider-first target prepare remains stale.

Full target completion adds two failures beyond the earlier entry-only test:
password-first prepare/approve succeeds but Web never resolves the server-sealed
grant secret for target consume, causing backend409/Web303. Provider-first
Action now redirects and seals a target round, but target resolution still
requires operation.attempt which the relay does not write. Independent review
confirms neither failure is a fixture omission of a legitimate native argument;
the secret must remain sealed server-side. Downstream target role/ACK context
are source-only gaps because execution stops earlier. Real visible target
entry is not proven by directly invoking the Action. See target-r36-review.md.

Actual compiled native controller also passes a fresh password-target prepared
positive, then fails currentA prepared/callback/consume/ACK followed by targetB
prepared: dispatch inherits the retained A attempt. This is Foundation response
and controlled AS evidence, not actual WK. The registry helper still has no
production host caller; real browsers keep the old deterministic origin store.
Primary login redirect, request-ref alphabet and host cancellation review is
being completed separately. See ready-r36-binding.json and bound receipts.

Backend runtime was not preserved: new databaseNow uses transaction-start now().
A real PG D-row lock crosses code expiry, after which r35 consumes and creates
a user/session; r33 corresponding case410/zero writes. Both positive controls
pass. Database timestamps prove the r35 ordering; app executedAt and DB clocks
do not share a demonstrated timeline. See backend-r35-review.md and binding.
Parent decision is to revert the unrequested partial runtime clock policy to
r33, retain justified DB assertion improvements, and avoid claiming a complete
clock-drift fix. Older shared expiry seams remain explicitly outside this
bounded closure. No phase2 source is integrated or installed.

### 2026-09-25 13:43 consolidated repair9 active

Independent native/Web review confirms5 P1 groups: disconnected real store
ownership/durability, swallowed primary-login redirects and incomplete client
gates, inherited current-round context for target/recovery, mismatched native
request-ref alphabet, and missing actual WK cancellation error/ownership routing.
The reviewer ran the real Next redirect baseline and actual primary Actions
with controlled Auth/provider responses: baseline passes; password/Google/Apple
redirect propagation and valid native underscore-ref acceptance fail. Cookie
effects in this probe are synthetic, not a live login. See native-web-r36-review.md,
desktop-primary-login-r36.json and native-web-r36-binding.json. Additional
semantic deadline/cancel and restart boundaries are explicitly source-only.

Parent preserved repair8 ready520 and dispatched the same task/session as
repair9 at05:43:05Z (pid37716). Feedback binds the backend clock regression,
actual full target failures, A/B controller failure, real registry composition,
primary Actions and producer/consumer transport contracts. Cumulative limits
were explicitly extended to750 replies/9repairs after inspecting the failed
ready candidate; provider/model remain MiMo Pro, no counters reset or silent
billing fallback. The1,234 worker files still matched r36 before dispatch.
Final native/Web report became available immediately after dispatch and is at
the exact path already supplied in that feedback.

Storage readback:127GiB free, all3 allowed simulators shutdown. Exit2 covers
existing unrelated artifact warnings, not a new simulator violation. No cleanup
or installed preferences were changed. Live Apple still awaits the original
human Apple Account sign-in checkpoint; no new identity verification is inferred.

### 2026-09-25 13:55 primary-status correction and composition checkpoint

A further bounded primary-status probe found the route selected the secondary
workspace token after merely checking that primary claims exist. Expanded real
HTTP/PG tests reproduce3 failures among7: wrong secondary actor, revoked A
validated by live B, and damaged secondary cookie throwing before the catch.
Parent fixed only the route and added7 repository regressions on isolated
r37 commit e765d3bf. The same real HTTP/PG7 now pass; repository7 and Web
typecheck pass. Independent review closes this P1. The fixture uses valid
production sealing for a synthetic ordinary B; actual Lab creation/WK are not
claimed. See primary-status-r37-binding.json and status-r37-review.md. This
small parent-owned commit MUST be retained on later phase2 integration.

Repair9 was officially cancelled at549 replies while still in progress, before
its normal Mac check. Draft composition creates a registry per browser, resolves
errors to a temp fallback then force-unwraps, replaces only WKWebView while
controller closures retain the old view, and rotates only on provider entry.
The macOS unit target has TEST_HOST pointing to the real application, while
its test launch lacks an explicit registry root. Parent checked the default
PrimaryLoginStores directory is absent before and after cancellation; no
product registry was initialized.1251 source hashes plus actual patch/untracked
files are preserved in macos-pi/repair9-checkpoint; this is not a ready candidate.

ADR0021 now states the concrete production composition: one app coordinator,
stable host IDs outside keyed browser lifetimes, entry-before-input rotation,
whole view/controller reconstruction, correlated same-store primary readback,
and fail-closed XCTest bootstrap isolation. Independent design review is being
run before the same Pi task receives repair10. No counters are reset, no phase2
source is integrated and the human Apple sign-in checkpoint remains pending.

### Reviewed composition and new delivery instruction — 14:10 local

The parent cancelled repair9 at549 replies, preserving1251 source hashes and
the draft before app tests could touch the standard registry. ADR0021 now
requires one injected app coordinator, immutable whole-host reconstruction,
inert-before-ownership native login rendering across client/history routes,
host-owned isolated-world same-store status, and explicit test root/origin/fresh
WK identifiers with no installed-state adoption. Independent r38 closure
review closes its3P1+1P2 at design level only.

Repair10 resumed the same Pi task/session at549 replies with750 cumulative
replies/10repairs/7200seconds and the frozen MiMo Pro provider. Its feedback
requires all unfinished repair9/R36 fixes and the independently accepted
e765d3bf two-file primary-status correction. Source integration and real app
acceptance remain pending.

The user subsequently explicitly authorized parent judgment, full merge and a
new release after correctness checks, and requested login-page aesthetic
improvement. This supersedes the earlier parent-level no-publication boundary
for this task's reviewed changes. Pi's current contract remains implementation
only; parent owns PR, exact-head CI, merge, deployment and release verification.
The authorization does not waive real identity proof, production-data conflict
review, signing requirements or the user's own Apple authentication step.

Parent is preparing two rendered login directions under task-owned artifacts
and an independent read-only release-readiness review while Pi repairs the
account flow. Parent will integrate visual changes after Pi's overlapping login
source is stable; no parallel edits to Pi files. No release has been published.

### Login visual implementation and real password check — 14:30 local

The user's aesthetic request is implemented in four parent-owned presentation
files (AccountContinuity, login page/CSS, AccountAccessForm headings). Independent
r39 rendered A/B review selected A desktop / single-column mobile. Its requested
readability/target corrections are applied. The running parent source on4612
passed real synthetic-account password success, wrong-password recovery and
logout; 320px DOM has no horizontal overflow. Light/dark, registration-switch
and collision-copy screenshots are preserved in login-design-r39 with source
hashes. Typecheck, focused ESLint and diff check pass. This does not replace
phase-two native or live-provider acceptance. Preserve these presentation
edits when integrating Pi's overlapping login page/form; do not overwrite them
with the old snapshot. Next's generated temporary path changes were restored.

Read-only release review confirms iOS11/11 credential names, no current valid
Developer ID Application certificate/identity, and preserved matching CSR/key.
The parent subsequently opened the existing Apple portal using native Chrome
accessibility: team6RG2F8YY59 allows selecting Developer ID Application and
shows the CSR/G2 form. No CSR was uploaded, certificate issued or private key
exported. This establishes the interactive application path, not a role label
or completed signing identity. Parent still owns all release mutations.
