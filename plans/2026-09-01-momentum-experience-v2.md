# Momentum Experience V2

Status: proposed execution plan
Requested by: product owner
Repository snapshot assessed: `7b36e1ca9a8768746db97ca4ab430f87f53751f1`
Primary surface: iOS Capture / Today / Session
Primary audience: an interrupted independent recruiter advancing several
high-value searches

## Outcome

Make Talent Signal measurably smoother, smarter, and more effective at
advancing a governed recruiting relationship than the comparable Ailoha and
manual-fallback journeys, without weakening identity, evidence, authorization,
privacy, reversibility, or outcome verification.

The experience contract is:

> One intent, one brief, one decision, one receipt.

The user question is:

> I just received this information. What does it mean, which outcome does it
> affect, what should I do now, and did the action actually complete?

The target loop is:

```text
intent
-> immediate source-local first read
-> authorized contextual brief
-> one current dependency and next move
-> exact human decision when consequence requires it
-> controlled effect or safe handoff
-> observed receipt
-> next meaningful question
```

## Boundaries

### In scope

- iOS information architecture and interaction flow for Today, Session,
  capture, evidence, decision, effect, receipt, and recovery;
- a behavior-preserving iOS state-ownership refactor before visual expansion;
- a two-speed response architecture for immediate local value and later
  governed context;
- typed Brief and experience-event contracts shared across Backend and iOS;
- convergence of local Session continuity with the durable Agent Task
  projection without making either a second source of truth;
- one production-shaped effect slice, beginning with the existing one-way
  Apple Calendar capability;
- outcome, correction, latency, accessibility, privacy, and field evaluation;
- removal of superseded primary paths only after the replacement is proven.

### Out of scope until evidence reopens the decision

- a general relationship operating system or general-purpose life assistant;
- candidate fit, quality, personality, protected-trait, culture-fit, potential,
  or acceptance-probability inference;
- autonomous sending, stage movement, or multi-agent delegation;
- a microservice rewrite, graph database, Temporal adoption, or a new iOS
  architecture framework solely for fashion;
- ambient collection of private conversations;
- a broad Contacts, ATS, CRM, and messaging rollout before one effect contract
  is proven end to end;
- a visual rewrite that abandons Talent Signal's existing typography, quiet
  neutrals, restrained vermilion, or evidence grammar.

## Program completion standard

Momentum Experience V2 is not complete because code was merged, a model
answered, or a screenshot looked polished. It is complete only when all of the
following are true on one frozen release candidate:

1. No mandatory relationship or Pursuit choice is required before the first
   useful, explicitly provisional source-local read.
2. Every decision-relevant contextual claim reaches currently authorized exact
   evidence in one step.
3. Fact confirmation, action approval, and outcome verification remain three
   independent gates.
4. Every external write has an exact-effect approval, stable operation ID,
   destination observation, and recoverable Receipt.
5. Ambiguous identity, stale evidence, insufficient evidence, no-action,
   permission loss, timeout, interruption, and deletion remain truthful and
   recoverable.
6. The ordinary path meets the real-device experience budgets frozen in
   MX-00; open-ended research never blocks the first useful read.
7. The same frozen build passes the required recruiter, evidence-safety,
   mobile-UX, and candidate-experience review packets with no active veto.
8. A blinded crossover study shows the target Talent Signal journey beating
   both the comparable Ailoha journey and the recruiter's manual fallback on
   the predefined primary measures without increasing identity, evidence, or
   effect errors.

## How an AI should execute this plan

Run exactly one numbered Goal at a time. Before editing, the executing AI must:

1. freeze and record the current revision and worktree state;
2. read `AGENTS.md`, `docs/README.md`, and the smallest canonical branch named
   by the Goal;
3. restate the Goal outcome, explicit non-goals, owned files, and proof;
4. inspect existing tests and rendered behavior before choosing an
   implementation;
5. preserve unrelated user changes and avoid adjacent refactors;
6. write the failing contract, test, or evaluation fixture before changing
   behavior where practical;
7. stop if an unknown would change product authority, evidence scope, effect
   authority, or the selected design direction;
8. finish only after the Goal's exit gate is directly evidenced.

Use this prompt prefix for each execution turn:

```text
Implement only Goal MX-XX from
plans/2026-09-01-momentum-experience-v2.md. Preserve every listed invariant and
non-goal. Freeze the current artifact before editing, keep one owner per state
or effect, make the smallest complete change, run the specified evaluation and
verification, and do not mark the Goal complete without its exit evidence.
```

## Evaluation governance

Every consequential Goal freezes an artifact ID, commit/build, scenario,
environment, and enumerated evidence bundle before review.

The smallest sufficient recurring panel is:

- `recruiter-workflow-reviewer`: operational value and interruption cost;
- `evidence-safety-reviewer`: identity, evidence, privacy, retention, action,
  and effect authority;
- `mobile-ux-reviewer`: task completion, hierarchy, accessibility, recovery,
  and performance feel;
- `candidate-experience-guardrail`: candidate trust, communication, consent,
  waiting, and follow-through.

Add `selection-science-auditor` only when a model, rubric, grader, benchmark,
or output approaches candidate assessment. Do not average specialist scores.
Any active wrong-identity, unsupported-fact, unauthorized-write, privacy,
inaccessible-decision, or prohibited-assessment veto blocks release.

