# Talent Signal V1 system and experience acceptance

## Outcome

Implement the 2026-08-24 Notion decision draft as one evidence-first Talent
Signal V1: a goal-oriented Pursuit CRM with an iOS capture and review client,
canonical backend state, a bounded Claude Agent SDK worker, deterministic and
multi-trial evaluation, and a release-quality recruiter experience.

Completion requires a frozen current build to satisfy all safety release gates,
at least 99 of 100 directly observed product-experience atoms, at least 99 of
100 REVIEW/documentation atoms, and a contract-valid specialist panel in which
every selected reviewer scores 4/4 with no active veto. The atomic scores are
acceptance accounting, not an average of unrelated specialist judgments.

## Boundary

In scope:

- PRD-00 through PRD-09 from the Notion blueprint, implemented in dependency
  order and traced to the `V1-*` requirement IDs;
- the recruiting Pursuit as the complete flagship path and one sales fixture as
  a schema-compatibility proof;
- iOS Today, Pursuits, People, Capture, Inbox, Review, and contextual Guide;
- local durable capture, source lineage, identity ambiguity, proposal review,
  revisions, receipts, retry, reconciliation, deletion, and recovery;
- canonical account/workspace-scoped backend contracts and state;
- one bounded Agent runtime with typed read/stage tools, schema validation,
  fingerprints, budgets, and no direct business or external-effect authority;
- deterministic, Simulator, accessibility, Agent-eval, and full-stack evidence;
- versioned plans, PRDs, REVIEW evidence, and adjudication packets.

Out of scope unless the user separately authorizes it:

- sending candidate messages, creating meetings, or writing ATS/CRM state;
- importing real candidate conversations into tests or model runs;
- ambient capture, automatic identity merge, candidate-worth/fit/probability
  scores, arbitrary shell/web/model tools, or a second canonical data owner;
- production deployment, credentials, provider purchases, or external account
  mutations;
- calling early-access field evidence complete without real design partners.

## Frozen starting evidence

- Design source: Notion `Talent Signal V1 ... v2.0`, dated 2026-08-24.
- Starting commit: `948218c`.
- The worktree is not clean. Existing staged project relocation/deletion and
  unstaged iOS archive work predate this plan and are preserved as user-owned
  work; implementation must inspect and integrate rather than revert them.
- The repository already contains a TypeScript/Fastify/PostgreSQL backend,
  evidence/identity/action modules, a generated SwiftUI project, local capture
  and screenshot-review flows, and broad Web/backend evaluations.
- The current native root is an uncommitted `RelationshipArchiveView`; it has
  not yet been accepted as the Notion V2 Pursuit IA or frozen in Simulator
  evidence.
- The Notion target proposes Spring/Python Agent SDK. Existing TypeScript
  canonical services are retained until a contract or reliability test proves
  a rewrite is necessary; stack novelty is not a user outcome.

## Product-owner defaults used to keep work moving

These remain reversible decisions until field evidence or the user changes
them:

- flagship users are independent recruiters and boutique/executive search;
- account contracts allow one owner plus minimal 2–5 member roles, without an
  organization-admin product;
- public Web research is off by default and must be explicitly enabled for a
  Pursuit in a later release;
- draft outreach supports copy/system share only and never sends;
- milestone vocabulary stays minimal and template-owned;
- no real source upload or retention claim ships until storage region,
  transcription provider, and default retention are explicitly decided.

## Design read

Primary surface: iOS Today and Pursuit workspace for an independent recruiter.
User question: “For this target outcome, what changed, what is still unknown,
and what is the smallest safe step I can review now?”

Visual character: quiet editorial notebook, warm neutral canvas, deep ink,
scarce vermilion at the evidence-to-change seam, native platform chrome, low
motion, and medium density. Pages and whitespace group ordinary reading;
containers are reserved for selectable, reviewable, or recoverable work.

