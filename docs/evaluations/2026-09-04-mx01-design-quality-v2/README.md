# MX-01 design-quality review v2

This bundle deepens the already-selected **Direction 2: Decision Lens** without
authorizing MX-02 or changing the pending real-human MX-01 release gate.

## Outcome

Produce one frozen MX-01 prototype candidate that:

- preserves the source → fact → exact effect → observed outcome boundary;
- feels calm, continuous, and responsive on a 393 × 852 mobile viewport;
- keeps every consequential control complete and reviewable;
- earns a Design Quality Index (DQI) of at least 95 under `rubric.json`;
- has no active domain veto, blocker/high finding, inaccessible consequential
  path, console error, or failed deterministic check.

The DQI is an internal design-quality comparison instrument. It is not a
candidate score, a release certification, statistical independence, or a
substitute for the two pending 9/10 human comprehension tests in MX-01.

## Evidence order

1. `freeze-baseline.json` records the unchanged starting artifact.
2. `research/` records first-party Claude product facts and the narrower design
   inferences used here.
3. `audit/` records current-run browser evidence and issues. A prior screenshot
   may orient the review but cannot satisfy the current-run audit requirement.
4. `freeze-candidate.json` will identify the exact candidate sent to reviewers.
5. `reviews/` will contain blind, jurisdiction-scoped packets. A reviewer must
   not see another reviewer's score before returning its own packet.
6. `panel.json` will preserve disagreements, vetoes, next proof, and the final
   DQI computation.

## Current adjudication

The current protected artifact is `freeze-candidate-v8.json`, and the
authoritative multi-lens result is `panel-v8-focused-flow.json`. The panel
preserves the independent raw specialist scores without averaging them:
recruiter workflow 96, evidence safety 97, mobile UX 97, candidate experience
98, and visual craft 96. All five reviews used the same final hashes and report
no active blocker, high finding, or veto.

The earlier `dqi-scorecard.json` claim of 95.9 is invalidated because its
evaluator modified the artifact and its freeze hashes drifted. See
`adjudication-integrity.md`. No earlier freeze, screenshot, or score may be used
to fill a v7 evidence gap.

V8 has matching direct-render evidence, live interaction/accessibility replay,
and a clean console capture. The specialist gate therefore passes for the
focused prototype. This does not substitute for production connector proof or
the separate real-human MX-01 comprehension gate, which remains pending.

## Stopping rule

Stop when the frozen candidate has DQI ≥95, every dimension ≥90, every critical
dimension ≥95, zero active vetoes, zero blocker/high findings, and all named
checks pass. Otherwise record the highest evidenced state and the smallest next
test; never round up or fabricate human evidence.