Each packet must pass:

```bash
python3 .agents/skills/product-adjudicator/scripts/validate_review.py \
  path/to/review-or-panel.json
```

## Required scenario bank

Every release candidate includes at least:

- `TS-CORE-01`: deadline, offer, preference, and availability;
- `TS-CORE-02`: no actionable change;
- `TS-CORE-03`: ambiguous date and timezone;
- `TS-CORE-04`: retraction and supersession;
- `TS-CORE-05`: conflicting sources;
- `TS-CORE-06`: stale recommendation;
- `TS-ID-01`: same-name people;
- `TS-ID-02`: speaker-side inversion;
- `TS-ID-03`: forwarded third-party statement;
- `TS-ID-04`: unrelated third-party personal data;
- `TS-ACT-01`: availability is not meeting consent;
- `TS-ACT-02`: destination already contains the resource;
- `TS-ACT-03`: timeout after successful Calendar write;
- `TS-ACT-04`: permission revoked at confirmation;
- `TS-UX-01`: AX5 hides decision context;
- `TS-UX-02`: VoiceOver reads action before evidence;
- `TS-UX-03`: offline import and termination;
- `TS-UX-04`: polished rubber-stamping;
- `TS-BOUND-01`: unsupported fit score.

Fixtures must be synthetic or purpose-approved and de-identified. Private
candidate content must not enter source control, telemetry, screenshots, model
judge prompts, or review packets.

---

## MX-00 — Freeze the baseline and definition of “better”

### Outcome

Create one reproducible baseline for current Talent Signal, comparable Ailoha
behavior, and the recruiter's manual fallback before changing product behavior.

### TODO

- [x] Freeze Talent Signal commit, iOS build, backend/Agent versions, device,
      OS, locale, network condition, and scenario fixtures.
- [x] Freeze the comparable Ailoha build or record why a scenario cannot be
      compared directly.
- [x] Run the required scenario bank through current Talent Signal.
- [x] Record screen video, accepted screenshots, accessibility hierarchy,
      task-event trace, and destination state where an effect exists.
- [x] Record the manual fallback journey for the same objective without
      collecting unauthorized candidate data.
- [x] Define the primary measures and the rule for a comparative win before
      observing the redesign.

### Initial candidate experience budgets

These are targets to validate on physical devices, not current claims:

- composer available after tap: P95 at or below 100 ms;
- device-owned evidence preview: P50 at or below 1 second;
- useful source-local first read: P50 at or below 2 seconds and P90 at or below
  5 seconds;
- authorized contextual Brief: P50 at or below 5 seconds and P90 at or below
  10 seconds on the ordinary path;
- recovered current Task visible after relaunch: at or below 1 second from
  protected local projection;
- no mandatory decision before useful source-local value;
- exactly one exact-effect approval for one consequential write;
- zero duplicate effects and zero false success.

MX-00 may adjust a budget only before MX-04 starts and must preserve the reason
and original target.

### Evaluation

Measure task time, repeated typing, mandatory choices, wrong destinations,
corrections, abandoned attempts, first-use comprehension, effect completion,
recovery, and preference. Separate network/model latency from UI response.

### Exit gate

- [x] A versioned baseline bundle and metric dictionary exist.
- [x] Every measure names its start event, stop event, device, and evidence.
- [x] No claim uses XCTest duration as product latency evidence.
- [x] The comparison rule is frozen before redesign results exist.

### Progress record — 2026-09-01

MX-00 is complete at artifact `mx00-baseline-2026-09-01-v1` under
`docs/evaluations/2026-09-01-momentum-experience-v2-baseline/`.

Direct proof includes a passing Release simulator build, six passing focused
iOS UI tests, a screen recording, accepted default and AX5 screenshots, an
automated evidence-before-decision hierarchy slice, the frozen eight-case
legacy contract, thirty-six-case Evaluation repository validation, twelve P0
deterministic safety passes that truthfully remain `needs_review`, and seven
supplemental replays that preserve their failures and runner error.

The scenario bank records four direct passes, five observed failures, nine
explicit gaps, and one not-run human rubber-stamping study. No value is imputed
for physical-device latency, manual VoiceOver, representative recruiter use,
Calendar destination behavior, or Ailoha behavior. The comparable Ailoha build
was unavailable; the official public surface described early access and did
not expose a versioned artifact. A synthetic manual-fallback protocol is frozen
but its representative-participant run is pending.

The product-adjudicator panel is contract-valid and abstains pending the named
independent and real-surface evidence. This does not reopen the metric or win
rule and does not authorize MX-01 to rewrite the baseline.

---

## MX-01 — Render and select the new experience direction

Depends on: MX-00.

### Outcome

Select one rendered, testable design direction for the complete mobile causal
loop before production UI implementation begins.

### Design adjustment

Design the following states as one coherent experience, not isolated screens:

1. Today with one lead dependency and ten compact continuations;
2. new Session with text, image, file, and voice intent;
3. immediate source-local first read;
4. authorized contextual Brief;
5. ambiguous identity and insufficient evidence;
6. exact fact decision and separate exact-effect approval;
7. executing, unknown, failed, reconciled, verified, and no-action states;
8. human-readable Receipt returning to the same Session.

