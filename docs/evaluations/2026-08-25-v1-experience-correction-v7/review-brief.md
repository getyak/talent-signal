# Independent review brief

Review only artifact `TS-V1-EXPERIENCE-2026-08-25-07` in this directory. Use
your named skill and its complete rubric. Do not inspect, infer, or discuss any
other reviewer's packet or score. Treat the nine screenshots, runtime evidence,
result summaries, and only source files whose current SHA-256 matches
`runtime-evidence.json` as the frozen boundary.

If any source hash differs, exclude it and report the mismatch. The UITest source
is explicitly excluded because another task changed it concurrently; use the
preserved result summaries and hash-matched screenshots as runtime proof. Do not
infer physical-device or field outcomes from Simulator evidence.

The decision is a local Simulator/loopback release gate for corrected Today,
conversation-first Ask, canonical search, exact cited evidence, durable source
review recovery, append-only re-review, exact Ask-to-Pursuit handoff, protected
Session resume, Capture, and Apple account entry/logout. It is not a production,
physical accessibility, physical Apple Account, or field-outcome gate.

Independently verify whether the shared V6 findings are closed: a review outcome
must be visible and safely retryable after response loss/relaunch; a mistakenly
disputed source must have an append-only re-review path without making the old
answer current; and an existing action must open the exact Pursuit without
recording a change. Re-check that the V5 detached-citation veto remains closed.

Return one specialist JSON object matching
`.agents/skills/product-adjudicator/references/review-contract.md` exactly:
`reviewer`, `lens`, `verdict`, `score`, `confidence`, `findings`, `strengths`,
`missing_evidence`, `vetoes`, and `open_questions`. Score only 0–4 under your
own rubric; do not create a percentage or average. Every finding requires all
fields and a reproducible locator. Abstain where evidence is insufficient, and
issue a veto only under the named skill's rules.

Do not treat explicit missing-evidence items as implemented behavior. Do not
count the state-contaminated diagnostic as a product failure; verify its stated
cause and the fresh isolated rerun instead.
