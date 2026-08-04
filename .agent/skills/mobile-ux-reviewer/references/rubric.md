# Mobile UX rubric

| Dimension | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| Task legibility | Object/action unknowable | Major reconstruction needed | Understandable with hesitation | Candidate, change, evidence, and action are clear | First-use users explain them correctly in testing |
| Information hierarchy | Human-value ranking or chaos | Competing focal points | Usable but dense/flat | One dominant decision, coherent grouping | Hierarchy survives all tested content and accessibility sizes |
| Evidence/control | Evidence or correction absent | Distant/obscure | Present with friction | Evidence, uncertainty, edit, dismiss, confirm cohere | Seeded-error detection and correction success are measured |
| Platform interaction | Broken/unexpected | Many convention violations | Mixed native behavior | Predictable navigation, controls, permissions | Polished input, focus, interruption, and device behaviors |
| Accessibility | Essential path inaccessible | Severe barriers | Partial conformance | Critical path works across required modes | Assistive-technology user evidence plus automated/manual audit |
| State completeness | Happy path only | Failure loses/duplicates work | Some states incomplete | Loading, empty, ambiguity, failure, retry, expiry handled | State matrix automated and interruption-tested |
| Feedback/recovery | False success or no recovery | Vague/unsafe | Basic error path | Accurate feedback and safe retry | External-result reconciliation and recovery are proven |
| Visual craft | Decoration impairs meaning | Generic/inconsistent | Coherent but unrefined | Distinctive, calm, precise, content-led | Craft remains coherent across themes, locale, content extremes |
| Performance feel | Frozen/unexplained | Long blocking waits | Feedback but jank/latency | Responsive or honest progress/cancel | Measured critical-path budgets and graceful degraded mode |

## Verdict rules

- `pass`: every critical dimension ≥3; no veto; evidence level 1 for release approval.
- `pass_with_changes`: no veto and bounded issues with verification steps.
- `fail`: veto or any 0–1 on evidence/control, accessibility, state integrity, or feedback.
- `abstain`: artifact cannot demonstrate the behavior being claimed.

Do not average a critical-path failure into a visual-craft score.