Compare at least two rendered directions using the existing design system. One
may emphasize editorial momentum and another conversational continuity, but
neither may introduce a competing palette, decorative AI material, candidate
ranking, or hidden evidence.

### TODO

- [x] Define one information order across Today, Session, Person, and Pursuit:
      identity/context -> change/dependency -> evidence -> next move -> history.
- [x] Remove `AI INSIGHT` and internal governance vocabulary from the default
      attention layer.
- [x] Reserve vermilion for the causal seam and consequential attention.
- [x] Use material cards only for selection, comparison, approval, or temporary
      focus.
- [x] Define restrained state-transition motion plus reduced-motion behavior.
- [x] Produce default, dark, AX5, long mixed-script name, VoiceOver-order,
      failure, and no-action renders for both directions.
- [ ] Run five-second clarity and intended-destination tests without showing
      participants the design rationale.

### Evaluation

Use screenshot plus prototype evidence. Evaluate logo-off ownability,
five-second comprehension, next-action identification, evidence discovery,
decision/effect distinction, interruption recovery, Dynamic Type, contrast,
and motion clarity. Screenshots cannot establish tap, focus, VoiceOver,
latency, or recovery behavior; prototype evidence is required for those claims.

### Exit gate

- [x] Product owner selects one direction and records rejected tradeoffs.
- [ ] At least 9 of 10 first-use participants identify what changed, why it
      matters, and the intended next step within five seconds on the lead state.
- [ ] At least 9 of 10 distinguish fact confirmation from action approval.
- [x] No required reviewer reports an active safety or accessibility veto.
- [x] Selected renders become the source visual for later design QA.

### Progress record — 2026-09-01

The product owner selected Direction 2, Decision Lens, after reviewing two
rendered source directions. Direction 1's persistent Causal Rail was rejected
because its stronger causal trace also creates more audit-flow weight, consumes
more AX5 vertical space, and makes interpretation and approval feel too
continuous. Both directions now have stress-state evidence; the selected
direction adds a runnable fourteen-state mobile prototype.

The frozen artifact is `mx01-direction-2026-09-01-v1` under
`docs/evaluations/2026-09-01-momentum-experience-v2-direction/`. Direct proof
includes a passed 393 × 852 source-to-implementation comparison, a fourteen-
state browser matrix, a numbered VoiceOver-order render, long mixed-script AX5
dark mode with no horizontal overflow, user-like fact → separate approval →
unknown → reconciled → verified interaction, failure recovery, ambiguous
identity with no preselection, and intentional no-action.

The protected mobile runtime check passes for twenty-eight files, all eight
Playwright runtime tests pass, the TypeScript/Vite production build passes, and
all four hosting contract tests pass. The five-lens product panel is contract-
valid and reports no active safety or accessibility veto. It is explicitly one
Codex multi-lens review, not independent human validation.

After product-owner feedback, the prototype's Today surface was rebaselined to
the existing iOS main-screen visual rather than treated as a new visual
direction. The top Today/Sessions/People navigation, editorial date and title,
attention count, quiet rounded focus card, black primary action, secondary
Pursuit action, compact Next list, persistent `Ask anything` composer, Georgia
display type, pearl neutrals, graphite ink, and restrained vermilion accent are
preserved. Only the state/content grammar changed: superseded `AI insight`
language was replaced with a reviewable decision state and the MX-01 evidence
scenario. A same-size 393 × 852 current-product comparison and AX5 dark render
are frozen in the artifact; design QA reports no actionable P0, P1, or P2
visual mismatch. This adjustment does not authorize MX-02 or change either
pending human gate.

The remaining human gate now has a runnable moderator aid at
`?study=moderator`. It presents the frozen Today stimulus for exactly five
seconds, alternates fact/approval order by participant ID, requires verbatim
responses, holds data in browser memory only, and exports the existing ten-row
CSV shape with pass, scorer, and adjudication fields blank. Browser rehearsal
verified the timer, hiding, P01/P02 order alternation, required fields, raw
response save, export activation, and responsive layout. The rehearsal used
synthetic answers and is not recorded as participant evidence; `status.json`
truthfully remains `not_run` with zero of ten participants.

The same frozen protocol now has a separate evidence workbench at
`?study=score&role=scorer_1`, `?study=score&role=scorer_2`, and
`?study=adjudicate`. It validates a complete raw cohort before scoring, binds
both independent score files to the exact raw SHA-256 fingerprint, requires an
explicit human choice for all eight atomic criteria per participant, reveals
only criterion-level disagreements after both files are frozen, and requires a
final value plus written rationale before deterministic gate calculation. The
adjudicator exports a result draft, disagreement audit, and status draft but
does not write repository state. A ten-participant all-synthetic browser
rehearsal completed 80 scorer decisions, joined two distinct scorer roles,
resolved one deliberate disagreement, and produced a 9/10 and 10/10 manual-
review draft. Those numerators are QA fixtures only and do not satisfy either
human exit gate. Desktop and 390 px visual QA found no P0/P1/P2 drift from the
existing moderator visual system and no horizontal overflow.

