# Evidence safety rubric

Score each dimension independently. The gate is determined by vetoes and the lowest consequential dimension.

| Dimension | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| Identity/speaker binding | Uncontrolled mismatch | Heuristic accepted silently | Review exists but ambiguity is weak | Explicit scoped match and correction | Adversarial mismatch tests and measured error handling pass |
| Provenance | No source link | Generic source only | Partial span/version trace | Field-level evidence, derivation, edit, confirmer | End-to-end replay and supersession are tested |
| Uncertainty/conflict | Guess becomes fact | Uncertainty hidden | Labels exist but behavior barely changes | Clarify, abstain, conflict, expire paths are distinct | Calibrated thresholds and seeded ambiguity tests pass |
| User authorization | Silent or bundled action | Vague confirmation | Preview incomplete | Exact target/effect previewed and editable | Comprehension, interruption, and permission-change tests pass |
| External write integrity | Unverified/duplicative | Optimistic success | Basic result check | Idempotent execution, result, failure, retry | Reconciliation and reversal are proven across integrations |
| Privacy lifecycle | Unknown/unbounded | Policy-only controls | Partial minimization/retention | Purpose, access, retention, export, delete implemented | Derived stores/backups/vendors are verified and monitored |
| Sensitive inference boundary | Candidate scoring or sensitive inference | Proxy risk ignored | Prohibition stated only | Product and tests prevent prohibited inference | Red-team and monitoring catch direct and proxy violations |
| Evaluator reliability | One opaque judge | Unsupported global score | Rubric but no calibration | Atomic evidence-based review with human gold set | Stability, order swaps, counterexamples, drift checks pass |

## Gate

- `pass`: all consequential dimensions ≥3; no veto; current executable evidence.
- `pass_with_changes`: no veto; gaps are bounded and cannot cause silent harm.
- `fail`: any veto, or 0–1 in identity, provenance, authorization, privacy boundary, or write integrity.
- `abstain`: implementation, data flow, jurisdiction, or evidence is unavailable.

No arithmetic average may override the gate.
