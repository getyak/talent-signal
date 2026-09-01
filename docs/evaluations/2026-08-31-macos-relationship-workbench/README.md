# macOS Relationship Workbench evaluation contract

This directory defines proof required for the proposed macOS PRD. It does not
claim that a product build exists or passes unless the frozen artifact ledger,
independent review packets, and validator output all agree. The historical
scaffold for this directory started `unfrozen`. RC3 through RC7 are historical;
RC8 build 6 is the historical candidate that exposed the no-action continuity
and relaunch-recovery blockers. RC9 build 7 is the active frozen candidate and
has a deterministic `release_pass` in
[`validation-result.rc9-final.json`](validation-result.rc9-final.json). The release decision
must be judged from the artifact ledger, review packets, and validator result,
not from this README alone.

## Active frozen decision

- Artifact: `TS-MACOS-RELATIONSHIP-WORKBENCH` version `0.1.0`, build `7`.
- Universal unsigned local verification archive SHA-256:
  `2c6722462fba3b39faeaa3478c18b46f2e5241813e480234dcb5d806652a9cba`.
- Exact frozen source archive SHA-256:
  `ade636a3dca22af7ab366df9cda78a206fc8f57ad683a7a55e9f7e73c030d37f`.
- Validator category scores: product `100`, user experience `100`, technical
  `100`; all four independent review packets pass and all five veto audits are
  clear.
- Independent reviewer scores recorded inside their packets are product `100`,
  user experience `100`, and technical `95`.

## Decision rule

The validator reports three separate constructs:

- `product_experience`: recruiter usefulness and integrity of the relationship
  loop;
- `user_experience`: comprehension, interaction craft, accessibility, trust,
  relaunch, and deletion experience;
- `technical_experience`: lifecycle, canonical state, typed boundaries,
  recovery, idempotency, and observability.

Each score must be at least 95. The validator emits no overall score and never
averages categories. A release also requires:

- every release-gate requirement to have effective status `pass`;
- every named scenario to have effective status `pass`;
- separate passing review packets from the three experience reviewers plus the
  gate auditor;
- `clear` audits for safety, privacy, identity, external effects, and
  accessibility.

An `active` or `unproven` veto blocks release even at 100/100/100. A declared
pass with a missing, empty, outside-repository, or SHA-mismatched evidence file
is downgraded to `unproven` and earns zero points.

## Files

- [`requirement-manifest.v1.json`](requirement-manifest.v1.json) owns the
  versioned scoring rubric, atomic requirements, evidence classes, veto
  contracts, reviewer jurisdictions, and required scenarios.
- [`artifact-manifest.v1.json`](artifact-manifest.v1.json) is the active frozen
  artifact ledger. Historical evidence remains direct proof only of the build
  that produced it; RC9 may cite older native interaction media only through a
  scoped source-delta audit and must add direct RC9 proof for every changed or
  previously unproven boundary.
- [`../../../scripts/evals/validate-macos-relationship-workbench.mjs`](../../../scripts/evals/validate-macos-relationship-workbench.mjs)
  validates the contract and computes the decision deterministically.

The scenario gate includes `TS-CORE-01/02/03/06`, `TS-ID-01/04`,
`TS-ACT-01/03/04`, and `TS-BOUND-01`, plus desktop scenarios for keyboard,
VoiceOver, reduced motion, relaunch, and deletion/TTL readback.

## Freeze and evidence procedure

1. Freeze one build: artifact ID, semantic version, build number, commit,
   artifact SHA-256, exact environment, and target user. Reviews of different
   builds cannot be combined.
2. Put every cited proof in a real repository file. Inventory it with a unique
   ID, evidence kind, repository-relative path, SHA-256, and description.
3. Record one result per requirement and scenario. Use `unproven` when the
   required runtime, screenshot, recording, accessibility trace, test output,
   source span, field study, or review packet is absent.
4. Run the product, user, and technical reviewers independently against the
   same frozen identity. Their reviewer IDs must be distinct. Run the
   evidence-safety gate audit without exposing prior reviewer verdicts.
5. Add each review packet to the frozen evidence inventory. A packet uses this
   minimum shape:

```json
{
  "contract_version": "ts-macos-independent-review.v1",
  "artifact": {
    "id": "the frozen artifact id",
    "version": "the frozen artifact version",
    "sha256": "the frozen artifact sha256"
  },
  "requirements_manifest": {
    "id": "TS-MACOS-RELATIONSHIP-WORKBENCH-REQUIREMENTS",
    "version": 1
  },
  "category": "product_experience",
  "reviewer_id": "one independent agent id",
  "verdict": "pass",
  "reviewed_requirement_ids": ["MAC-PX-001"],
  "veto_categories": [],
  "evidence_ids": ["frozen-runtime-proof"]
}
```

The gate-audit packet uses category `gate_audit`, covers every release-gate
requirement, and lists all five `veto_categories`. Review packets may describe
findings and disagreements with extra fields; the validator ignores scores
inside packets because only the requirement ledger computes scores.

## CLI

From the repository root:

```bash
node scripts/evals/validate-macos-relationship-workbench.mjs \
  --requirements docs/evaluations/2026-08-31-macos-relationship-workbench/requirement-manifest.v1.json \
  --artifact docs/evaluations/2026-08-31-macos-relationship-workbench/artifact-manifest.v1.json
```

Use `--output path/to/result.json` to preserve a deterministic report and
`--root path/to/repository` when invoked elsewhere. Exit code `0` means release
pass, `1` means the contract or invocation is invalid, and `2` means the build
is blocked or still unproven. Do not infer the expected exit code from this
document; read the current frozen manifest and validator result.

Run the validator regression tests with:

```bash
node --test scripts/evals/validate-macos-relationship-workbench.test.mjs
```