MX-01 remains open. The frozen human protocol has zero of ten participant
records, so neither the 9/10 five-second comprehension gate nor the 9/10 fact-
versus-action distinction gate is claimed. MX-02 is not authorized until both
human gates pass.

---

## MX-02 — Replace view-owned orchestration with one explicit experience state machine

Depends on: MX-01.

### Outcome

Make iOS Session behavior deterministic, recoverable, and independently
testable without changing the selected visible behavior.

### Engineering adjustment

Introduce one feature-owned state machine, using existing Swift facilities
unless evidence justifies a new dependency. The state must distinguish at
least:

```text
composing
-> reading_input
-> resolving_context
-> preparing_brief
-> ready
-> awaiting_fact_decision or awaiting_action_decision
-> executing
-> reconciling
-> completed, no_action, or failed_with_recovery
```

SwiftUI views render state and emit intent. They do not independently own the
same lifecycle, operation identity, network task, recovery state, or success
claim.

### TODO

- [ ] Inventory state ownership in `RelationshipAskView`,
      `RelationshipArchiveView`, stores, clients, sheets, and local recovery.
- [ ] Write a transition table covering every required state and interruption.
- [ ] Add reducer/store tests before moving ownership.
- [ ] Extract one lifecycle at a time; preserve current API contracts and
      accessibility identifiers during the behavior-preserving phase.
- [ ] Persist only the minimum resumable envelope; do not place private text in
      diagnostics.
- [ ] Remove duplicate state only after parity proof.

### Evaluation

Run transition tests for success, cancellation, back navigation, background,
termination, permission overlay, timeout before commit, timeout after commit,
stale response, deletion, and account switch.

### Exit gate

- [ ] Every observable state has one owner and one legal set of transitions.
- [ ] Existing deterministic iOS unit/UI suites pass unchanged unless the
      selected design explicitly changed the assertion.
- [ ] Relaunch restores the correct phase or a truthful recovery state.
- [ ] No view declares success independently of canonical or destination
      evidence.
- [ ] `pnpm ios:check` passes.

---

## MX-03 — Make one global composer the primary intent entrance

Depends on: MX-02.

### Outcome

Let the recruiter begin with text, image, file, voice, Share Extension, or App
Shortcut without first understanding Capture, Person, Pursuit, or Agent
architecture.

### Design adjustment

- Today keeps one bottom global composer.
- Tapping text, attachment, or voice enters the same Session state machine.
- The primary copy is user work language such as `Ask or add context`, not
  `Capture for the Agent` or `parsing follows scope review`.
- Source retention and consequence copy appears where the user chooses the
  source or commits the effect, not as repeated blanket prose.
- Governed source attachment remains a review state, not a second home screen.

### TODO

- [ ] Route text, photo, image file, voice, Share Extension, and shortcut
      envelopes into one stable Intent ID.
- [ ] Preserve task attachment versus governed evidence-source semantics.
- [ ] Keep source bytes purpose-bound and delete abandoned uploads.
- [ ] Preserve Simplified Chinese marked-text, whitespace, multiline draft,
      voice permission, transcription review, and seven-day draft recovery.
- [ ] Deprecate the Capture Hub as a primary destination only after all entry
      paths have parity.

### Evaluation

Test first launch, text-only, one image, ten images where authorized, file,
voice, denied microphone, interrupted voice, Share Extension offline,
termination, retry, and account switch. Verify that each intent creates no more
than one Task and that unsupported media never silently changes purpose.

### Exit gate

- [ ] A first-use recruiter can start every supported input from the same
      visible composer without choosing a Person or Pursuit first.
- [ ] No path creates duplicate Task, upload, source, or Session records.
- [ ] Chinese IME and voice focused suites pass.
- [ ] All retained source and deletion disclosures remain accurate.
- [ ] `pnpm ios:localization:check` and `pnpm ios:check` pass.

---

## MX-04 — Deliver useful first value through a two-speed response

Depends on: MX-03.

### Outcome

Give the recruiter a useful interpretation before an open-ended Agent loop,
relationship clarification, or deep research completes.

### Architecture adjustment

The fast path may perform device-owned OCR/transcription, layout recovery,
source-local extraction, and clearly provisional synthesis. It may not read
cross-person canonical memory before authorization, confirm identity, persist
facts, or grant action authority.

The contextual path pins an authorized snapshot, reconciles current work, and
returns the governed Brief. Open-ended public research runs separately and
cannot block the source-local first read.

### TODO

- [ ] Define the exact source-local output contract and prohibited claims.
- [ ] Start local OCR/transcription immediately after intentional source
      selection.
- [ ] Render truthful stages: reading source, checking relationship, preparing
      next move; do not expose chain of thought or theatrical typing.
- [ ] Route ordinary bounded interpretation through the minimum model calls.
- [ ] Move open-ended research behind asynchronous Task events.
- [ ] Reconcile late contextual output against the Intent version before
      replacing or enriching the first read.

### Evaluation

Measure on physical devices across warm/cold launch, Wi-Fi, constrained
network, offline local capture, long source, Chinese/English mix, ambiguous
identity, no-signal, stale context, late provider result, and cancelled Task.

### Exit gate