Canonical objects: Workspace, Person, Organization, Pursuit, PursuitRole,
Criterion, Signal, Evidence, Claim, Gap, Action, AgentProposal, Operation, and
Receipt. Today, lists, pages, timelines, Guide context, and Agent snapshots are
rebuildable projections.

## Milestones

1. **Freeze and reconcile the baseline — complete.** Render the current iOS and
   backend state, inventory every `V1-*` requirement, capture checks, and write
   the PRD/acceptance skeleton without overwriting concurrent work.
2. **PRD-00/01 contract foundation — complete.** Add account scope, Pursuit domain,
   revisions, role/criterion/gap/action contracts, migrations, generated client
   boundary, and recruiting/sales contract fixtures.
3. **PRD-02/04 real text capture slice — complete.** Make local capture durable and
   idempotent through backend Signal, bounded proposal, item-level review,
   conflict/unknown reconciliation, canonical apply, and structured Receipt.
4. **PRD-05 core iOS workspace — complete.** Ship Today, Pursuits, Pursuit detail, People,
   Person detail, Inbox, Review, and contextual Guide using the same governed
   state and complete loading/empty/ambiguity/failure/stale/superseded states.
5. **PRD-06 system capture and PRD-07 evidence integrity — complete.** Add the
   supported App Intent paths, multi-source outbox, identity review, source
   deletion lineage, relaunch recovery, and account isolation.
6. **PRD-03/08 bounded Agent and evaluation — complete.** Add the Claude Agent SDK worker
   only behind typed tools and backend authorization, then deterministic
   oracles, multi-trial critical cases, fingerprints, cost/latency receipts,
   and all twelve P0 journeys.
7. **PRD-09 hardening and 99+ adjudication.** Run Release builds, all repository
   checks, small-phone/AX5/VoiceOver/dark/reduced-motion/offline tests, freeze one
   evidence bundle, collect independent specialist packets, fix every veto and
   affected finding, and publish the final REVIEW decision.
8. **User-led visual, data, and identity correction — active.** Treat the
   2026-08-24 direct usability critique as stronger experience evidence than the
   atomic ledger. Recompose Today around one calm focus and compact continuation,
   remove page-local feed/search noise, make Ask a conversation-first surface
   with canonical database search and scoped task results, and add production
   Sign in with Apple, durable account-scoped sessions, and explicit sign-out.
   Freeze new small-phone, AX5, auth, empty/error/retry, and real-backend evidence
   before another specialist panel. Milestone 7 cannot complete until this
   correction is proven.

Only one milestone is active at a time. Each milestone must leave contracts,
tests, and a resumable checkpoint before the next begins.

## Checkpoint — baseline adjudication

The frozen artifact, 29-requirement trace, four independent specialist packets,
and adjudication are in
`docs/evaluations/2026-08-24-v1-baseline/`. The panel is `fail / block` with one
shared active veto: the iOS relationship review presents sheet-local state as a
confirmed canonical write. Requirement accounting is 0 proven, 3 implemented
but unverified, 15 partial, 10 missing, and 1 directly violated. The violated
item is `V1-TST-003`: deterministic launch arguments are compiled into Release.

Milestone 2 must therefore begin with the canonical Pursuit aggregate and a
versioned internal review operation. Its first executable acceptance case is:
an applied decision returns a structured receipt and survives readback, while
duplicate, stale, concurrent, failed, unknown, dismissed, and relaunched paths
never present false success.

## Checkpoint — PRD-00/01 contract foundation

Contract `2026-08-24.1` and migration `020_pursuit_domain` now provide the
account-as-workspace boundary, Organization, Pursuit, contextual role,
criterion, evidence-aware gap, owned internal action, versioned operation, and
structured receipt. The shared client exposes list, create, detail, revision,
and operation readback without an iOS-owned URL.

Fresh PostgreSQL proof in
`docs/evaluations/2026-08-24-v1-prd-01/pursuit-domain-runtime.json` passes
recruiting/sales schema reuse, one Person with different contextual roles,
canonical readback, duplicate replay, concurrent and stale conflict, tenant
isolation, owner isolation, gap attribution, and the empty-external-effect
invariant. Seven requirements are promoted in the adjacent requirement delta.
The baseline veto remains active because Proposal review and iOS have not yet
been connected to these receipts; milestone 3 owns that exact closure.

