# Independent review resolution

Original independent report: `01cb7aa8`; retained unchanged in
[independent-code-review.md](independent-code-review.md). Parent conclusions
below are not an independent approval of later commits.

| Finding | Parent disposition | Proof and remaining gate |
| --- | --- | --- |
| P1-1 uncertain upstream result becomes 422 | Confirmed, already repaired in `b4757a40` | Two failing route regressions became passing; 42 affected route/card checks passed. Unknown upstream failure or partial multipart persistence remains 503/unknown; genuine pre-write rejection remains correctable. Independent code-level closure recorded at `7a99f873`. |
| P1-2 stop races failure/shutdown finalization | Confirmed and repaired locally | Pi repair `20260924-185321-0dd275eb` reproduced lost admitted text/attachments and missing persistence; governed save now precedes scrub. Its 69 PostgreSQL checks passed twice, then passed independently in the parent worktree. Independent code-level closure recorded at `7a99f873`; deployment remains open. |
| P2-1 impossible single-owner deferred review | Confirmed; local repair | One-owner and over-20-candidate impossible actions are withheld without dropping candidates. Both bounds have regressions; final independent code-level closure is at `49b16a8c`. |
| P2-2 admission/completion source validity diverges | Confirmed predicate divergence; repaired locally | Deleted-resource, empty-text and wrong-scope regressions now exclude evidence before provider work. Expired authorization already failed early through loadSnapshot; the original review trigger was corrected. Final locked validity guard remains intact. Independent code-level closure recorded at `7a99f873`. |
| P2-3 history traversal bypasses warning | Confirmed limitation, plus a reproduced continuation race | Persistent copy states that history traversal loses in-memory reconciliation. `popstate` ends follow-up admission before delayed unmount; regression failed with two writes before repair. No cancelable Back prompt or durable recovery is claimed. Independent review closes the continuation race; durable recovery remains open. |

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

Parent backend follow-up removes raw exception data from the newly added raced-stop warning; only queue identity and a fixed failure classification are logged. The existing injected history-save-failure regression now asserts the complete log metadata shape. Other historical logger paths were not audited by this narrow change.

Latest assembled parent verification at `7a99f873`: Web 1,276 passed / one intentional live-test skip; backend typecheck passed; docs check passed (629 Markdown files, 87 migrations). The parent warning-hardening failure-injection check passed (one selected test; 38 excluded by its name filter). Existing React act warnings in Memory-review tests were not treated as a warning-free run. See [command readback](evidence/parent-verification-7a99f873.json). Independent re-review completed against this exact source head; its later upper-bound closure is recorded below.

## Independent closure at 7a99f873 and bounded follow-up

The [independent re-review](independent-code-re-review.md) closes P1-1, P1-2 and P2-2 at code level and closes the P2-3 continuation race while retaining its durable-recovery product gap. No new P0/P1 was confirmed in its bounded static scope. It found one remaining P2-1 upper-bound mismatch: name/clue search can merge to more than the 20 candidates admitted by the API.

Parent reproduced the upper edge with 20/21-candidate controls, then repaired it at `49b16a8c`: preserve the complete candidate set, withhold an impossible defer action, and explain narrowing without silently dropping candidates. The 21-person case failed before repair; all 35 card checks, Web TypeScript and changed-file ESLint passed after. [Before/after command readback](evidence/identity-review-upper-bound.json). The same reviewer subsequently confirmed this edge closed at `49b16a8c`, with no new defect in the two-file follow-up. No candidate is silently truncated.

An unrated observation remains: SessionWorkbench still has two relative-time call sites using a fresh clock. It needs a concrete hydration reproduction before being scored as another defect. This observation does not invalidate the verified SessionDirectory repair.

## Final local checkpoint

All confirmed code findings from this review loop are closed at their named revisions. This is not overall product acceptance: P2-3 durable recovery, the unrated workbench clock observation, live Memory, visual follow-up, deployment, native/assistive coverage and the numerical target remain open. No Pi worker remains active for this checkpoint.
