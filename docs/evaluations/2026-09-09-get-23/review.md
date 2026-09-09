# GET-23 independent review

Reviewer: independent Codex sub-agent `get23_independent_review`, September
9–10, 2026. The reviewer inspected the task worktree without editing it.

## Findings and resolution

| Finding | Resolution |
| --- | --- |
| Pool starvation while product transactions persist spans | Queue writes without awaiting another connection; flush after transaction |
| Screenshot resume loses runtime capture | Restore sink from durable task/run association |
| Public research tool output omitted | Return and capture the actual research result |
| Conflict retry loses rating intent | Retain pending sentiment/notes and rebase only version/operation ID |
| Screenshot/source withdrawal not reflected in monitor | Reuse canonical source predicates |
| Cleanup removes prior-task dependency and revives old Eval | Require non-null input permanently; test child and case after cleanup |
| Historical rating incorrectly labeled current | Match answer hash, feedback revision and sentiment |
| Web correction loses original context or exceeds objective limit | Owned prior-task reference and bounded server history; short correction draft |
| Promptfoo concurrent cases fail on account busy | Bounded busy retry and reuse persisted job |
| Product case has one original config but Lab needs two | Use selected admitted A/B configurations for product cases |
| Lab task switch leaves incompatible configurations | Synchronize source task and reset incompatible A/B when loading case |

The independent reviewer reported no remaining P0/P1 after the source cleanup
fix, and reaffirmed that conclusion for the first Lab UI integration delta.
They independently ran Promptfoo 2/2 and product capture 1/1 tests. Main-agent
PostgreSQL, native and real UI receipts are listed in [plan.md](plan.md); the
code review does not substitute for them.

The final focused pass approved canonical JSON request identity, Lab task/config
synchronization and the saved-case deep link, with no new P0/P1. The remaining
Lab configuration P2 was closed. A later visual-only native change improves
the Save note contrast/target and its length-limit guidance; the signed build
passed.
