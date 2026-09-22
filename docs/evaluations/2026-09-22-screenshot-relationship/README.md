# Screenshot relationship assistant validation

## Scope

The reported image-only conversation repeated screenshot text, offered no
visible contact update, and displayed a redundant image placeholder. This
slice preserves acquaintance-source and relative-time clues in a human review,
keeps names unconfirmed until selection, and makes existing-contact association
visible. It builds on the locally integrated, unreleased GET-40 prerequisite.

## Observed failures and repairs

- A generic image objective produced OCR-style recaps. The objective now asks
  for concise relationship context and an actual proposal tool receipt.
- Name-only image lookup lacked source locators. Such screenshots now enter
  human contact review directly; stable-clue lookup retains its image locator.
- Repeated visual context exhausted 32k tokens before the final reply. Only
  image workspace runs allow 64k; dollar, time, turn and tool limits are intact.
- Contact rebasing asked for JSON through a prose-only adapter. Host-requested
  JSON now bypasses prose guidance and visible streaming. Invalid candidate
  shapes throw before persistence rather than silently replacing a review
  with an empty result.
- A real rebase reversed the introduction's speaker. The source attribution
  rule and a synthetic adversarial case explicitly cover that failure.

## Evidence

Private originals and model outputs are excluded from Git. A real authorized
screenshot was run through the built backend, the actual configured provider,
an isolated PostgreSQL database and the Web UI. The completed initial run used
35,058 input / 2,477 output tokens (provider-reported estimate USD 0.0757309),
staged two items, and persisted a matching proposal reference in the turn.

The browser visibly showed the source image without its old text placeholder,
the contact review, and the existing-contact association control. Following
manual selection, two records were saved, remained saved after reload and were
returned by scoped recall. Both retained unknown calendar time with no invented
timestamp. Rebase candidates were unselected until explicitly checked.

Focused automated checks passed: agent 45, backend unit 76, Web 63 and Eval
eight tests, plus 72 database integration tests on a separate migrated database. Backend build, Web typecheck and docs checks passed. The frozen
Eval set has nine synthetic cases and 26 adversarial samples. The live-result
checker verifies actual tool receipts and persisted references; it does not
replace semantic review or measure broad model reliability. Frozen-trial revision
checks now use the actual workspace/relationship prompt scope, matching runtime.

## Limits

A final real-model semantic recheck classified both source and add-friend
items as relationship records, in the initial proposal and after contact
regeneration. It preserved owner attribution and did not invent a calendar
date. This bounded recheck used an in-memory stage, not another database/UI
save. The response omitted avatar descriptions but still added an unnecessary
sentence about excluding payment records. That presentation limitation remains;
the previously saved sentence correctly attributes the introduction to the owner.

Automatic public-place enrichment is not wired into the workspace tool set.
A manually researched public place candidate is not evidence that either
participant visited, worked there, or met there. The original private Eval case
remains pending human adjudication; it is not promoted to a golden or an
overall model-quality pass.

The GET-40 prerequisite PR #235 has merged at `6053d69f`. The integration
retains its grounded self-memory and service-preference context alongside
this change's workspace/JSON output modes. Git delivery is separate from
production deployment; this report does not claim a resident release.
