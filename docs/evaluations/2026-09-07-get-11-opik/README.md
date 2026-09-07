# GET-11 phase-one verification

Date: 2026-09-07. Worktree: `codex/get-11-opik-phase-one`, based on
`9041aaa3`. Concurrent GET-8 work in the original checkout was preserved.
This is implementation and observed-state evidence, not a claim that a paid
model improved or a candidate was deployed.

## Verified so far

| Surface | Evidence |
| --- | --- |
| Private Opik projection | [Captured proof](projection-proof.json): local completion survives remote failure; retry executes no model, preserves artifact digests and reads back one trace, 12 spans, 10 atomic scores and one experiment link. Duplicate replay reuses the completion. |
| Projection deletion | The same proof records verified deletion receipts and late-retry rejection. A subsequent extra network read timed out and remains unknown rather than overwriting the earlier observed receipt. |
| Native feedback | Simulator tests exercise response loss, revision conflicts, wrong-output readback, unavailable/deleted sources, withdrawal and draft state. A native Chinese large-text render is captured in XCTest attachments. |
| Feedback and Lab | Isolated PostgreSQL tests execute authenticated Chat → Session → correction → frozen private regression → Lab job → readback, plus edits, withdrawals, observations and source invalidation. No production database was used. |
| Budget and search | SQLite tests cover atomic per-scope resources, multiple processes, unknown billed outcomes, candidate admission, owner recovery, stop and tombstones. The isolated Python search and production serializer use fake transport in tests. |
| Loaded configuration | Backend tests verify the actual captured task configuration digest and bundled catalogue, internal authentication and immutable process identity. A fresh-process optimizer test installs and restores source selections in disposable compiled copies. |
| Independent review | [Findings and retest record](independent-review.md) separates reproducible P1 findings, fixes inspected, independently rerun checks and remaining work. |

The existing Opik backend returned readiness failures for Redis/database and
was unhealthy before recovery. Restarting that backend process preserved all
volumes and restored healthy status with version `2.2.45`. An available version
endpoint alone is not treated as projection or deletion proof.

## Execution boundary

No paid model request, business action, deployment or production prompt
promotion was performed. GET-12 still requires currency and monetary limits
per run/month, plus target environment and exposure scope. Those missing
parameters do not prevent implementation or isolated proof, and are not
filled with invented defaults.

Relationship-text quality is the first supported comparison scope. Synthetic
provider checks cannot certify screenshot recognition, all Agent tasks,
semantic improvement, judge calibration or a real release. Real private
content remains permitted within its declared purpose; private demonstrations
cannot be compiled into a shared cross-account production prompt.

Use the [operational playbook](../../operations/opik-phase-one.md) for the
runtime, controller and recovery commands. This record will be finalized after
the remaining integration checks and independent review close.
