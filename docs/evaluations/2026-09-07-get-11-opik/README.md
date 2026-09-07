# GET-11 phase-one verification

Date: 2026-09-07. Worktree: `codex/get-11-opik-phase-one`, based on
`9041aaa3`. Concurrent GET-8 work in the original checkout was preserved.
This is implementation and observed-state evidence, not a claim that a paid
model improved or a candidate was deployed.

## Verified implementation

| Surface | Evidence |
| --- | --- |
| Private Opik projection | [Captured proof](projection-proof.json): local completion survives remote failure; retry executes no model, preserves artifact digests and reads back one trace, 12 spans, 10 atomic scores and one experiment link. Duplicate replay reuses the completion. |
| Projection deletion | The same proof records verified deletion receipts and late-retry rejection. A subsequent extra network read timed out and remains unknown rather than overwriting the earlier observed receipt. |
| Private runtime observation | [Captured proof](runtime-observation-proof.json): two traces, ten spans and image content read back, then each trace/span was confirmed absent. [Earlier synthetic probes](runtime-observation-cleanup.json) were also removed and their six traces/fourteen known spans observed absent. |
| Native feedback and Lab | 21 Simulator tests passed for response loss, revision conflicts, wrong-output readback, unavailable sources, withdrawal, private single-configuration cases and explicit candidate choice. The [Chinese large-text render](native-correction-zh-large-text.png) was visually inspected. |
| Native UI to PostgreSQL | The subsequent [complete native proof](native-feedback/README.md) passed 40 tests with zero failures/skips, including UI correction, process restart, persisted readback and an explicit candidate rerun. All three synthetic provider inputs match; no model or business write occurred. It also covers terminal receipt deletion winning late autosave and removes a fixed SwiftUI-loading delay from the render check. |
| Feedback lifecycle | 11 isolated PostgreSQL tests execute authenticated Chat → Session → correction → frozen private regression → Lab job → readback, plus edits, withdrawals, observations and source invalidation. The separate observation lifecycle test covers real source deletion. No production database was used. |
| Budget and search | SQLite tests cover atomic per-scope resources, multiple processes, unknown billed outcomes, candidate admission, owner recovery, stop and tombstones. The isolated Python search and production serializer use fake transport in tests. |
| Atomic comparison metrics | Five separate semantic criteria retain paired/slice denominators and unknowns; missing current metrics cannot be waived by signing an old report. Correction burden is an explicit prospective review proxy, not measured user editing time. |
| Exposure lifecycle and grouping | Real CLI tests cover source-group retirement, independent replacements, input-only development import, stale evidence and concurrent updates. Authenticated native exports bind the original Session, preventing different turns from crossing independent partitions. Cleanup covers old binding formats, expired sources and local withdrawal during a 503. |
| Independent controller | [CLI proof](offline-controller-proof.json): freeze → verify → adjudicate → inspect executed twelve paired product attempts; reassessment replayed signed recordings with zero new calls. Semantic quality remains `needs_review`, release `not_run`. |
| Loaded configuration | Backend tests verify the captured task digest, actual timeout, model capabilities, bundled catalogue, immutable workspace scope and authentication. Independent compiled-module/route readback matched all four emitted build trees; source execution reports no deployment build proof. A fresh-process test installs and restores selections in disposable compiled copies. |
| Independent review | [Correctness review](independent-review.md) and [second safety review](safety-review.md) and [fresh PR review](pr-review.md) record reproducible findings, repairs and independent retests. No confirmed P0/P1 remains open in the reviewed implementation. |

The existing Opik backend returned readiness failures for Redis/database and
was unhealthy before recovery. Restarting that backend process preserved all
volumes and restored healthy status with version `2.2.45`. An available version
endpoint alone is not treated as projection or deletion proof.

The [signed eight-group CI proof](ci-proof.json) for implementation commit
`59d6e11e` passed backend build, runner
typecheck, evaluation/agent/backend/runner tests, deterministic P0 checks and
Python optimizer tests. The twelve P0 cases passed deterministic safety while
semantic judgment remained `needs_review`; those are not twelve semantic
passes. Localization, workflow actionlint, pinned-action checks, documentation
checks and whitespace checks also passed. Web and Agent Host typechecks passed
against the changed shared packages. All live Opik proof used synthetic
content and zero paid calls.

Maintenance now also retries queued runtime export and remote deletion without
blocking source validation. Its 22 controller tests passed, followed by the
final eight-group CI run. Evidence-only documentation commits may follow this
recorded implementation revision; a real release requires a new proof against
its exact candidate checkout and current revision. The fresh pre-PR review
independently passed 28 PostgreSQL/runner tests on `6601c575`, including
source withdrawal before dispatch, deletion during an in-flight provider call,
lease expiry and disabled Opik observation. It also verified persisted-tombstone
recovery after a real process crash. Both additional P1 findings are closed.

The first hosted PR checks led to bounded contact parsing, static subprocess
test fixtures, credential-cache cleanup and less resource contention in the
runner suite. A later acceptance audit expanded semantic assessment into five
separate dimensions, each with paired and slice denominators/unknowns; old
overall judgments and incomplete signed reports fail the current contract.
The new synthetic corpus exercises 60 product attempts, including deliberate
provider failures. A separate Workspace Agent tool test observes actual tool
failure, retry and recovery through the production provider without expanding
the text optimizer's tool permissions. These remain controlled boundary tests,
not evidence of improved paid-model behavior.

The expanded local checks passed 63 evaluation tests, the complete runner suite,
101 Agent tests and 375 backend tests, with the relevant builds and type checks.
Database-dependent tests are skipped by the generic backend command; the
separate disposable PostgreSQL run passed all 20 feedback integration tests,
including two different native executions from one Session and historical Lab
snapshot compatibility. Current hosted checks on the final PR revision remain
the merge gate; these local results do not replace them.

## Execution boundary

The proof captured in this directory used no paid model request, business
action, deployment or production prompt promotion. The authorized PR delivery
continues with hosted checks, merge and the existing baseline TestFlight backend
update; its actual deployment result will be read back in the linked PR. GET-12 still requires currency and monetary limits
per run/month, plus target environment and exposure scope. Those missing
parameters do not prevent implementation or isolated proof, and are not
filled with invented defaults.

Relationship-text quality is the first supported comparison scope. Synthetic
provider checks cannot certify screenshot recognition, all Agent tasks,
semantic improvement, judge calibration or a real release. Real private
content remains permitted within its declared purpose; private demonstrations
cannot be compiled into a shared cross-account production prompt.

Use the [operational playbook](../../operations/opik-phase-one.md) for the
runtime, controller and recovery commands. Execution parameters above remain
the boundary for a funded experiment and an actual scoped deployment.
