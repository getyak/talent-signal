# Independent review brief

Review only artifact `TS-V1-EXPERIENCE-2026-08-25-05` in this directory. Use
your named skill and its complete rubric. Do not inspect, infer, or discuss any
other reviewer's packet or score. Treat the nine screenshots, runtime evidence,
test-result summaries, and only source files whose current SHA-256 matches
`runtime-evidence.json` as the frozen boundary.

If any source hash differs, exclude that source and report the mismatch. The
hash-matched screenshots and xcresult summaries remain runtime evidence. Do not
infer physical-device or field outcomes from Simulator proof.

The decision is a local Simulator/loopback release gate for corrected Today,
conversation-first Ask, canonical search, exact cited evidence, source dispute,
active-action reconciliation, periodic stale-answer detection, continuous
retention expiry, interrupted-question recovery, protected Session resume,
Capture, and Apple account entry/logout. It is not a production App Store,
physical accessibility, physical Apple Account, or field-outcome gate.

Return one specialist JSON object matching
`.agents/skills/product-adjudicator/references/review-contract.md` exactly:
`reviewer`, `lens`, `verdict`, `score`, `confidence`, `findings`, `strengths`,
`missing_evidence`, `vetoes`, and `open_questions`. Use only an integer 0–4
score under your own skill rubric; do not create a percentage or average. Every
finding must include all required fields and a reproducible locator. Abstain
where evidence is insufficient, and issue a veto only under the named skill's
veto rules.

Independently verify whether the V4 findings listed in `artifact.md` are closed.
Do not treat the two explicit known open product findings or missing-evidence
items as implemented behavior.
