# Delivery

## Delivery principle

Ship complete evidence-to-outcome slices, not horizontal layers of
infrastructure or isolated AI features.

Every slice should be usable by a recruiter, observable across the system, and
safe under ambiguity, failure, and correction.

## Current foundation

The repository demonstrates the product language, evidence review, action-card
states, candidate continuity, and initial model boundaries.

This foundation is a synthetic, local V1 acceptance system. It is not a
production rollout: live identity-provider configuration, storage region,
provider credentials, real-device privacy behavior, and design-partner outcomes
remain separate release decisions.

Stateful evaluators must use a disposable workspace or retire only their own
explicitly classified active fixtures before recreating them. Product
projections may bound evaluator noise, but must not relabel it as recruiter
state or conceal its synthetic origin.

Internal iOS Lab now joins device inspection and recovery tools with a real
model experiment loop. Testers compare two server-approved configurations on
the same registered synthetic input, inspect actual output and execution
evidence, and save a review. Successful execution carries no quality verdict
and reviews do not change the product model or release gates. Device tools are
available offline in internal builds; remote experiments still require the
authenticated backend capability. The build gate and current scope are recorded
in [ADR 0012](decisions/0012-useful-device-lab-and-real-experiments.md).
The runtime extension adds approved backend selection, deployment preflight,
separate environment/account/user recovery, active-work blockers, and native
switch/relaunch/return evidence. Session model trials now apply an admitted
configuration to ordinary product tasks, preserve governed tools, distinguish
provider execution from product adoption, and expire or roll back explicitly.
Durable text batches now freeze case sets and repeated A/B attempts, enforce
call reservations, recover after relaunch, and preserve results through
cancellation or worker loss. Selected failures now become immutable regression
cases with frozen-input reruns, scoped recovery, reviewed exports and derivative
deletion. The shared evaluation runner checks recorded rerun integrity without
turning preferences into quality verdicts. CI exercises this lifecycle with a
synthetic provider. Case-specific consumption now has a configured workflow
and backend verification path, with native readback and explicit quality and
release-enforcement boundaries. Actual hosted execution remains required;
see the [operator workflow](operations/lab-ci-verification.md).
Device appearance now adds a compiled page-state catalog, named local presets,
and expiring app-wide display trials with an explicit restore action. System
accessibility protections remain authoritative. Native apply/navigation/restore,
relaunch and AX5 evidence lives in the
[appearance evaluation](evaluations/2026-09-04-lab-appearance/README.md).
Guided diagnostics now records an explicit task session with typed request
phases, bounded device samples, manual observations, background/context stop,
interrupted checkpoints, reviewed export and verified local deletion. Real
loopback timing, redirect rejection and native record/relaunch/file-export
evidence are recorded in the
[diagnostics evaluation](evaluations/2026-09-04-lab-diagnostics/README.md).
Isolated fault presets now exercise real workspace reads and product pages,
with retry, cancellation, expiry and background recovery. The unavailable-source
fixture exposed and corrected Today hiding lost evidence authority behind a
freshness label; see the [fault evaluation](evaluations/2026-09-04-lab-faults/README.md).
Automatic client operations now correlate with typed, request-local backend
stages. Reports preserve separate clocks, partial outcomes and synthetic origin;
see the [stage evaluation](evaluations/2026-09-04-lab-stages/README.md).
MetricKit history adds explicit reception, bounded typed summaries, reviewed
exports and deletion-aware recovery. Simulator UI and lifecycle checks are
separate from the outstanding physical-device callback proof; see the
[MetricKit evaluation](evaluations/2026-09-04-lab-metrickit/README.md).
The broader Lab roadmap remains in the
[complete implementation plan](../plans/2026-09-04-lab-complete-runtime.md).

The earlier five-scenario deterministic Lab remains a named secondary task on
iOS and the existing Web experience. It binds replay and baseline comparison
to frozen synthetic evidence, records a redacted Reality Receipt, and permits
explicit promotion into an Eval Case. Both quality paths have zero authority
over canonical relationship state or external effects. Real-model experiment
UI is currently native iOS only.

## Delivery sequence

### 1. Pursuit contract and governed evidence

One recruiting Pursuit provides the target outcome, contextual roles, criteria,
gaps, actions, and revisions. One real source becomes inspectable evidence,
correctly bound Pursuit and person context, and reviewed temporal state across
mobile and web.

The slice is complete when the user can correct it and deletion reaches every
derived representation.

The current governed slice computes evidence authority at read time for roles,
gaps, Proposals, and Today; source deletion supersedes open dependent review
work, redacts source-derived Proposal and operation narratives, degrades applied
milestone authority without rewriting its value, and preserves non-content
confirmer, time, Receipt, and deletion lineage. iOS
typed-signal recovery is isolated by an authenticated workspace readback before
payload display, and same-name selection binds a visible stable Person clue.

### 2. One safe action

V1 closes one owned internal action only after the owner records an observed
outcome. The client persists its operation ID before submission; response loss
locks until exact-ID canonical readback, including after relaunch, without a
second POST. Completion is revisioned and idempotent, returns a matching Receipt
and readback, and has no external effects. Any consequential destination write
still requires separate approval, execution, observation, and recovery.

### 3. Pursuit and relationship continuity

Today, Pursuits, People, timeline, and living pages use confirmed state and
observed outcomes to reduce context reconstruction and surface one current
dependency against the target outcome.

### 4. Reviewable learning

Repeated corrections and outcomes may produce a tentative playbook with
evidence, exceptions, and a next validation window.

### 5. Bounded Agent access

The V1 provider-neutral runner and Claude Agent SDK adapter can read one frozen
Pursuit/evidence scope and form one review-only Proposal or `no_action`. It has
no shell, Web, browser, identity, confirmation, or external-effect authority.
The deterministic control-plane evaluation runs six cases five times; live
Claude evidence remains explicitly missing until credentials and a model are
authorized.

### 6. Evidence-gated expansion

Add new channels, connectors, parallel research, or specialized infrastructure
only after the earlier loop demonstrates recurring value and acceptable trust.

## Prioritization

Prefer work that improves:

- evidence correctness;
- time to useful review;
- user correction and control;
- resolution of a real dependency;
- external-effect verification;
- deletion and recovery;
- reuse across surfaces without widening scope.

Deprioritize work that mainly increases feature count, generated prose,
automation theater, or speculative infrastructure.

## Definition of done

A delivery is done when:

- the user outcome is directly observable;
- consequential state is evidence-backed and auditable;
- ambiguity, no-action, failure, stale state, and retry are safe;
- the relevant surface has been tested;
- the next Agent can recover intent from repository state;
- durable learning has been consolidated without bloating always-on context.

## Planning

Use [`PLANS.md`](../PLANS.md) for active multi-step work. Delivery phases
describe direction; plans describe the current execution.