## Checkpoint — PRD-04 canonical review readback

Contract `2026-08-24.4` and migration `021_pursuit_proposal_review` now provide
bounded Proposal staging, item-level human decisions, one-revision canonical
apply, durable conflict operations, idempotent replay, structured receipts, and
database-enforced empty external effects. Fresh PostgreSQL proof in
`docs/evaluations/2026-08-24-v1-prd-04/pursuit-proposal-runtime.json` passes the
backend safety and recovery matrix.

The iOS review surface no longer owns a local “confirmed” flag. Its disconnected
preview has no confirm control, while its connected path shows success only
after Proposal, Receipt, and Pursuit readback agree. A current iPhone 17 Pro
Simulator test and the matching PostgreSQL rows are frozen in
`docs/evaluations/2026-08-24-v1-prd-04/ios-canonical-review-runtime.json` and
`ios-canonical-review-receipt.png`. This closes the baseline false-success veto
for the proven canonical-apply path. The same frozen surface now proves exact
item decisions and edits, canonical identity/evidence provenance, and a real
response-loss path that locks the operation, survives process termination, and
reconciles on relaunch with exactly one POST, operation, and receipt. iOS
offline/stale/deletion behavior and Pursuit-first navigation remain active
acceptance work.

## Checkpoint — PRD-05 Pursuit-first iOS workspace

Contract `2026-08-24.5` and the native workspace now make Today, Pursuits, and
People the primary information architecture. Today orders pending governed work,
owned due internal actions, and evidence-backed gaps; it never ranks a person.
Pursuit and Person pages read the same account-scoped canonical backend, and
Inbox opens the existing Proposal/Receipt/revision review loop. Failed reads do
not substitute preview facts; refresh failure retains the last canonical read
only with explicit uncertainty.

The frozen iPhone 17 Pro and iPhone 17e evidence in
`docs/evaluations/2026-08-24-v1-prd-05/` covers canonical navigation, empty and
no-action states, offline retry, stale refresh, governed identity layout, AX5,
dark mode, reduced motion, and account isolation. The backend evaluator passes
9/9 checks against exactly two synthetic Pursuits, two People, and two open
Proposals; the current iOS bundles pass 1 canonical, 4 support-state, 1
small-device AX5, and 8 unit tests. Production authentication, design-partner
value, manual VoiceOver, real-device, localization, Chinese, source deletion,
and external effects remain explicitly unproven. Milestone 5 owns the remaining
capture and evidence-integrity work.

## Checkpoint — PRD-06 system capture

The native Capture rail and generated App Shortcuts now converge on one
purpose-bound chooser. `Capture Signal` and `Record Signal` require immediate
foreground presentation; the screenshot shortcut remains a background local
enqueue. The audio surface cannot present recording until purpose,
authorization, permission, foreground state, audio input, and recorder start
all succeed. A completed stop produces a protected local payload and checksum
receipt; deletion removes both payload and metadata. There is no audio upload,
transcription, Proposal, canonical change, or external effect in this slice.

The frozen bundle in `docs/evaluations/2026-08-24-v1-prd-06/` contains Release
App Intent metadata, the light lifecycle and AX5 dark screens, 8/8 focused unit
tests, 3/3 focused UI journeys, a clean Release build, and a Release-compiled
test proving all deterministic launch arguments are inert outside DEBUG.
Physical Action button, real-device microphone, and manual VoiceOver evidence
remain missing. PRD-07 now owns source availability, deletion propagation,
identity ambiguity, and account-scoped evidence lineage.

## Checkpoint — PRD-07 evidence and identity integrity

