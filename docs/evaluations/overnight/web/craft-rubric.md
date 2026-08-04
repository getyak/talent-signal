# Web evidence-review craft rubric

This rubric is behavior anchored. Each dimension is atomic and must have direct
evidence for a score of 98 or higher. A hard-gate failure is not averaged with
strong visual craft.

## Hard gates

A run fails regardless of craft scores if it:

- presents unsupported content as confirmed or verified;
- persists or acts through unresolved identity, speaker, date, timezone, or
  assignment ambiguity;
- merges fact confirmation with action approval;
- manufactures work for `no_action`, clarification, or blocked cases;
- scores candidate worth, fit, personality, protected traits, or acceptance;
- presents a fixture, failed effect, unknown effect, or unobserved effect as a
  synchronized success.

## Atomic dimensions

| Dimension | 98-100 behavior anchor | Required direct evidence | Score |
| --- | --- | --- | --- |
| Product specificity | The page answers what changed, why now, what is unresolved, and the smallest safe action using recruiting-specific language and objects. | `surface-results.md`, all-eight case table; critical-path screenshots. | 100 |
| Narrative clarity | Evidence, proposal, confirmed state, action approval, and outcome read in causal order without documentation. | `ts-core-01-first-fact.yml`, `ts-core-01-facts-reviewed.yml`, pending and verified screenshots. | 99 |
| Attention hierarchy | One unresolved dependency dominates; metadata, provenance, and history remain quieter; no person-ranking device appears. | Desktop light/dark and mobile screenshots. | 99 |
| Evidence proximity | Every decision-relevant assertion and action exposes an exact fixture quote in the same review context. | All-eight case exercise and `TS-CORE-01` artifacts. | 100 |
| Typography | Type scale, line length, weight, and numeric metadata remain legible and semantically consistent in both themes. | Desktop light/dark and mobile screenshots. | 99 |
| Spacing and rhythm | Dense review information remains scannable without generic card tiling, clipped controls, or horizontal overflow. | 1440 x 1000 and 390 x 844 screenshots; measured zero mobile overflow. | 99 |
| Restrained color and state semantics | Vermilion is scarce; every state has text/icon language and is not encoded by color alone. | Light/dark artifacts plus directly exercised proposed, ambiguous, confirmed, edited, dismissed, failed, and unknown states. | 99 |
| Materiality | Elevation and containers appear only for selected, reviewable, approvable, or focused objects; radius and shadow rules are consistent. | Desktop screenshots and CSS preflight. | 99 |
| Interaction and motion | Motion communicates selection or state change only; no perpetual decoration; reduced motion removes non-essential transition. | Reduced-motion browser check and dark reduced-motion screenshot. | 100 |
| Responsive composition | Desktop comparison becomes a deliberate single-column mobile review without missing evidence or actions. | Desktop and mobile semantic snapshots plus mobile screenshot. | 99 |
| Keyboard, focus, and accessibility | All case, fact, ambiguity, action, theme, and recovery controls are reachable in a logical order with visible focus and correct accessible names. | Direct skip-link, outline, Enter-selection, next-focus checks and Playwright semantic snapshots. | 98 |
| Loading, empty, error, and recovery | Fixture fallback, backend loading/failure, no-action, clarification, blocked, dismissed, failed, unknown, reset, and retry paths remain truthful and usable. | All-eight exercise, backend unavailable/fixture snapshots, loading route, and outcome checks. | 99 |

No hard gate fired. Scores are not averaged; every atomic dimension independently
meets the required threshold.

## Scoring rule

- `100`: behavior is complete and direct evidence shows no observed craft gap.
- `99`: complete behavior with one negligible polish defect that does not slow
  or confuse the recruiter.
- `98`: complete behavior with a small, named friction and a safe workaround.
- `95-97`: usable but the dimension has a visible or repeated craft gap.
- `<95`: incomplete, confusing, inaccessible, or unsupported behavior.

If a dimension remains below 98 after three correction loops, the final run
must report the exact observed gap and artifact locator.