- [ ] The frozen ordinary scenarios meet the MX-00 first-read budget.
- [ ] The first read is useful in blinded review and never presented as
      confirmed relationship truth.
- [ ] A slow or failed Agent provider does not erase the source-local result or
      trap the user in loading.
- [ ] Late results cannot overwrite a newer Intent or authorization state.
- [ ] No private content appears in performance telemetry.

---

## MX-05 — Replace arbitrary answer blocks with a typed Momentum Brief

Depends on: MX-04.

### Outcome

Make every ordinary response immediately legible, consistent across surfaces,
and independently verifiable.

### Contract

Define a versioned shared Brief containing at least:

```text
meaning
changes[]
current_dependency
why_now
evidence_refs[]
next_move or no_action
required_decision?
revisit_condition?
freshness and snapshot identity
```

Model prose cannot invent fields, cite outside the manifest, or turn an
interpretation into confirmed state.

### Design adjustment

- Lead with two or three sentences of meaning.
- Show one current dependency and one next move.
- Keep exact evidence one step away and visually secondary until needed.
- Show before -> proposed for changed state.
- Present `no_action` with a reason and revisit condition.
- Keep AI provenance visible but secondary to the work.

### TODO

- [ ] Add contract fixtures and strict decoding/validation.
- [ ] Add a server-side Brief compiler over authorized Task output.
- [ ] Add one shared iOS renderer for source-local and contextual variants.
- [ ] Preserve specialized research artifacts outside the ordinary Brief.
- [ ] Version and migrate stored Session projections without rewriting prior
      history as current.

### Evaluation

Run the core, identity, stale, conflicting-source, no-action, long-text, and
unsupported-field scenarios. Compare the Brief with the previous block UI for
five-second comprehension, evidence discovery, correction, and next-action
selection.

### Exit gate

- [ ] Every decision-relevant field cites current authorized evidence or is
      explicitly labeled interpretation/proposal.
- [ ] The same Brief preserves semantic parity in Today summary, Session, and
      Pursuit decision context.
- [ ] Unsupported fields fail validation rather than rendering as prose.
- [ ] The selected rendered direction passes design QA against the coded state.
- [ ] Contract, backend, and iOS tests pass.

---

## MX-06 — Converge relationship resolution, local Session, and durable Agent Task

Depends on: MX-05.

### Outcome

Let one user Intent survive device interruption and cross-surface continuation
without making local Session, provider memory, or event transport a second
source of truth.

### Ownership

- Backend Agent Task owns durable intent lifecycle, immutable attempts,
  checkpoints, canonical projection, and decision correlation.
- Governed relationship state owns evidence, confirmed facts, Pursuits,
  Actions, and Receipts.
- iOS local storage owns drafts, protected resumable commands, and a cache of
  server projection, never ordinary relationship truth.
- SSE or push may accelerate delivery but never owns state.

### TODO

- [ ] Wire `AgentTaskProjectionStore` into the shipping Session experience.
- [ ] Give every command a stable Intent/Task/operation identity before send.
- [ ] Pin account, workspace, Person/Pursuit scope, snapshot, evidence manifest,
      authorization, and budget when contextual work begins.
- [ ] Resolve likely scope after Send; require selection when ambiguity affects
      canonical retrieval or persistence.
- [ ] Preserve unbound source-local work as a valid result.
- [ ] Reconcile cursor gaps, stale snapshots, account switch, and sign-out.

### Evaluation

Test same-name people, expired identity clues, historical/current owners,
unbound input, zero matches, several plausible matches, stale source,
authorization loss, source deletion, cursor gap, out-of-order event, duplicate
event, relaunch, and second-device readback.

### Exit gate

- [ ] One Intent produces one durable Task lifecycle across retries.
- [ ] No ambiguous relationship is silently bound.
- [ ] Local Session cannot make a stale answer current.
- [ ] Cross-surface readback reconstructs the same phase and decision target.
- [ ] Sign-out removes protected local Task/Session state before revocation is
      presented as complete.
- [ ] Backend, Agent, contract, and iOS focused suites pass.

---

## MX-07 — Redesign Today as a glanceable momentum surface

Depends on: MX-05 and MX-06.

### Outcome

Help the recruiter find the decaying decision or dependency immediately while
keeping every attention-bearing Pursuit reachable and never ranking a person.

### Design adjustment

- One expanded lead Momentum Brief.
- Compact continuation rows for remaining Pursuits.
- Each row shows outcome/Pursuit, why now, owner/due, evidence condition, and
  the exact next destination.
- When a Pursuit has both an owned action and Proposal, expose two explicitly
  named destinations instead of letting one headline lead to another action.
- No giant marketing title, arbitrary three-item cap, generic feed, or
  candidate score.

### TODO

- [ ] Define deterministic attention ordering from deadline, unresolved
      dependency, actionability, and evidence authority without exposing a
      person score.
- [ ] Add compact/expanded projection parity tests.
- [ ] Add an intentional no-action summary.
- [ ] Preserve direct access to Pursuit, Session, Person, decision, and action.
- [ ] Preserve list semantics at AX5 and with VoiceOver.

### Evaluation

Seed 0, 1, 10, and 50 mixed-state Pursuits, including overdue action, pending
Proposal, unavailable evidence, open gap, stale recommendation, recovered
Receipt, and no-action. Test first, fifth, and final target discovery at
default and AX5.

