# Multi-image conversation intake and source storage

## Outcome and boundary

Send up to ten ordered screenshots through Web and iOS as one contact task,
remove routine explanatory notices, and persist original task inputs in the
existing private S3-compatible storage boundary. Preserve legacy single-image
requests, task idempotency, source provenance, scoped access, and deletion.
No candidate-facing effects or new cloud bucket are requested. The follow-up
explicitly authorizes PR merge and TestFlight publication. Existing unrelated
uncommitted work is preserved in the original development directory.

## Evidence and direction

The iOS picker already accepts ten images but unscoped routing rejects batches.
The contact-agent Web UI, API, and extraction runner accept one image only and
discard its bytes. The backend already implements local and private encrypted
S3 object storage. Reuse that adapter, store ordered manifests outside model
state, checkpoint per-image extraction, and recover from stored sources.
Never silently merge differing visible contact identities or discard images.

## Milestones

1. Complete: bounded request contract, durable object lifecycle, extraction and
   message-to-image provenance, retry and deletion tests.
2. Complete: Web multi-selection/preview/removal and native multi-image Send;
   quiet routine states, actionable errors, source inspection.
3. Complete: focused tests, browser/native verification, local backend redeploy,
   concise canonical documentation and handoff of actual proof/limitations.

## Completion evidence

Database-backed batch/replay/recovery/access/expiry tests; storage failure and
S3 adapter checks; rendered Web upload/send/readback; native build and routing
checks; backend/Web typechecks and targeted lint; documentation check; deployed
backend health and source verification. Live S3 is claimed only if a configured
bucket is exercised; local storage proof is labeled separately.

## Completion

The [evaluation record](../docs/evaluations/2026-09-06-multi-image-contact/README.md)
contains browser, provider, database, native-test, and deployment evidence.
The real two-image task recovered from provider 429 using stored originals,
then reused the contact and stored six source-linked messages. Ten-image
encoding and limits passed deterministic checks. The original source endpoints
returned hash-matching bytes. The local backend is deployed; live S3 remains
unconfigured and no new native TestFlight binary was published. These are
environment/release boundaries, not claims of completed cloud/native rollout.
The broader secret-inventory scan has pre-existing ownership gaps, recorded in
the evaluation; all required in-scope checks and the production Web build pass.

## Authorized release follow-up

- Complete: port the bounded change onto current main in the isolated
  `codex/multi-image-contact-release` worktree. Preserve newer fullscreen
  sessions, retrieval, prompt independence, and proposed-source scope.
- Active: verify the integrated revision, create PR, satisfy CI/Security,
  and merge without bypassing required checks.
- Pending: deploy the merged backend and wait for the automatic iOS release.
  Completion requires the automation-owned receipt after Apple processing,
  bound to the merged commit, version, and build.

The preceding evaluation describes the original development surface; it is not
proof that the subsequently integrated/released revision has passed its gates.

Integrated checks: 17 PostgreSQL/storage/merge checks pass; Web and backend
TypeScript checks pass; localization is within its existing budget, new copy
uses the string catalog. Documentation and all 18 secret-contract tests pass.
The new migration is now the backend readiness check; its assertion is updated.
