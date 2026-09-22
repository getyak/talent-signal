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

Focused automated checks passed: agent 45, backend unit 63, Web 63 and Eval
eight tests, plus 72 database integration tests on a separate migrated database. Backend build, Web typecheck and docs checks passed. The frozen
Eval set has nine synthetic cases and 25 adversarial samples. The live-result
checker verifies actual tool receipts and persisted references; it does not
replace semantic review or measure broad model reliability.

## Limits

The initial reply still used an unnecessary visual descriptor, and regenerated
source context appeared in a contact-specific group instead of exclusively in
the relationship group. These presentation/classification limitations remain;
the final stored sentence correctly attributes the introduction to the owner.

Automatic public-place enrichment is not wired into the workspace tool set.
A manually researched public place candidate is not evidence that either
participant visited, worked there, or met there. The original private Eval case
remains pending human adjudication; it is not promoted to a golden or an
overall model-quality pass.

No production release is claimed. The GET-40 prerequisite PR #235 is still a
draft with a failing iOS smoke gate and unfinished broader model acceptance.
