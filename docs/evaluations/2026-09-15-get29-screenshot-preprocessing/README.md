# GET-29 screenshot preprocessing acceptance

## Boundary

New Web, iOS, and browser screenshot-contact tasks enter the same backend route
and must complete `screenshot-preprocess.v1` before downstream Agent work. The
legacy recruiter-reviewed text workflow is not rewritten by this slice.

## Requirement to evidence

| Requirement | Implementation evidence | Verification |
| --- | --- | --- |
| Direct image understanding; no OCR pre-pass | `ArkScreenshotPreprocessor`; iOS reviewed capture and shortcut inbox use `preprocess_only`; former Vision recognizer removed | Agent unit test inspects the pinned request; synthetic live Ark receipt; iOS build and relationship-capture tests |
| Clear, bounded preparation | EXIF-oriented native WebP or overview plus overlapping 1,400 px tiles | Prepared-view unit tests cover ordinary and long screenshots |
| Common fields | `screenshot-preprocess.v1` stores platform, conversation kind, participants, messages, identity clues, uncertainty and follow-up regions | Zod contract and provider-response tests |
| Cost/retry observability | Per-image Ark request IDs and token usage are checkpointed before downstream work; an unknown response can repeat only after explicit resume | Backend integration tests check packet, redaction, checkpoint reuse and the audited retry authorization |
| Original screenshot visibility | Product Run context keeps authenticated canonical image links and adds the structured packet | Web preview test and typecheck |
| Minimize repeat image exposure | Claude receives no original when no follow-up is required; otherwise only flagged source indices are attached, exact regions require pixel receipts, and field-level corrections are host-merged into the preprocessing baseline. Plain Chat Completions providers cannot produce those receipts, so they preserve the baseline and abstain without another image disclosure | Claude adapter and correction-boundary unit tests plus PostgreSQL two-image correction and default-provider abstention tests |
| iOS shared path without automatic writes | Manual review and shortcut inbox request `preprocess_only`; the task returns an unconfirmed draft but cannot call contact, capture or research tools. A later recruiter Retry resumes a failed task at its exact revision; unresolved source fields remain visible instead of being silently completed | iOS client tests, 35 relationship-capture tests, 53 standalone-onboarding tests, backend no-write integration assertion |
| Legacy image OCR removed | Share Extension and standalone image import no longer run or consume Vision OCR text; recruiter notes remain separate input | Source boundary search, iOS build and standalone-onboarding regression test |
| Retention and deletion | No second image store; prepared bytes are ephemeral; existing seven-day canonical source lifecycle remains authoritative | Existing contact-image expiry/deletion integration suite |

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

Additional local acceptance ran the PostgreSQL-backed integration suite (32/32),
`RelationshipCaptureTests` (35/35), and `StandaloneOnboardingTests` (53/53).