Contract `2026-08-24.6` and migration `022_pursuit_evidence_integrity` propagate
source authority through Pursuit roles, gaps, Proposals, and Today without
rewriting durable evidence references. Source deletion supersedes open
dependent Proposals, blocks their review, records Proposal/item lineage, and
returns partial or unavailable authority while explicit user-authored state
remains attributable and `not_required`. Canonical display order prevents UUID
ordering from changing recruiter-authored role, criterion, gap, or action
sequence.

The frozen synthetic PostgreSQL artifact in
`docs/evaluations/2026-08-24-v1-prd-07/pursuit-evidence-integrity-runtime.json`
passes all 14 identity, authority, deletion, Today, retry, lineage, and account
isolation checks. The iOS surface blocks stale evidence review and keeps typed
Signal outboxes workspace-partitioned; a saved payload is not opened until
authenticated workspace and canonical Pursuit readback agree. Physical-device
workspace switching and real-candidate privacy operations remain missing
proof. PRD-03/08 bounded Agent and evaluation is now the only active milestone.

## Checkpoint — PRD-03 bounded Agent control plane

Contract `2026-08-24.7`, migration `023_agent_control_plane`, and the new
`@talent-signal/agent` package now provide a provider-neutral bounded runner and
Claude Agent SDK `0.3.241` adapter. One immutable run scope exposes only
`read_pursuit`, `read_evidence`, `stage_pursuit_proposal`, and
`record_no_action`; built-in tools, settings, Skills, plugins, subagents,
session persistence, identity decisions, canonical apply, and external effects
are unavailable. Backend capability handlers recheck workspace, Pursuit
revision, Capture binding, evidence authority, schema, and budget outside the
model.

The synthetic PostgreSQL artifact in
`docs/evaluations/2026-08-24-v1-prd-03/agent-control-plane-deterministic-runtime.json`
passes six adversarial cases five times each, idempotent replay, eight complete
fingerprints, review-only Proposal state, empty external effects, cross-workspace
hiding, payload-free tool journals, and fresh-snapshot recovery. The adjacent
live artifact truthfully records `not_run_missing_credentials`; it is missing
provider proof, not a pass. PRD-08 P0 aggregation and the final iOS/full-system
gate remain active.

## Checkpoint — PRD-08 deterministic P0 evaluation

The versioned manifest and machine runner in
`docs/evaluations/2026-08-24-v1-prd-08/` pass all 12 P0 journeys with 51
artifact-level final-state assertions. The frozen iPhone 17 Pro xcresult passes
89 of 90 tests with zero failures; the only skip is the documented opt-in
legacy localhost fixture, while its canonical replacement paths run against
dynamic isolated backend/proxy ports. Agent evaluation passes 30 of 30
database-backed deterministic trials and keeps the credential-gated live
artifact as explicit missing proof.

The final requirement trace now has 26 of 29 requirements proven, one
implemented but live-provider-unverified requirement, two hardware/manual
accessibility partials, and zero missing or violated requirements. PRD-09 owns
the small-device proof, repository-wide gates, atomic 99+ accounting, and final
specialist adjudication.

## Checkpoint — final-panel correction loop and retest-03

The first frozen panel identified four release-relevant gaps: same-name Text
Signal choices did not expose enough stable identity, Today could hide owned
action context, action work had no observed-outcome closure, and trusted review
readback did not bind every Receipt field to the submitted operation. Retest-02
closed those gaps but exposed a deletion false-success, value-equality milestone
authority, and an iOS action response-loss recovery gap.

Today now renders one consolidated card for every attention-bearing Pursuit
without a display cap. Each card retains target outcome, date, blocker,
evidence freshness, owner, due action, and pending Proposal context. Owned
actions complete only through an owner-authored outcome, revisioned idempotent
Receipt, and canonical readback with empty external effects. Contract
`2026-08-24.9` makes the durable client operation ID part of the completion
request and canonical operation. iOS persists draft, ID, and receipt; response
loss locks and reconciles by exact ID after relaunch without a second POST.

