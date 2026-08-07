# iOS share to person Wiki

Status: in progress
Owner: Codex
Started: 2026-08-07

## Outcome

An independent recruiter can intentionally choose or share one conversation
screenshot on iPhone, review and correct the on-device text extraction, compare
temporally correct identity candidates, bind the source to one person and one
purpose-scoped relationship, and receive a truthful compiled-Wiki receipt.

The slice closes the current product gap where a selected image is displayed as
an unbound dead end. It does not authorize messaging, calendar, contact, ATS,
CRM, or other external writes.

## Boundary

- The original image remains on-device in this slice. The backend receives only
  recruiter-reviewed text, source metadata, and an explicitly supplied identity
  clue.
- OCR does not infer message speaker, candidate intent, fit, personality, or
  acceptance probability.
- No source is submitted until the recruiter explicitly confirms the reviewed
  draft.
- No candidate is preselected. A current identity clue is actionable; an
  expired historical clue remains visible but cannot be silently rebound when a
  different current owner exists.
- An interrupted or failed request preserves the review draft and uses stable
  idempotency keys for a safe retry.
- App Shortcuts stages one recoverable pending image and opens the same review
  flow; it does not bypass review.

## Completion evidence

1. A Photos picker selection and App Shortcut both enter one capture-review
   surface.
2. On-device OCR produces an editable text draft with an explicit unknown
   speaker attribution.
3. The recruiter can edit display-name, identity-handle, and relationship
   context hints before submission.
4. The shared backend creates a governed `ios_share` resource capture and
   returns an identity-resolution case.
5. The identity surface presents current versus historical candidates in
   backend order, explains the temporal reason, and requires an explicit
   selection.
6. Leaving identity unresolved is a first-class completion, not an error.
7. Explicit current-owner binding returns person and relationship IDs, compiles
   the relationship Wiki, and displays the actual quality verdict.
8. Simulator proof covers success, ambiguity, retry, interruption, Dynamic
   Type, dark mode, and evidence-before-decision order.
9. Mobile UX, recruiter workflow, evidence safety, and adjudication reviews are
   frozen as repository artifacts.

## Milestones

- [x] Model pending capture, reviewed draft, temporal candidates, and completion
      receipt.
- [x] Add on-device text recognition and a persistent one-item capture inbox.
- [x] Add a loopback-only authenticated capture/identity/Wiki client.
- [x] Add the review, identity comparison, retry, and completion surfaces.
- [x] Route Photos picker and App Shortcut input into the same flow.
- [x] Add deterministic unit and UI tests.
- [x] Prove the real backend and Simulator path.
- [ ] Run specialist reviews and full relevant checks.
- [x] Route durable product and architecture learning into canonical docs.
