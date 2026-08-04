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

## Recruiter review

The user should be able to:

- inspect the original source;
- understand what the system believes changed;
- correct identity, speaker, meaning, or time;
- confirm, dismiss, or leave an item unresolved;
- see conflicts and prior values;
- continue safely when the right result is `no_action`.

Fast confirmation is useful only when ambiguity remains visible.

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

Fast intentional capture, lightweight correction, time-sensitive attention,
and device-owned effects.

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