Text Signal uses a searchable untruncated scope list with relationship context
and a stable Person record clue, then verifies workspace, Person, role, and
context identifiers after sync. Proposal
success additionally binds operation, workspace, actor, outcome, Proposal
status, and exact Pursuit revision. Migration `025_milestone_authority_pointer`
makes current milestone authority follow the exact latest mutation rather than
value equality. Source deletion now proves raw source canaries and source-derived
Proposal, operation, and audit narratives are absent; an applied milestone keeps
its historical value while authority becomes unavailable with non-content
confirmer, time, Receipt, and deletion lineage.

The third frozen artifact is being assembled under
`docs/evaluations/2026-08-24-v1-final-panel-retest-03/`. Credentialed Claude,
physical Action button, real-device microphone/privacy behavior, manual
VoiceOver traversal, and field recruiter/candidate outcomes remain explicit
missing proof rather than local release claims.

## Checkpoint — direct usability correction

The user inspected the current product surface and found that Today had no
visual resting point, insufficient negative space, too many labels and boxes,
an unwanted inline feed/search control, and a bottom Guide rail dominated by
explanatory copy. Ask was not yet an AI-conversation surface, search still read
synthetic samples instead of canonical People/context data, and the native app
had no production login or sign-out boundary. The retest-03 `99/100` experience
ledger therefore remains trace accounting only and is not evidence that the
visual experience is acceptable.

The correction outcome is one observable mobile loop: an authenticated
recruiter can open a sparse Today screen, understand the single strongest focus,
continue through compact unbounded attention rows, open Ask, search the same
account-scoped backend People/contexts, submit one scoped conversational task,
see answer/evidence/action blocks without a canonical write, and sign out so no
prior-workspace screen or bearer token remains reachable. Exact evidence,
revision, provenance, and authorization details stay available one deliberate
step away instead of occupying the first scan.

Completion evidence for this checkpoint is a fresh Release-compatible build,
focused backend and native tests, real loopback database readback, Simulator
screens on the current Pro and 375x667-class device at default and AX5 sizes,
dark/reduced-motion/error/empty/retry states, auth contract tests including
invalid audience/issuer/nonce/replay and revoked-session rejection, and a new
independent panel tied to one frozen artifact. Apple developer credentials,
physical-device Apple Account UI, and production deployment remain missing
proof until separately available; local UI or mocked token tests cannot be
represented as those outcomes.

## Completion evidence

- a requirement trace matrix covering every `V1-*` ID with code, test, and
  observed artifact locators;
- all twelve P0 journeys with deterministic final-state oracles;
- zero silent identity merge, cross-workspace access, unauthorized or duplicate
  effect, unverified-success presentation, or unsupported confirmed claim;
- release builds with no debug automation, test token, mock endpoint, or secret;
- direct Simulator evidence on a 375x667-class device and a current Pro device,
  at AX5, VoiceOver, light/dark, reduced motion, Chinese/English, offline,
  interruption, retry, stale, conflict, deletion, and recovery states;
- `pnpm check`, `pnpm ios:check`, focused backend/full-stack checks, and Agent
  eval gates passing on the frozen version;
- a 100-atom UI/experience result with 99+ observed passes and every critical
  atom passing;
- a 100-atom REVIEW/documentation result with 99+ observed passes;
- valid recruiter-workflow, evidence-safety, mobile-UX, candidate-experience,
  and (only where assessment behavior exists) selection-science packets tied to
  the same artifact, followed by a contract-valid adjudication JSON;
- any missing design-partner, production, real-device, or qualified human
  evidence is labeled as missing and cannot be converted into a release claim.

## Re-plan signals

- the Notion draft conflicts with a repository safety/canonical-owner contract;
- the existing TypeScript backend cannot pass a required invariant without a
  bounded architectural change;
- a current uncommitted file overlaps the active milestone in a way that cannot
  be safely integrated;
- a selected reviewer issues a veto or reviewers saw different artifact states;
- a decision on retention, storage region, public research, or external effects
  becomes necessary for the next safe slice;
- field or executable evidence falsifies the Pursuit-centered information
  architecture.
