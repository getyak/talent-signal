# Conversation run diagnostics and execution deadline

## Outcome and boundary

Diagnose the image-send incident, preserve original bytes/base64 input, associate
background execution and LLM replies with product monitoring, and replace the
unexplained fixed 60-second Claude deadline with a configurable bounded budget.
No private screenshot replay, contact write, or unrelated workspace edits.

## Evidence and decision

See [incident evidence](../docs/evaluations/2026-09-25-conversation-diagnostics/README.md)
and [operational contract](../docs/operations/product-feedback.md).
The failed run has no captured exception; exact historical cause cannot be
recovered. Queue admission/storage worked. Two synthetic live provider probes
passed in about 19 seconds. Keep durable queue semantics and one total deadline;
use 180 seconds provisionally, with stage/usage telemetry for later tuning.

## Milestones

1. Complete: incident readback, deployed chain audit and synthetic provider probes.
2. Complete: safe per-attempt capture, canonical reply correlation, persistence-only
   replay identity, failure metadata lifecycle, configurable deadline and validation.
3. Complete: 110 targeted tests including disposable PostgreSQL integration, backend
   typecheck, docs/architecture checks and independent review.
4. Active: push final revision, check its CI, deliver internal runtime and verify
   real synthetic queue run plus local monitor/Opik destination.

## Review and validation

Independent reviewer checked deadline/cancellation and capture source boundaries.
Closed findings: late provider completion after abort; shared image/Claude budget
regression; failed metadata cleanup; SDK session ID naming; false binding log.
No outstanding P0/P1. Tests cover retry attempts, persistence-only replay, source
revocation, diagnostic outages and failed metadata retention/expiry.
A replay can restore canonical output, not missing original SDK spans.

## Operational state

Worktree: `/Users/cubxxw/data/talent-signal-image-queue-diagnostics`.
PR: https://github.com/getyak/talent-signal/pull/250 (draft).
The affected account was added to the existing Infisical staging backend Opik
policy. Runtime reload/readback remains pending. Existing synthetic Opik transport
probe confirmed write, destination readback and deletion readback with zero models.
An isolated disposable local PostgreSQL container owns test data; remove it after
delivery and preserve concise evidence before removing registered test artifacts.
Pi delegation produced no source edits after a bounded attempt; parent took over.