### Exit gate

- [ ] At least 9 of 10 first-use recruiters find the highest-priority, fifth,
      and final Pursuit and open the intended destination without a wrong tap.
- [ ] Median first-target time is below the frozen baseline and target budget.
- [ ] Every attention-bearing Pursuit remains reachable.
- [ ] No item implies candidate value, fit, or acceptance probability.
- [ ] VoiceOver reads context and dependency before the action.

---

## MX-08 — Complete fact and action decisions without losing Session continuity

Depends on: MX-06 and MX-07.

### Outcome

Keep the recruiter in one causal flow while the governed object remains the
only authority for its decision.

### Design adjustment

- Session displays the affected object and decision summary inline.
- Tapping the primary action lands on the exact item, not a generic Pursuit
  overview.
- Fact review shows exact evidence and before -> proposed state.
- Action approval separately shows target, payload, time, destination,
  reversibility, and expiry.
- After the decision, the Session resumes at a human-readable Receipt.

### TODO

- [ ] Introduce a typed decision handoff that names object, revision, prior
      authority, affected fields, and return Session.
- [ ] Preserve item-level confirm, edit, dismiss, and unresolved outcomes.
- [ ] Prevent chat/Session from recording the decision directly.
- [ ] Handle stale preview, concurrent edit, deleted source, and cancelled
      decision without losing the original Intent.
- [ ] Restore focus to the result or recovery action on return.

### Evaluation

Test multi-item Proposal, one edited item, one unresolved item, stale revision,
source deletion during review, back gesture, app termination, VoiceOver focus,
and external-action approval. Measure context switches and wrong destinations.

### Exit gate

- [ ] Fact and action decisions remain independently authorized.
- [ ] One tap from Brief reaches the exact required decision.
- [ ] Return reaches the same Session and exact result without reconstruction.
- [ ] No stale or deleted authority can be confirmed.
- [ ] Decision receipt references the canonical domain Receipt.

---

## MX-09 — Put one external effect behind the shared effect ledger

Depends on: MX-08.

### Outcome

Turn the existing one-way Apple Calendar capability into the first complete,
cross-surface governed effect without broadening Calendar read access.

### Architecture adjustment

Use one lifecycle:

```text
EffectIntent
-> exact approval
-> durable operation identity
-> device execution attempt
-> destination observation or explicit unknown
-> canonical Outcome and Receipt
-> reconciliation before retry
```

Talent Signal owns the planned activity. Apple Calendar remains a one-way
projection and is not imported as relationship truth.

### TODO

- [ ] Define typed effect intent, attempt, observation, outcome, and receipt
      contracts that also support future Contacts/ATS adapters.
- [ ] Persist the operation before EventKit execution.
- [ ] Preserve write-only Calendar permission and default-calendar scope.
- [ ] Prevent retry while outcome is unknown.
- [ ] Reconcile or require explicit recovery without inventing destination
      success.
- [ ] Project canonical effect status back into Session, Today, Pursuit, and
      timeline.
- [ ] Keep Contacts/ATS/message execution out of this Goal.

### Evaluation

Run `TS-ACT-01` through `TS-ACT-04`, plus duplicate tap, app kill before write,
app kill after write, timezone change, destination unavailable, Calendar sync
disabled, and account switch. Inspect both canonical and EventKit state.

### Exit gate

- [ ] 100% of executed writes have exact approval and an audit event.
- [ ] Ten of ten timeout-after-write trials create exactly one destination
      event and recover one truthful Receipt.
- [ ] Permission loss and mismatch create no false success.
- [ ] Retry never creates a second event while an outcome is unknown or
      verified.
- [ ] No EventKit event enumeration or ambient import is introduced.

---

## MX-10 — Return a human Receipt and continue from the observed outcome

Depends on: MX-09.

### Outcome

Make verified progress visible in ordinary work language and let the Agent
reason from the observed result rather than the attempted call.

### Design adjustment

A Receipt leads with:

- affected person and Pursuit;
- action or changed field;
- destination and observed result;
- localized time;
- unresolved consequence or next check.

Technical identifiers and revisions remain in audit disclosure. Unknown,
failed, reconciled, reversed, and verified states are distinguishable without
color alone.

### TODO

- [ ] Define a shared human-readable Receipt projection.
- [ ] Return the Receipt to the originating Session and update Today/Pursuit.
- [ ] Feed verified outcome, not model assertion, into the next contextual
      snapshot.
- [ ] Add follow-up/revisit conditions without manufacturing another action.
- [ ] Preserve reversal and deletion history.

### Evaluation

Use same-name people, several Pursuits, fractional timestamps, timezone change,
long names, Simplified Chinese, verified, failed, unknown, reconciled, and
reversed effects. Ask first-use users to identify exactly what happened from
the Receipt alone.

### Exit gate

- [ ] Ten of ten users identify the affected person/Pursuit and result from the
      Receipt without decoding an ID.
- [ ] Every verified success resolves to destination observation.
- [ ] Unknown and failed outcomes expose one reachable recovery action.
- [ ] The next Brief reflects the outcome without erasing prior intent or
      evidence.

