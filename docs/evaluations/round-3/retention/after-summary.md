# XS-RETENTION-01 round-three result

## Adjudication

`XS-RETENTION-01` is resolved for the implemented retention slice.
`XS-CAPTURE-01` remains active and continues to block any claim of a complete
real Chrome capture path.

The evidence-safety re-review passes the retention slice at score 3 with direct
evidence and no in-scope veto. This is not a whole-product release approval.

## Effective contract

The localhost browser handoff now has one truthful matrix:

| Transport | `ephemeral` | `evidence_crop` | `full_source` |
| --- | --- | --- | --- |
| Selected text | Accepted; source text is purged when `analysis_proposal_committed` completes | Accepted; only the reviewed selection is retained to an enforced deadline | Rejected because a selection is not the full reviewed source |
| Visible tab | Rejected | Rejected | Rejected |

The backend additionally accepts `full_source` only for the synthetic fixture
transport with `full_reviewed_source` scope. This is the only current transport
that can prove the backend received the complete reviewed source.

Every accepted capture returns an account-scoped receipt containing requested
and effective policy, source-access state and reason, submitted/review/deadline/
purge/delete times, deletion ID when applicable, and ordered lifecycle lineage.

## Direct proof

- Fresh Docker PostgreSQL migration and API proof ran on project
  `talent-signal-retention-proof-85de`, backend port 4319.
- Ephemeral receipt `09f3af65-dc54-41b6-9e60-235fa287debe` changed from
  `available/awaiting_review_completion` to `purged/review_completed` without a
  manual delete. Its source text became unreadable and its lineage is
  submitted → review completed → purged.
- Evidence-crop receipt `293b1be9-cb40-4663-a842-fc92f0a54f6e` retained one
  reviewed selection until its real two-second deadline, then became purged.
  Re-analysis kept the derived proposal value but returned no source quote.
- Duplicate and retry returned the same capture and analysis, did not restore
  source content, and rejected a changed payload under the same idempotency
  key.
- Cross-account receipt lookup by ID and source locator both returned
  `RETENTION_RECEIPT_NOT_FOUND`.
- Manual deletion preserved a `deleted` receipt, deletion ID, and three-event
  lineage.
- An authenticated localhost Web session proved ephemeral receipt readback,
  evidence-crop Web workspace review, selected-text/full-source rejection, and
  visible-tab rejection. It recorded zero confirmed assertions, no action
  authority, and zero external writes.

## Three evidence-driven corrections

1. The frozen core evaluator caught a changed cross-account capture error; the
   stable account-scoped `CAPTURE_NOT_FOUND` precheck was restored.
2. Real ephemeral purge caught an invalid PostgreSQL parameter index; the
   production idempotency scrub query was corrected.
3. Final fail-closed review required semantic ordering for equal timestamps
   and retention enforcement before a deadline-expired idempotent analysis
   replay; the evaluator now retries first, receives no quote, and then reads
   submitted → review completed → purged lineage.

No further implementation correction was made after the third correction.

## Verification

Contracts, backend CI, Web tests/typecheck/lint/build, 33 source-extension
tests, package validation/build, 33 integrated-extension tests, frozen core
evaluation, fresh Docker backend evaluation, retention lifecycle evaluation,
authenticated localhost Web/API verification, and documentation checks passed.
The exact command ledger is in `command-results.json`.

## Remaining issues

1. `XS-CAPTURE-01` remains active: the proof does not establish a real
   user-granted Chrome toolbar capture path.
2. Visible-tab capture remains deliberately unavailable until a governed
   reviewed-image store and deletion lifecycle exist.
3. Backup and third-party vendor erasure are not evaluated because this local
   slice configures neither source store.
