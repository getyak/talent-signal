# Capture to action

## Purpose

Turn one recruiter-controlled conversation source into reviewed relationship
state and one smallest useful action without losing evidence, consent, or user
control.

This is the first complete product loop and the reference path for every future
surface.

## Experience contract

```text
intentional capture
→ inspectable evidence
→ proposed understanding
→ recruiter correction and confirmation
→ current relationship state
→ one action proposal or no_action
→ independent approval
→ controlled execution
→ observed outcome
→ durable continuity
```

The product should feel like finishing a thought, not administering a database.

## Intentional capture

Capture begins with a deliberate user action from mobile, web, a share surface,
or an authorized channel.

The system records source context, purpose, scope, and retention before
interpretation. Private sources are not collected ambiently, and imported
content remains untrusted.

The initial product may retain the complete encrypted source by default so the
recruiter can re-review the extraction. Full-source retention is not permanent
retention: the purpose, expiry rule, shorter-retention option, and deletion
effect remain visible.

A capture may instead retain only recruiter-reviewed extracted text while the
raw source remains transient. The review surface must say which mode applies;
an excerpt or screenshot-metadata record must never be presented as if the
complete original were recoverable.

## Evidence compilation

The system reconstructs inspectable evidence before drafting state.

It should represent:

- message order and speaker uncertainty;
- exact source excerpts;
- time and language ambiguity;
- possible person and assignment context;
- explicit statements, commitments, constraints, and deadlines;
- conflicts with current understanding.

The result is a proposal for review, not a generated narrative accepted as
truth.

Automatic filing reduces organization work without collapsing review. The
system may place a supported proposal under one contact and context; uncertain
identity, speaker, role, assignment, or relationship enters the review queue.
`no_signal` preserves the import receipt while declining to invent useful
state. Proposed placement cannot widen source access or feed active
relationship state before the required identity and context review.

## Recruiter review

The user should be able to:

- inspect the original source;
- understand what the system believes changed;
- correct identity, speaker, meaning, or time;
- confirm, dismiss, or leave an item unresolved;
- see conflicts and prior values;
- continue safely when the right result is `no_action`.

Fast confirmation is useful only when ambiguity remains visible.

Review has two independent decisions: attach the evidence to a person and
relationship, then decide each proposed fact. Attachment never confirms facts.
Mobile comparisons stack the prior value, proposed value, exact quote, and
editable reviewed value. A supported fact can be confirmed while another item
remains unresolved; ambiguous speakers and relative dates block only their
dependent facts. Import time does not establish message time.

Resuming a review restores the source, pending edits, and review position, then
checks current identity, authorization, and evidence authority. An unknown
network result preserves the original operation for reconciliation. A changed
source or later decision requires renewed review; retrying cannot resurrect
superseded authority. Local-original expiry must not hide retained reviewed text
or make the interface claim that the original is still available.

Completion reports actual confirmed, dismissed, and unresolved decisions.
Pending identity or evidence remains in the inbox. A reviewed source with no
supported change can finish without inventing a fact or an action. Compilation
quality is distinct from review completion and effect authorization.

## Current relationship state

Confirmed state is temporal and scoped. A later source may reinforce, contest,
expire, or supersede an earlier understanding.

The system preserves both what is currently accepted and how that state was
reached. Assignment-sensitive evidence stays inside its authorized context
even when the person identity is shared.

## Action proposal

An action proposal answers:

- what should happen;
- to whom or where;
- why it matters now;
- which evidence supports it;
- what may block it;
- when the opportunity expires;
- how the user can edit, decline, or recover.

Prefer one smallest concrete action. Do not generate work merely because a
source was imported.

## Independent approval

Fact confirmation does not authorize action.

Before a consequential effect, the user sees the final target and intended
change. Approval applies to that specific current proposal, not to a general
Agent permission.

If the target, timing, content, permission, or current destination state
changes, the system asks again.

## Execution and observation

Execution occurs through a governed device or server capability.

The system protects against duplicates, stale decisions, and changed
preconditions. It claims success only after observing destination evidence.
Timeouts and partial failures remain unknown until reconciled.

Where direct execution is unsafe or unavailable, the product uses a
user-controlled handoff rather than pretending to automate.

## Outcome and continuity

The loop continues after execution:

- Did the recruiter complete or edit the action?
- Did the candidate or client respond?
- Was the dependency resolved?
- Did the assignment move?
- Was the earlier understanding later corrected?

Confirmed state and observed outcomes update the timeline, Today, insight, and
living page. Generated views remain rebuildable.

## Surface roles

### Mobile

Fast intentional capture, background processing, time-sensitive attention, and
device-owned effects. Image capture starts one resumable Agent Session: local
text extraction, proposed-source intake, and bounded internal tools continue
without foreground review. The recruiter is interrupted only for a blocking
identity or relationship-context ambiguity, a tool failure, or a consequential
effect. Intentional capture authorizes the Agent to attach the source when one
current confirmed identity clue resolves to one person and one existing
relationship context. Extracted text, speaker attribution, facts, and effects
keep their own authority. A shortcut and Photos selection follow the same rule.

### Web

Identity resolution, evidence inspection, conflict handling, longitudinal
review, research, and governance.

### Browser and channels

Capture, status, and signed review handoff. They do not own extraction policy,
truth, or consequential execution.

### External agents

Scoped reading, research, artifacts, and proposals through the shared control
plane.

## Required outcomes

The loop is ready when:

- the right source is bound to the right person and context;
- the user can see and correct the evidence;
- confirmed state is visible across primary surfaces;
- one approved action reaches the intended destination without duplication;
- the result is independently observable;
- failure, ambiguity, no-action, stale approval, and deletion remain safe.

## Reconsider when

Revisit the loop if users cannot complete it during ordinary work, correction
cost exceeds the value of continuity, or a different capture surface creates a
safer and more frequent entry point.

See [Product](product.md), [Architecture](architecture.md), and
[Agent system](agent-system.md).
