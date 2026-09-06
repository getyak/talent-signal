# Capture / Inbox / Identity Review: concept review

Date: 2026-09-05. Decision: **continue with changes; not implementation-ready**.
Release gate: **needs evidence**.

Implementation status: the required changes were completed on 2026-09-05.
See the [implementation evidence](implementation.md) for current behavior,
verification, screenshots, and the remaining deliberate boundary.

## Scope and evidence

Reviewed the [user-linked Notion concept](https://traveling-thistle-a0c.notion.site/01-Capture-Inbox-Identity-Review-3d1a444a6c00817ea24be5c5aa945afb),
last edited 2026-09-04T10:07:01.133Z according to the connector, against
[Product](../../product.md), [Capture to action](../../capture-to-action.md),
[Design system](../../design-system.md), and [Review standard](../../../REVIEW.md).

The [source record](../../../_index/sources/2026-09-05-notion-capture-design.md)
defines evidence locators S1–S7. The connector returned a written concept,
without embedded interface images. Browser creation and tab selection timed
out; no screenshot was accepted. This is a specification review, not a visual
audit. The source's claim about current demo behavior was not reproduced.

Three lenses were applied sequentially by one agent. These are not independent
reviewers or a consensus. The [panel](panel.json) preserves findings,
limitations, and proposed tests. No numerical release score is justified.

## What should be retained

The concept starts from a real job: preserve a meaningful conversation change
without making the recruiter manage files. Intentional capture, inspectable
evidence, explicit identity decisions, normal unresolved outcomes, and the
separation of fact review from action approval match the canonical loop.
ChangeSet's old/proposed/evidence/consequence structure is a useful foundation.

The recommendation is the proposed two-lane direction after the contracts below
are made consistent. Progressive deferral remains an experiment until users
can distinguish deferred from confirmed changes.

## Three changes before implementation

### 1. P1: make the two decisions consistent

**Observed specification ambiguity, S1/S2/S4.** One passage defines the two
decisions as identity owner then relationship attachment. The later recommendation
defines them as person/relationship then proposed changes. A lane is a layout
group, not evidence that all its judgments are one decision.

An implementer could repeat identity selection or treat attachment as acceptance
of all extracted facts. The first screen could also demand a Pursuit before the
source is understood, despite the story promising a lightweight capture.

Use two conceptual review groups: resolve identity/context only as needed, then
confirm specific proposed changes. Keep source saving available before either
is complete. Person, speaker, and relationship must remain separately correctable.
A pre-existing entry context can be displayed without requiring duplicate input.

**Acceptance:** known-person, unknown-person, and multi-Pursuit captures require
no invented context; binding never implicitly confirms facts.

### 2. P1: define which ambiguity blocks which confirmation

**Design risk and missing contract, S5/S6.** Partial confirmation is sound only
when the accepted claim is independent of the unresolved information. An explicit
sentence is insufficient if its speaker, subject, relationship, or relevant
time remains unknown.

Distinguish capture time, original message time, effective time, and the interval
during which an identity clue belonged to a person. Do not use screenshot import
time as the default anchor for a relative date.

For example, once speaker, person, context, and temporal validity are resolved,
an explicit location preference can be confirmed while an unanchored Wednesday
remains pending. If the speaker is unknown, neither statement may be treated
as the candidate's confirmed state. If only meeting time is unknown, that blocks
a meeting proposal from becoming executable, not an unrelated supported claim.

**Acceptance:** synthetic group chat, historical image, recycled identifier,
and mixed-date fixtures yield zero unsupported confirmed claims. Dependency
status, not an unexplained low-risk label, determines partial confirmation.

### 3. P1: reconcile retention with resumable review

**Conditional contract conflict, S3/S5/S6.** A source retained only for one run
cannot necessarily be reopened later at the same image crop. The draft does not
specify when each promise applies. A saved crop is itself retained source data.

Define two honest modes where supported:

- Encrypted source retained for an explicit period: resume the original crop
  while it remains available; show expiry and deletion effects.
- Transient original or retained reviewed text only: explain that the original
  image will not be recoverable, and identify what evidence remains available.

Preserving the review revision does not authorize applying it later. On return,
recheck current clue ownership, source authorization, and target-state version.
Show conflicts and require renewed review when the proposed effect has changed.

**Acceptance:** interruption, expiry, deletion, source revocation, and concurrent
change tests produce no undisclosed retained crop, false source-recovery claim,
or stale commit.

## Additional bounded improvements

- **P2, S3/S7: distinguish work status from action outcome.** Pending identity,
  pending facts, processing failure, completed with no change, and confirmed
  changes need distinct semantics. No action can be appropriate even after facts
  were confirmed; it does not mean identity review is finished.
- **P2, S1: make temporal comparison adaptive.** Preserve an inline comparison;
  use stacked current/historical sections on narrow screens and columns only
  when space supports them. Follow the existing design system's no-preselection
  and valid-owner rules.
- **P2, S2/S5: preserve context around crops.** Keep speaker and original time
  context, editable recognized text, and an authorized route to surrounding
  messages. A crop alone can remove the evidence needed to judge attribution.
- **P2, S7: measure correct decisions as well as fewer taps.** Pair time to receipt
  with seeded-error detection, correction burden, recovery success, receipt
  comprehension, and a manual-note baseline. Step reduction alone can reward
  hiding necessary review.

## Recommended flow and step health

This is a conceptual sequence, not a requirement for five separate screens.

| Step | Current concept health | Recommended behavior |
| --- | --- | --- |
| 1. Intentional import | Sound direction; first-screen burden unclear | Show source and processing/retention state; permit saving for later. |
| 2. Resolve blocking identity/context | Needs revision | Show evidence and valid temporal owners; allow corrections and unresolved outcome. |
| 3. Confirm supported changes | Needs dependency contract | Show old → proposed values and evidence; accept, edit, dismiss, or defer claims independently where safe. |
| 4. Return a truthful receipt | Sound principle; concrete states missing | State saved source, accepted changes, unresolved reasons, and a direct return destination. |
| 5. Resume or inspect an action | Needs recovery evidence | Revalidate before commit; show an action preview only when a supported proposal exists, with separate approval. |

Illustrative receipt copy, conditional on actual state:
“Two changes confirmed; one date still needs review.” Offer “Continue date review”
and a direct route to the person. For an unknown identity:
“Saved for review; no relationship updated.” Do not expose canonical-state or
compiler terminology in ordinary user-facing copy.

Inbox should be a recoverable review queue reachable from existing work context,
not a new mandatory top-level evidence library.

## Evidence limits and release position

No observed production defect or active safety veto was established. The P1
items identify contract ambiguities and credible risks; they do not establish
that the current application has those failures.

Visual craft, contrast, target sizes, Dynamic Type, VoiceOver, keyboard order,
latency, and actual resumption were not tested. No user study establishes
workflow speed or adoption. The next proof is a narrow prototype plus synthetic
dependency/recovery tests, not more feature modules.

Detailed proposed owners, evidence requirements, and pass conditions are in
[panel.json](panel.json). This review changed no product behavior or Notion content.
