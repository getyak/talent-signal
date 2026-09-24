# Independent review resolution

Original independent report: `01cb7aa8`; retained unchanged in
[independent-code-review.md](independent-code-review.md). Parent conclusions
below are not an independent approval of later commits.

| Finding | Parent disposition | Proof and remaining gate |
| --- | --- | --- |
| P1-1 uncertain upstream result becomes 422 | Confirmed, already repaired in `b4757a40` | Two failing route regressions became passing; 42 affected route/card checks passed. Unknown upstream failure or partial multipart persistence remains 503/unknown; genuine pre-write rejection remains correctable. Re-review required. |
| P1-2 stop races failure/shutdown finalization | Confirmed code path; repair in progress | Pi task `20260924-183413-d52d027f` owns the bounded backend repair and real-database regression. No resolution or deployment claimed yet. |
| P2-1 impossible single-owner deferred review | Confirmed; local repair | One-owner regression failed before repair; the action is now withheld and the copy offers current-owner selection or removal of the clue. Multi-candidate review remains covered. Re-review required. |
| P2-2 admission/completion source validity diverges | Confirmed predicate divergence; repair in progress | Same Pi task must prove expired authorization is handled before provider exposure, retaining the final change/revocation guard. Do not infer privacy safety only from a late rejection. |
| P2-3 history traversal bypasses warning | Confirmed limitation, plus a reproduced continuation race | Persistent copy states that history traversal loses in-memory reconciliation. `popstate` ends follow-up admission before delayed unmount; regression failed with two writes before repair. No cancelable Back prompt or durable recovery is claimed. Re-review and durable design remain open. |

Parent browser work additionally found EXP-15 (search Person destination) and
EXP-16 (relative-time hydration). Canonical search destination readback and a
failing-before/passing-after hydration regression support their local repair.
See the [audit index](README.md) and [journey acceptance ledger](acceptance.md).

Parent follow-up checks: 42 focused Web tests passed, Web TypeScript passed,
changed-file ESLint passed, and documentation/architecture checks passed
(628 Markdown files, 87 migrations). The first history regression fixture
reused the previous test's destination; it now explicitly changes and asserts
the route before dispatching the history event. Isolated and combined runs
must use that corrected fixture.

The newest local fixes have not been deployed. Storage, live Memory acceptance,
native/assistive coverage and final scores remain open. No overall 98/100 result
or release acceptance is supported by this checkpoint.