---

## MX-11 — Make “smartness” an evaluated relationship capability

Depends on: MX-05, MX-06, and MX-10.

### Outcome

Measure whether the product correctly understands change, avoids redundant
work, chooses a useful next move, and learns from corrections and outcomes.

### TODO

- [ ] Version a consented/de-identified offline episode corpus covering the
      required scenario bank and realistic channel/language variation.
- [ ] Add field-level extraction, evidence entailment, temporal normalization,
      identity, contradiction, supersession, and sensitive-inference graders.
- [ ] Add action precision, duplicate-action, no-action, owner/due/close
      condition, and evidence-to-action trace graders.
- [ ] Capture Confirm/Edit/Dismiss, correction reason, action choice, observed
      outcome, and later reversal without logging private content.
- [ ] Keep deterministic policy responsible for permission, time, state,
      consequence, and effect eligibility.
- [ ] Do not fine-tune until correction/outcome evidence demonstrates a
      repeated failure worth addressing.

### Evaluation

Blind expected gates during reviewer calibration. Randomize scenario order and
model-judge order. Human-adjudicate every veto and a stratified sample of
non-vetoes. Record false pass, false block, abstention, and unsupported-finding
rates.

### Exit gate

- [ ] External-write approval/evidence trace, ambiguous-identity write,
      protected-trait inference, and duplicate-effect gates meet their strict
      zero-error release requirements.
- [ ] High-risk extraction thresholds are predefined and achieved on held-out
      fixtures, preferring abstention to unsupported recall.
- [ ] Next-move usefulness improves over baseline without increasing evidence
      or identity errors.
- [ ] `no_action` cases do not manufacture urgency or tasks.
- [ ] Evaluation versions include fixture, rubric, model, prompt, policy,
      artifact, and result identities.

---

## MX-12 — Engineer and prove performance, interruption, and recovery

Depends on: MX-04 through MX-10.

### Outcome

Make the target experience budgets and recovery guarantees part of the
architecture rather than visual polish.

### TODO

- [ ] Instrument content-free spans for tap-to-input, source preview,
      source-local first read, context resolution, model request, Brief ready,
      decision, effect attempt, observation, receipt, and relaunch recovery.
- [ ] Precompute compact authorized snapshots and Today projections where
      measured evidence supports it.
- [ ] Remove avoidable serial model/tool turns from the ordinary path.
- [ ] Deliver durable Task events incrementally through readback plus SSE/push
      acceleration; transport cannot own truth.
- [ ] Profile launch, composer typing, long Session scroll, image import,
      Dynamic Type, and effect confirmation on supported physical devices.
- [ ] Test memory growth, cancellation, task leaks, background transitions,
      Low Power Mode, constrained network, and provider outage.

### Evaluation

Use signposted physical-device traces and compare the same build/configuration
against MX-00. Separate perceived feedback, local compute, network, provider,
control-plane, and destination latency.

### Exit gate

- [ ] Ordinary-path budgets frozen in MX-00 pass on the supported device set.
- [ ] No dropped or duplicated Task event changes the reconstructed result.
- [ ] Provider outage preserves local value and a truthful continuation.
- [ ] Typing, scrolling, and state transitions remain responsive at AX5.
- [ ] Telemetry contains no draft, transcript, person, relationship, source
      excerpt, raw attachment, provider payload, secret, or token.

---

## MX-13 — Complete accessibility, localization, motion, and privacy proof

Depends on: the selected rendered implementation and MX-12.

### Outcome

Ensure the same governed journey is completable without sighted assistance and
does not trade candidate privacy for convenience.

### TODO

- [ ] Run manual VoiceOver on the complete intent-to-Receipt journey.
- [ ] Test default and AX5 Dynamic Type, dark mode, Increased Contrast, Reduce
      Transparency, Reduce Motion, Full Keyboard Access, and Switch Control
      where supported.
- [ ] Test Simplified Chinese, English, mixed-script long names, 200% expansion,
      and right-to-left resilience where relevant.
- [ ] Ensure evidence and consequence precede confirmation in accessibility
      order.
- [ ] Ensure motion explains phase change and has a non-motion equivalent.
- [ ] Inspect notifications, Live Activities, logs, screenshots, and task
      events for private content leakage.
- [ ] Verify source retention, deletion, and derivative retraction through the
      rendered UI.

### Evaluation

Use human traversal plus automated audits. Automated hierarchy checks do not
substitute for manual VoiceOver or one-handed physical-device use.

### Exit gate

- [ ] The critical journey completes with VoiceOver without sighted
      assistance.
- [ ] Identity, evidence, ambiguity, target, effect, and result are spoken
      before the corresponding approval.
- [ ] No text or control is clipped, hidden behind the composer, or reachable
      only by color or motion.
- [ ] No generic system surface exposes candidate conversation content.
- [ ] `pnpm ios:localization:check` and `pnpm ios:check` pass.

---

## MX-14 — Prove the product beats Ailoha and manual fallback in the core journey

Depends on: MX-00 through MX-13.

### Outcome

Make the comparative product claim only after a blinded, same-task field study
on frozen artifacts.

### TODO

- [ ] Recruit representative independent recruiters or boutique-search users
      under an approved research protocol.
