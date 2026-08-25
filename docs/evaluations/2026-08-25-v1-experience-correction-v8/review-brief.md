# Independent review brief

Review only artifact `TS-V1-EXPERIENCE-2026-08-25-08` in this directory. Use
your named skill and its complete rubric. Do not inspect, infer, or discuss any
other reviewer's packet or score. Treat the nine screenshots, runtime evidence,
result summaries, and only source files whose current SHA-256 matches
`runtime-evidence.json` as the frozen boundary.

If any source hash differs, exclude it and report the mismatch. The UITest
source and two capture scripts are explicitly excluded because another task
changed them concurrently; use the preserved xcresult summaries and
hash-matched screenshots as runtime proof. Do not infer physical-device or field
outcomes from Simulator evidence.

The decision is a local Simulator/loopback release gate for corrected Today,
conversation-first Ask, canonical search, exact cited evidence, fail-closed
review preparation, authority-bound idempotency, protected review recovery,
append-only audit, exact Ask-to-Pursuit handoff, protected Session resume,
Capture, and Apple account entry/logout. It is not a production, physical
accessibility, physical Apple Account, or field-outcome gate.

Independently verify the V7 veto resolutions. First, a protected persistence
failure must prevent request I/O and prevent the UI from presenting a canonical
review as saved. Second, an idempotency key must bind the exact canonical
`last_review_id`, so a later same-reason rejection after re-review cannot replay
an earlier operation. Also verify that all local review operations remain
auditable without making the default Ask surface dense. Re-check that the V5
detached-citation veto remains closed, a re-reviewed source does not make the old
answer current, and `Open Pursuit` creates no work.

Return one specialist JSON object matching
`.agents/skills/product-adjudicator/references/review-contract.md` exactly:
`reviewer`, `lens`, `verdict`, `score`, `confidence`, `findings`, `strengths`,
`missing_evidence`, `vetoes`, and `open_questions`. Score only 0–4 under your
own rubric; do not create a percentage or average. Every finding requires all
fields and a reproducible locator. Abstain where evidence is insufficient, and
issue a veto only under the named skill's rules.

Do not treat explicit missing-evidence items as implemented behavior. A code
change alone does not resolve a veto; require the matching source, executable
test, and runtime boundary stated in `runtime-evidence.json`.
