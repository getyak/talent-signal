# Momentum Experience V2 — MX-01 direction evidence

This bundle freezes the two rendered directions, the product-owner selection,
the runnable selected-direction prototype, browser design QA, specialist review,
and the still-pending human comprehension gate for MX-01.

## Decision

Direction 2, **Decision Lens**, is selected. It keeps the exact source and Brief
readable while treating fact confirmation as a temporary focus layer. The
separate exact-effect approval cannot appear as authority inherited from the
fact decision.

Direction 1, **Causal Rail**, is rejected for the production direction. Its
continuous evidence-to-action rail makes causality visually memorable, but it
adds more persistent material containers, consumes more vertical space at AX5,
and risks turning the complete experience into an audit workflow. The stress
board preserves its useful ideas without treating it as selected.

See [direction-decision.md](direction-decision.md) for the full tradeoff record.

## Frozen artifacts

- `directions/direction-1-causal-rail.png` — initial Direction 1 render.
- `directions/direction-1-stress-states.png` — Direction 1 light, dark, AX5,
  VoiceOver-order, failure, and no-action board.
- `directions/direction-2-decision-lens.png` — selected source render.
- `qa/source-implementation-comparison.jpg` — same-state 393 × 852 comparison.
- `qa/today-current-source.png`, `qa/today-current-implementation.jpg`, and
  `qa/today-current-comparison.jpg` — current-product Today source, same-size
  implementation, and combined visual-preservation review.
- `qa/today-ax5-dark.jpg` — Today accessibility-size dark-mode render.
- `qa/study-setup.jpg`, `qa/study-lead-response.jpg`, and
  `qa/study-stimulus-comparison.jpg` — the moderator runner, post-exposure
  verbatim state, and exact 393 × 852 stimulus comparison.
- `qa/study-scorer-entry.png`, `qa/study-scorer-evidence.png`,
  `qa/study-adjudication-disagreement.png`,
  `qa/study-adjudication-draft.png`, and `qa/study-scorer-mobile.png` — the
  independent-scoring, provenance join, atomic disagreement, manual-review
  draft, and narrow responsive states. The displayed 9/10 and 10/10 are an
  explicitly synthetic rehearsal, not human evidence.
- `qa/state-matrix.jpg` — fourteen browser-rendered selected-direction states.
- `qa/voiceover-order.jpg` — selected-direction linear semantic order render;
  it is not a physical-device VoiceOver claim.
- `prototype-snapshot/` — the selected `Prototype.tsx`, visual CSS, dependency
  lock, and passed design-QA report.
- `reviews/panel.json` — five-lens review and adjudication.
- `human-test/protocol.md` and `human-test/results-template.csv` — frozen human
  gate. No participant result is prefilled or inferred.

The runnable prototype remains outside production source at:

`/Users/cubxxw/.codex/visualizations/2026/09/01/01a05bcf-3da6-7a40-95ae-adc55d380260/mx01-decision-lens`

The main-screen preview is `http://127.0.0.1:4173/?view=today`; the selected
fact-decision state remains available at
`http://127.0.0.1:4173/?name=long&stage=fact` while the development server is
running. The human-test moderator entry is
`http://127.0.0.1:4173/?study=moderator`. Independent scorer entries are
`http://127.0.0.1:4173/?study=score&role=scorer_1` and
`http://127.0.0.1:4173/?study=score&role=scorer_2`; the separate provenance
join and adjudication entry is
`http://127.0.0.1:4173/?study=adjudicate`.

## Current gate

The rendered direction, executable loop, design QA, and required review panel
are complete with no active safety or accessibility veto. MX-01 remains open
because the frozen ten-participant tests have not run. This bundle does not
claim the required 9/10 five-second comprehension or 9/10 fact-versus-action
distinction. The runnable evidence workbench now covers independent double
scoring, raw-file fingerprint matching, atomic disagreement adjudication, and
reviewable result/status drafts without changing the official `not_run` state.

Run `node scripts/evals/validate-momentum-experience-direction.mjs` from the
repository root to validate the frozen bundle and its pending-gate honesty.
