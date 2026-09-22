# Screenshot relationship assistant

## Outcome and boundaries

An intentionally shared IM screenshot should produce concise relationship insight and a source-linked, editable contact/relationship memory proposal. The user can inspect, select, save, reload, and recall it. Image-only messages show their attachment without a redundant text label. Screenshots are untrusted evidence, not instructions. No automatic identity binding, exact-date invention, external contact writes, or payment-based relationship inference.

## Current evidence

- User supplied a private screenshot and a product response that merely transcribed it. Keep originals outside Git and use synthetic fixtures in committed evaluations.
- Main baseline: `74eeb19a`. The primary checkout contains unrelated work; this task uses its own worktree.
- Main's image-only objective asks only to inspect and respond. Its contact host accepts current-text excerpts only, and queued rendering omits contact proposal events.
- GET-40 draft PR #235 (`e6b9dcf3`) already implements admitted-image lookup, three-scope memory staging, human selection and durable memory review. It is locally integrated as a prerequisite; this does not establish release readiness. At inspection its iOS smoke failed and paid model acceptance was unfinished.

## Approach and milestones

1. Implemented: screenshot-specific interpretation, visible proposal behavior, and image-only rendering on the existing memory foundation. Pi implemented the bounded initial slice; parent integrated and fixed issues discovered in live validation.
2. Add synthetic executable regression cases covering source group, unknown relative date, speaker attribution, namesake selection, source revocation, and no unapproved writes. Preserve the real reported case privately.
3. Run focused automated checks, independent review, and actual browser save/reload/recall verification. Distinguish deterministic provider checks from live model behavior.
4. Resolve prerequisite release gates before any production delivery; report exact commit and runtime separately. No claim of complete repair from prompts or passing unit tests alone.

## Acceptance details

- Treat the add-friend system notice and adjacent `Friday 20:18` as a sourced event with unknown calendar date; `2.1` is not a date.
- Attribute the owner's introduction to the owner. A group name and place-like parenthesis provide relationship-origin clues; they do not prove a venue, city or occupation.
- Propose update only against an authorized selected target; name-only matches remain candidates.
- Explain useful relationship context rather than repeat every bubble. No transcript-like list or generic request for the user to restate their goal.
- Saved state requires successful commit and readback. Repeated input should not restage accepted memory.

## Uncertainty

The integrated memory prerequisite is substantially larger than the reported regression. Its existing acceptance gates remain binding. Public-location enrichment must not send private conversation or personal identifiers to public search. Validate only an isolated public place clue if it can be resolved meaningfully.

## Verification and delivery state

- Initial actual-model trials found missing image locators, repeated-context token exhaustion, and a prose claim of a card with no tool receipt. The image-only objective now requires tool completion before concise prose; name-only sources go directly to human contact review. Image workspace runs allow 64k cumulative tokens while retaining the existing dollar, duration, turn and tool caps; text remains 32k.
- The final initial-image run completed with a successful Memory tool call, two source-linked proposed items and the same proposal ID in the persisted conversation. Usage: 35,058 input / 2,477 output tokens, provider-reported estimate USD 0.0757309. This one-case result does not establish broad model quality.
- Real browser validation exposed an existing regeneration contract conflict: the JSON consumer received natural-prose instructions. A host-only JSON mode now preserves this consumer's contract; malformed candidates fail before the write transaction instead of becoming an empty delta.
- Actual rebase initially reversed the owner/counterparty source. After tightening WeChat attribution, the final rebase preserved the owner's group introduction and the relative Friday 20:18 event. Human selection, save, reload and scoped recall read back two accepted records in the isolated validation account; both had `time_status=unknown` and `valid_time=null`.
- The original case and two attachments were saved in the private Eval Case Studio under case `12ab1f71-6023-491a-a60d-533cabfe3100`, with human expectation review pending. Committed fixtures are synthetic: nine cases, 26 adversarial samples, plus actual-receipt checks that reject claimed cards without a matching stored tool receipt.
- Independent review found no remaining P0/P1 in this slice. Focused results: agent 45 tests; backend 76 tests; Web 63 tests; Eval eight tests; backend build, Web typecheck and docs checks passed. Database integration passed 72/72 on a separate migrated database.
- Not deployed. PR #235 subsequently merged into main at `6053d69f`. The user requested conflict resolution, PR #237 merge, and fast-forward of the primary local main while preserving its unrelated edits. The manual conflict retains workspace/JSON output behavior plus the new self-memory and service-preference context. The screenshot host test now asserts both self-only bootstrap and the explicit unbound recall arguments. Automatic public-place lookup remains a separate product gap; only a public place fragment was researched manually, never the private transcript or participant names.

- A final actual-model semantic recheck classified both initial and regenerated source/add-friend items as relationship records with correct owner attribution and no fabricated calendar date. Its stage was in-memory, separate from the earlier database/UI proof. The remaining response blemish is an unnecessary payment-exclusion sentence; the private case stays fail/pending, not a golden. Frozen-trial configuration now compares the actual conversation scope.
