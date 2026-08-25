# Independent review brief

Review only artifact `TS-V1-EXPERIENCE-2026-08-25-04` in this directory. Use
your named skill and its complete rubric. Do not inspect, infer, or discuss any
other reviewer's packet or score. Treat the nine screenshots, runtime evidence,
source files whose current SHA-256 matches `runtime-evidence.json`, executable
test code, and explicit missing-evidence list as the frozen boundary.

`CandidateSignalUITests.swift` is explicitly excluded because an unrelated
concurrent workspace task changed that untracked file after the result bundle
and screenshots were frozen. Do not inspect it or treat its current contents as
the compiled UI test source. Use the xcresult summary and hashed screenshots for
the six selected journeys.

The decision is a local Simulator/loopback release gate for corrected Today,
conversation-first Ask, canonical search, exact cited evidence, source
rejection, interrupted-question recovery, protected Session resume, Capture,
and Apple account entry/logout. It is not a production App Store, physical
device accessibility, physical Apple Account, or field-outcome gate.

Return one specialist JSON object matching
`.agents/skills/product-adjudicator/references/review-contract.md` exactly:
`reviewer`, `lens`, `verdict`, `score`, `confidence`, `findings`, `strengths`,
`missing_evidence`, `vetoes`, and `open_questions`. Use only an integer 0–4
score under your own skill rubric; do not create a percentage or average.
Every finding must include all required fields and a reproducible locator.
Abstain where evidence is insufficient, and issue a veto only under the named
skill's veto rules.

Pay special attention to whether the V3 findings listed in `artifact.md` are
actually closed. If a current source hash differs from the frozen hash, do not
use that source as evidence and report the mismatch.
