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


Final independent gate review (`get23_final_gate_review`) approved the delta
through `ef056d0e`: cleanup classification and write guards, CI lifecycle proof,
native localization, environment declarations and the unchanged shared migration
059. No remaining P0/P1 or material P2 was found.

A separate review of the isolated release integration with deployed account
commit `90763636` approved the merged routes, contracts and three-migration
readiness requirement. It identified a P2 where monitor/feedback requests did
not carry the rendered workspace scope. All four requests now use the existing
`workspaceSessionFetch`; the reviewer read both worktrees and closed the finding.
The integration review has no remaining P0/P1/P2.
