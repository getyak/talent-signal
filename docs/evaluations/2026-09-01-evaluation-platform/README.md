# Evaluation platform evidence

This directory contains synthetic, content-addressed evidence for the evaluation-first platform. Local manifests and local gate results are authoritative. Opik is an optional, owner-controlled projection used for experiment comparison and observability; its availability or score display cannot change a P0 gate.

## Real Opik smoke proof

[`opik-integration-proof.json`](opik-integration-proof.json) records a real Opik 2.2.45 / TypeScript SDK 2.2.45 run, not a mock transport:

- the 12-item synthetic P0 dataset was created and then synchronized again as a no-op with the same dataset and DatasetVersion IDs;
- AgentDefinition `1.0.0` and `2.0.0` each projected trial 3 of `TS-TRJ-005` into distinct experiments pinned to that same DatasetVersion;
- deterministic safety passed for both attempts, while both authoritative local gates remained `needs_review` because required human-workflow evidence is absent;
- each trace, terminal state, thirteen content-addressed spans, and ten atomic deterministic feedback scores were read back from Opik;
- replaying v1 reused the run, manifest, local artifact, idempotency key, trace, and experiment item, with 13 unique content-addressed span identities and 10 unique scores rather than logical duplicates;
- v2 deletion removed both the trace and its experiment-item link; the receipt truthfully limits its scope to `trace_projection` and lists the retained dataset, experiment, and immutable local authority;
- replay of the already-deleted trial 1 identity was rejected without changing local authority; a new trial succeeded because trial identity is now part of the Opik Experiment identity;
- only allowlisted synthetic identities, digests, terminal metadata, safe trace events, and atomic non-aggregate scores were projected.

The single Opik smoke scenario proves interoperability, identity, and lifecycle behavior. It does not replace the complete local P0 suite or claim that AgentDefinition `2.0.0` is better than `1.0.0`.

The first corrective projection exposed a JSON Pointer that the export scanner
mistook for a filesystem path. The failed ledger event, unchanged local
artifact, retry, and eventual success are retained as recovery evidence. The
fix validates artifact-relative JSON Pointers separately while keeping path
rejection active for every other projected field.

## Evidence layout

- `opik-final-v1-r5/`, `opik-final-v2-r5/` — immutable local run artifacts for the final v1/v2 trial-3 proofs, including the evaluation source-tree fingerprint.
- `projection-ledger-final-v1-r5/`, `projection-ledger-final-v2-r5/` — append-only final projection, retry, and scoped-deletion evidence.
- `projection-ledger-final-v2-r2/` — preserved evidence that a deleted trial-1 projection identity cannot be resurrected.
- `opik-corrective-v1/`, `projection-ledger-corrective-v1/` — the preserved safe-export failure and successful recovery.
- `opik-integration-proof.round-1.json` and `independent-reviews/` — the frozen pre-correction proof and first independent review round; these are not rewritten.

The twelve P0 cases currently report 12 deterministic-safety passes and 12
release-readiness `needs_review` results. That is intentional: independent LLM
review and an engineering scorecard are not substitutes for named recruiter
workflow evidence or atomic human gold.

## Final adjudication

[`engineering-integration-scorecard.json`](engineering-integration-scorecard.json)
records a 95/100 engineering-integration assessment. It is a sum of explicit
engineering dimensions, not an average of specialist scores and not a release
approval. Five points remain withheld: three for absent named human-workflow
gold/calibration evidence and two because the exact physical ClickHouse retry
row count lacks a retained raw query artifact.

[`product-panel.json`](product-panel.json) embeds the four contract-valid final
independent reviews. The panel verdict is `pass_with_changes`, no safety veto is
active, and the release gate remains `needs_evidence`. Selection science owns
that release decision: all 12 P0 cases remain unreviewed until authorized,
criterion-level human adjudications exist.

All content is synthetic. No candidate conversation, screenshot, attachment, oracle, or raw tool payload is present in this evidence set.

Opik's ClickHouse span table uses `ReplacingMergeTree`. A retry therefore may
temporarily leave multiple physical upsert rows with the same span ID before a
merge, while the logical read model contains 13 unique span identities. The
proof reports both the 13 logical identities and the observed 26 physical rows
after one retry; it does not mislabel storage-version rows as new spans. The
raw query output behind the physical-row observation was not retained before
the task-owned stack was removed, so the panel treats the exact count as an
unverified historical observation and deducts it from the engineering score.

After the readback evidence was frozen, the task-owned local Opik containers,
volumes, and network were removed. The temporary Opik source clone was moved
to the user's Trash. No unrelated Docker project was touched.
