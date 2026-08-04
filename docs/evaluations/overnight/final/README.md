# Overnight final evidence directory

## Completed run

The frozen integration at
`1c9c3f0f2866b2d4c3651d422f5d886dd796c996` is **blocked**, not passed.
Backend, authenticated Web, iOS, and the repository-local installed plugin copy
share the same synthetic TS-CORE-01 source and semantic state. The active
evidence-safety veto is `XS-CAPTURE-01`: the authorized Chrome control surface
could not load the unpacked extension or prove the real activeTab/selected-text
permission, pre-Submit silence, and extension-originated receipt.

Start with:

- [`summary.md`](summary.md) for the concise human result and three remaining
  issues;
- [`run-manifest.json`](run-manifest.json) for machine-readable pass/fail
  assertions;
- [`panel.json`](panel.json) for the validated five-lens adjudication;
- [`integration-freeze.json`](integration-freeze.json) for the exact base delta
  and reviewed-to-integrated commit provenance;
- [`artifact-index.json`](artifact-index.json) for frozen evidence digests;
- [`verifier.log`](verifier.log) for the expected four-condition hard-gate
  failure.

This directory is the fan-in point for the frozen six-object localhost review.
It contains evaluation evidence only. Surface owners keep their own recordings,
screenshots, logs, and manifests in their assigned `overnight/<surface>/`
directories.

Examples under `evals/examples/` are contract tests and never count as release
evidence.

## Required files

| File | Purpose |
| --- | --- |
| `run-manifest.json` | Integrated manifest for the accepted commit set, commands, artifacts, assertions, and data boundary |
| `artifact-index.json` | Accepted result commits and all artifact locators/digests |
| `TS-CORE-01-state-parity.json` | Exact backend/Web/iOS confirmed-state comparison |
| `TS-CORE-01-approval-separation.json` | Distinct fact-confirmation and action-approval events |
| `TS-CORE-01-effect-readback.json` | Two idempotent attempts, one local object, and observed readback |
| `TS-CORE-01-recovery-matrix.json` | Offline, timeout, revocation, deletion, and cross-account denial |
| `web-browser-craft-review.json` | Twelve independent 0–100 craft dimensions and independent journey score |
| `review-<reviewer>.json` | One independent 0–4 specialist packet per selected reviewer |
| `panel.json` | Product-adjudicator result with active veto resolution and at most three top findings |
| `summary.md` | Short human handoff matching the panel verdict |

Do not create an empty result file or copy an example merely to satisfy the
index. Missing evidence stays missing and is recorded as an exact gap.

The integrated manifest includes all eight `core_case_results`; every one must
pass with a real evidence locator and the frozen disposition. It also includes
all nine cross-surface assertion results.

## Machine-readable trace shapes

All four `TS-CORE-01` files use:

```json
{
  "trace_id": "TS-CORE-01-localhost"
}
```

### State parity

`TS-CORE-01-state-parity.json` has:

```json
{
  "trace_id": "TS-CORE-01-localhost",
  "sources": {
    "backend": {
      "account_id": "account-a",
      "episode_id": "string",
      "assignment_id": "string",
      "confirmed_state_id": "string",
      "confirmed_state_version": "string-or-number",
      "assertions": [
        {
          "field": "string",
          "value": "string",
          "status": "confirmed",
          "evidence_message_id": "m1"
        }
      ]
    },
    "web": {},
    "ios": {}
  },
  "proposed_and_confirmed_visibly_distinct": true
}
```

`web` and `ios` repeat the complete backend shape. The validator sorts
assertions by field and requires exact equality plus four `TS-CORE-01`
assertions.

### Approval separation

`TS-CORE-01-approval-separation.json` has:

```json
{
  "trace_id": "TS-CORE-01-localhost",
  "fact_confirmation": {
    "event_id": "string",
    "scope": "fact_confirmation"
  },
  "action_approval": {
    "event_id": "different-string",
    "scope": "action_approval",
    "proposal_version": "string",
    "target": "string",
    "effect": "string"
  },
  "effect_count_after_fact_confirmation": 0,
  "action_proposal_status_after_fact_confirmation": "unapproved",
  "confirmed_facts_intact_after_action_decline": true
}
```

### Effect readback

`TS-CORE-01-effect-readback.json` has:

```json
{
  "trace_id": "TS-CORE-01-localhost",
  "idempotency_key": "string",
  "attempts": [
    {
      "idempotency_key": "same-string",
      "external_object_id": "local-object-id"
    },
    {
      "idempotency_key": "same-string",
      "external_object_id": "local-object-id"
    }
  ],
  "destination_objects": [
    {
      "external_object_id": "local-object-id"
    }
  ],
  "observed_readback": {
    "external_object_id": "local-object-id",
    "matches_approved_effect": true
  },
  "ui_result_status": "verified"
}
```

### Recovery matrix

`TS-CORE-01-recovery-matrix.json` has exactly five variants:

```json
{
  "trace_id": "TS-CORE-01-localhost",
  "variants": [
    {
      "id": "offline",
      "status": "pass",
      "false_success": false,
      "duplicate_effect": false,
      "state_disposition": "string",
      "evidence_locators": [
        "docs/evaluations/overnight/..."
      ]
    }
  ]
}
```

The required IDs are `offline`, `timeout_after_effect`,
`permission_revocation`, `deletion_cascade`, and `cross_account_denial`.

## Final validation

From the repository root:

```sh
pnpm eval:core
node scripts/evals/validate-candidate-momentum.mjs \
  --manifest docs/evaluations/overnight/final/run-manifest.json \
  --craft-review docs/evaluations/overnight/final/web-browser-craft-review.json
node scripts/evals/verify-localhost-journey.mjs \
  docs/evaluations/overnight/final/run-manifest.json
python3 .agents/skills/product-adjudicator/scripts/validate_review.py \
  docs/evaluations/overnight/final/panel.json
pnpm docs:check
```

The final summary may name no more than three findings. Each finding must name
the exact gap, evidence, owner, next step, and pass condition.
