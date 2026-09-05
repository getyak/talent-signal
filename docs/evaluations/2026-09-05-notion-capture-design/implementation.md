# Capture review implementation evidence

## Outcome

The existing iOS Capture surface now implements the reviewed two-decision
loop: attach authorized evidence to one person and relationship, then review
each proposed fact independently. Confirmation, dismissal, unresolved state,
and no-action are canonical outcomes rather than presentation labels.

## Implemented behavior

- iOS freezes source intent before transmission, reads canonical state after
  uncertain responses, and resumes the same identity, speaker, claim, and
  compilation operations without automatic replay.
- The change review stacks the current relationship, prior value, proposed
  value, exact quote, reviewed source context, editable value, and independent
  decisions. Technical IDs remain available in a collapsed receipt.
- Unknown speakers cannot produce candidate claims. Relative dates require a
  recruiter-entered calendar date; import time is never used as the anchor.
- Claim decisions carry an evidence-authority token covering current source
  authorization, identity, evidence review, attribution, and provenance.
  Current assertion versions and durable decision IDs remain separate checks.
- A rejected fragment retracts states it previously confirmed, removes its
  proposals, invalidates generated views, and permits fresh proposals only
  after the evidence is explicitly reviewed again.
- The local original is protected, backup-excluded, and removed after seven
  days, when text-only retention is chosen, or after terminal completion.
  Reviewed text and progress remain for up to thirty days. Reimport creates a
  new retention clock instead of silently extending the old one.
- Web claim review forwards the same evidence token and enforces the same date
  and evidence blockers.

## Direct product evidence

| State | Screenshot |
| --- | --- |
| Relative date blocked while an independent fact remains actionable | [Date dependency](date-dependency.png) |
| One confirmed and one unresolved, with external continuation disabled | [Partial receipt](partial-receipt.png) |
| Relaunch returns to the same pending source and reviewed fact | [Resumed review](resumed-review.png) |
| Both facts confirmed, original removed, and effects still separately gated | [Completed review](completed-review.png) |

## Verification

- Backend integration: 15 scenarios passed, including serialized preparation,
  partial confirmation, strict date correction, response-loss replay, unknown
  author, stale evidence, wrong-owner correction, rejected confirmed evidence,
  no-action, source revocation, source deletion, and one durable decision.
- Backend unit: 10 tests passed across claim extraction, review authority, and
  evidence-review replay.
- iOS unit: 22 tests passed, including response-loss relaunch, retention, and
  changed-review compilation authority.
- iOS Simulator: the partial-confirmation and relaunch journey passed; the
  existing full explicit-owner journey also passed after the two-stage change.
- Web route and compatibility: 7 tests passed; backend, contracts, and Web
  type checks passed; localization and documentation checks passed.
- The local TestFlight backend was rebuilt, migrated, redeployed, and read back
  healthy through the tailnet-only HTTPS endpoint. The deployed artifact was
  inspected for the evidence-retraction implementation.

## Deliberate boundary

The first release uses exact reviewed quotes and the full zoomable original.
It does not claim pixel-accurate crop coordinates after the recruiter edits
OCR text. Broader semantic extraction remains conservative and proposal-only;
the implementation does not infer person quality, acceptance probability, or
external-action authority.
