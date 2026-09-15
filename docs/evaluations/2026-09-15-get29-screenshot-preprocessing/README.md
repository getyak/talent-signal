# GET-29 screenshot preprocessing acceptance

## Boundary

New Web, iOS, and browser screenshot-contact tasks enter the same backend route
and must complete `screenshot-preprocess.v2` before downstream Agent work. The
legacy recruiter-reviewed text workflow is not rewritten by this slice.

## Requirement to evidence

| Requirement | Implementation evidence | Verification |
| --- | --- | --- |
| Direct image understanding; no OCR pre-pass | `ArkScreenshotPreprocessor`; iOS reviewed capture and shortcut inbox use `preprocess_only`; former Vision recognizer removed | Agent unit test inspects the pinned request; synthetic live Ark receipt; iOS build and relationship-capture tests |
| Clear, bounded preparation | EXIF-oriented native WebP or overview plus overlapping 1,400 px tiles | Prepared-view unit tests cover ordinary and long screenshots |
| Common fields | `screenshot-preprocess.v2` stores platform, conversation kind, participants, messages, identity clues, uncertainty and target-bound follow-up regions | Zod contract and provider-response tests |
| Cost/retry observability | Per-image Ark request IDs and token usage are checkpointed before downstream work; provider output is schema-validated inside the Product Run step so an invalid private response is recorded only as a failed, redacted span; an unknown response can repeat only after explicit resume | Agent and backend tests check failed-span redaction, packet, checkpoint reuse and the audited retry authorization |
| Original screenshot visibility | Product Run context keeps authenticated canonical image links and adds the structured packet | Web preview test and typecheck |
| Minimize repeat image exposure | Claude receives no original when no follow-up is required; otherwise only flagged source indices are attached, exact regions require pixel receipts, and field-level corrections are host-merged into the preprocessing baseline. Each correction receipt must match the declared image, field, region, stable baseline target and exact uncertainty index; a speaker-side write must also match the receipt's explicit side. An uncertainty can clear only when the retained target value matches that bound receipt, so a clear but different reading cannot preserve the guessed baseline. The packet and receipts share one aggregate 24-region limit, enforced before each part is checkpointed; the SDK budget reserves a twenty-fifth call for the correction commit. Plain Chat Completions providers cannot produce those receipts, so they preserve the baseline and abstain without another image disclosure | Claude adapter and correction-boundary unit tests plus PostgreSQL two-image budget recovery, correction and default-provider abstention tests |
| iOS shared path without automatic writes | Manual review and shortcut inbox request `preprocess_only`; the task returns an unconfirmed draft but cannot call contact, capture or research tools. Real HEIC orientation, generic image types, oversized dimensions, and genuine payloads above the backend limit are decoded, normalized, resized to at most 4,096 px, and JPEG-compressed to at most 10 MB for upload while the local original remains unchanged. Each saved fragment retains its preprocessing message ID, source image, visible speaker label/side and visible time without confirming attribution. Generic platform handles remain untyped and cannot auto-bind. The task ID and current revision are protected locally immediately after create, resume and every successful poll, before extraction completion; a later polling or cleanup failure therefore remains retryable and removal must scrub that retained preprocessing copy first. A completed profile or non-chat result with neither messages nor unresolved checks deletes its exact server task with readback, then fails closed instead of becoming synthetic messages; any readable draft with a remaining preprocessing uncertainty is blocked before background filing, while a waiting zero-message result persists its receipt, question and bounded regions without creating a capture, so Retry or explicit discard remains possible. A later recruiter Retry resumes a failed or waiting task at its exact revision; unresolved bounded-read indices remain retryable, and the waiting question and source regions remain visible even when the extraction has no uncertainty text. The preprocessing wire timestamp is truncated to the inbox's persisted second precision so a response-loss retry after app restart retains the identical idempotency request body | iOS client tests, 50 relationship-capture tests, 53 standalone-onboarding tests, backend no-write and retry integration assertions |
| Legacy image OCR removed | Share Extension and standalone image import no longer run or consume Vision OCR text; recruiter notes remain separate input | Source boundary search, iOS build and standalone-onboarding regression test |
| Retention and deletion | No second image store; prepared bytes are ephemeral; existing task and canonical-source retention policies remain authoritative. In the foreground review flow, iOS persists the canonical capture, links the preprocessing task to its exact capture/resource before identity or change review, and reconciles link response loss after restart; discard or completed filing uses a dedicated exact-revision endpoint that scrubs only the preprocessing copy before removing its local source, without deleting the linked canonical capture or its derived review. Background auto-filing proves the same shared iOS seed through both operation receipts, checks active relationship and authorization state before linking, and requires the same server-copy deletion before marking the Session read or removing the local inbox source; a failed or response-lost cleanup retains recoverable state and retries the same linked revision without repeating capture creation or linking. Canonical message locators retain the structured source-image index, visible speaker label/side and visible time alongside the stable source message ID. Later capture deletion still scrubs any linked task and synchronously purges its stored original across the governed descendant resource tree; full task deletion retains its explicit capture-deletion semantics | PostgreSQL phase-failure/retry, seed/auth linkage, preprocessing-copy-only deletion, descendant deletion, and target permanent-purge integration tests plus iOS foreground/background link, discard, completion, cleanup-failure, and response-loss recovery tests |

## Provider contract

The first release pins `doubao-seed-2-0-lite-260215` at the Volcano Ark Beijing
Chat Completions endpoint, disables thinking, requests non-storage where the API
accepts the field, uses strict JSON, and rejects provider model drift. Ark also
documents a Files API for reusable uploads, but this release intentionally uses
one stateless inline request per source image: the same image is not reused
across provider turns, so creating a longer-lived file object would expand the
retention and deletion proof surface without reducing calls.

Official references:

- [Volcano Ark model getting started](https://www.volcengine.com/docs/82379/1795150)
- [Volcano Ark Chat API](https://www.volcengine.com/docs/82379/1494384)
- [Volcano Ark Files API overview](https://www.volcengine.com/docs/82379/1885708?lang=zh)
- [Volcano Ark response storage field](https://www.volcengine.com/docs/6492/2241840?lang=zh)

The sanitized [live provider probe](live-provider-probe.json) records a
synthetic-only request accepted by the pinned endpoint with thinking disabled
and storage disabled. The receipt deliberately retains neither pixels nor
extracted message text.

Correction resolution intentionally stays conservative where the target schema
cannot distinguish composite subfields: speaker uncertainty requires both an
explicit side and an exact visible label, while identity-clue uncertainty
requires exact retained value and excerpt support. Unsupported combinations
remain visible for human review instead of being auto-cleared.

## Commands

```sh
pnpm --filter @talent-signal/agent test
pnpm --filter @talent-signal/agent typecheck
pnpm --filter @talent-signal/backend test -- src/modules/screenshotContactTasks.test.ts src/modules/screenshotContactTasks.integration.test.ts
pnpm --filter @talent-signal/backend typecheck
pnpm --filter @talent-signal/web test -- components/product-run-monitor.test.ts
pnpm --filter @talent-signal/web typecheck
pnpm docs:check
```

Additional local acceptance ran the PostgreSQL-backed integration suite (40/40),
`RelationshipCaptureTests` (55/55), and `StandaloneOnboardingTests` (53/53).