- [ ] Use synthetic or purpose-approved/de-identified material.
- [ ] Randomize Talent Signal, Ailoha, and manual-fallback order.
- [ ] Run clear, ambiguous, no-action, stale, action, timeout, interruption,
      Chinese voice, and high-load Today scenarios.
- [ ] Measure first useful insight, time to verified state, repeated input,
      correction, wrong binding, action completion, recovery, stale work,
      trust, and willingness to reuse.
- [ ] Preserve disagreements and negative cases instead of averaging them away.
- [ ] Rerun the smallest sufficient panel on the same frozen release candidate.

### Comparative win rule

Before study results are opened, freeze a rule requiring:

- no active safety, accessibility, privacy, identity, or unauthorized-effect
  veto;
- no worse identity/evidence/effect error rate than either comparator;
- a statistically and operationally meaningful improvement over the current
  Talent Signal baseline;
- Talent Signal wins the predefined primary measures against both Ailoha and
  manual fallback on the core recruiting journey;
- no blocker scenario is hidden by a favorable aggregate;
- participants prefer to reuse Talent Signal for the target work at the
  predefined threshold.

### Exit gate

- [ ] The artifact, protocol, sample, order, measures, raw outcomes, exclusions,
      and adjudication are inspectable.
- [ ] Every veto is resolved by its named verification, not by a code change or
      average score.
- [ ] The comparison claim is limited to the tested recruiting journey.
- [ ] If the win rule fails, the result becomes a new discriminating Goal
      rather than a marketing claim.

---

## MX-15 — Retire legacy paths and canonicalize the accepted architecture

Depends on: MX-14 comparative gate or an explicit product-owner decision to
ship with named missing field proof.

### Outcome

Leave one comprehensible product loop, one owner per state/effect, and one
authoritative home per durable claim.

### TODO

- [ ] Remove or demote the superseded Capture Hub, duplicate Session routes,
      arbitrary ordinary response blocks, and obsolete recovery owners only
      after replacement parity is proven.
- [ ] Remove temporary adapters, flags, fixtures, and generated artifacts that
      are not part of a retained evaluation.
- [ ] Update `docs/product.md`, `docs/design-system.md`, `docs/architecture.md`,
      `docs/agent-system.md`, and `docs/capture-to-action.md` only for accepted
      durable behavior.
- [ ] Record consequential rationale and rejected alternatives in an ADR.
- [ ] Update or add architecture diagrams showing the causal loop, ownership,
      effect boundary, and recovery invariant.
- [ ] Preserve dated evaluation packets; do not turn them into canonical truth.
- [ ] Run the full relevant repository and release checks.

### Exit gate

- [ ] One current path exists for each supported intent, decision, effect, and
      recovery state.
- [ ] No deleted path is required by a shipping deep link, shortcut, share
      extension, test, or recovery envelope.
- [ ] Canonical docs, ADR, diagrams, contracts, tests, and shipped behavior
      agree.
- [ ] `pnpm docs:check`, `pnpm agent:check`, `pnpm backend:ci`,
      `pnpm ios:localization:check`, and `pnpm ios:check` pass.
- [ ] The final multi-lens panel validates and has no active veto.

## Dependency order

```text
MX-00 Baseline
  -> MX-01 Design direction
  -> MX-02 Experience state machine
  -> MX-03 Unified composer
  -> MX-04 Two-speed first value
  -> MX-05 Typed Brief
  -> MX-06 Task/Session/context convergence
  -> MX-07 Today
  -> MX-08 Decisions
  -> MX-09 Effect ledger
  -> MX-10 Receipt/outcome
  -> MX-11 Smartness evaluation
  -> MX-12 Performance/recovery
  -> MX-13 Accessibility/privacy/localization
  -> MX-14 Comparative field gate
  -> MX-15 Legacy retirement and canonicalization
```

Do not parallelize Goals that move the same state or effect owner. Rendered
design exploration, contract fixtures, and evaluation harness work may proceed
in parallel only when file and authority ownership do not overlap.

## Replanning signals

Re-plan rather than forcing the sequence when:

- physical-device evidence invalidates a latency or interaction assumption;
- the selected direction increases error discovery time or rubber-stamping;
- local first value requires unauthorized cross-person context;
- the ordinary path still requires an open-ended Agent loop to be useful;
- Agent Task and local Session cannot converge without silently migrating
  private local content;
- Calendar reconciliation requires broader read access than the accepted
  one-way privacy boundary;
- real recruiters do not execute the proposed next move or prefer the manual
  fallback;
- candidate-side review finds communication or consent harm;
- a platform/provider limitation makes the verified outcome impossible.

## Final proof bundle

The final release candidate should retain:

- commit, build, environment, model, policy, contract, and fixture identities;
- selected design source and coded design comparison;
- real-device recordings, accepted screenshots, accessibility trace, and
  performance traces;
- canonical Task, Brief, Decision, Effect, Observation, Outcome, and Receipt
  readbacks;
- destination proof for the Calendar effect;
- required specialist packets and adjudicated panel JSON;
- comparative field protocol and results;
- deletion, response-loss, relaunch, account-switch, stale-state, and
  no-action evidence;
- verification command outputs and known remaining limits.
