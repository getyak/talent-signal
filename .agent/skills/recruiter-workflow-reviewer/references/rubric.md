# Recruiter workflow rubric

Score each dimension 0–4, then report the lowest material dimension rather than hiding it in an average.

| Dimension | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| Trigger relevance | No recruiter job is clear | Generic productivity claim | Plausible trigger, weak urgency | Clear real trigger and why now | Repeated field evidence shows the trigger is important and timely |
| Capture burden | More work than manual | Heavy duplicate entry | Some avoidable entry/context switching | Minimal intentional input | Faster than fallback across realistic interruption cases |
| Evidence review | Source absent | Source distant/unclear | Evidence visible but correction awkward | Evidence, uncertainty, edit, confirm are coherent | Users reliably catch seeded errors without rubber-stamping |
| State integrity | State is guessed/overwritten | Important ambiguity suppressed | Some versioning or identity gaps | Confirmed state is typed, scoped, and reversible | Conflicts, retractions, history, and stale state are proven end to end |
| Action usefulness | Generic or harmful advice | Vague next step | Relevant but not executable | One specific, timely, owned action | Action completion measurably improves the intended operational outcome |
| Write safety | Silent or misleading external write | Weak preview/result | Confirmation exists but duplicate/failure behavior is unclear | Preview, confirm, idempotency, and result are visible | Failure, retry, duplicate, undo, and audit paths are tested |
| Interruption recovery | Progress is lost | User must reconstruct context | Partial persistence | Safe resume with current context | Cross-device/day return and changed external state are handled |
| Wedge discipline | Candidate scoring or generic CRM sprawl | Many unrelated features | Core loop competes with extras | Candidate-momentum loop stays primary | Every surface reinforces capture → verified state → action → outcome |

## Verdict rules

- `pass`: no dimension below 3; no veto; evidence covers the complete loop.
- `pass_with_changes`: no blocker; one or more dimensions at 2 with a concrete fix/test.
- `fail`: any dimension at 0–1 on identity, evidence, state, or write safety; or a veto.
- `abstain`: artifact, user context, or executable evidence is too incomplete to judge.

Do not calculate a decorative mean. If a numeric summary is required, use the minimum material score and list all dimension scores in the evidence.
