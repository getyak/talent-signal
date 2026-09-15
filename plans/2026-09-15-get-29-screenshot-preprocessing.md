# GET-29: provider-pinned screenshot preprocessing

## Outcome

The Web/iOS/browser screenshot contact path runs one provider-pinned,
direct-image-understanding preprocessing call per original source image before
any downstream Agent work. The call understands images without OCR, produces a
bounded structured packet (participants, ordered exact text, identity clues,
uncertainty, original-coordinate regions requiring later multimodal reading),
and never becomes a candidate score or an authority. Preprocessing is required
when image contact processing is enabled and fails closed without
`ARK_API_KEY` or the sensitive-processing gate. Claude SDK mode stops
re-sending original images when preprocessing marks no original multimodal
follow-up; when follow-up is required, only flagged source images are exposed,
their exact regions require fresh pixel receipts, and corrected extraction
fields are applied as bounded host-side patches to the initial packet before
filing is authorized. Unchanged messages and clues cannot be dropped or
rewritten. Unresolved reads abstain for human review.

## Why it matters

Cloud screenshot processing is the product's highest-risk data path. Pinning the
model, disabling thinking, enforcing a strict JSON contract, and checkpointing
each billed call makes the path auditable, retry-safe, and cost-bounded while
keeping the recruiter's review boundary intact.

## In scope

- `screenshot-preprocess.v2` shared contract in `apps/agent`.
- Volcano Ark Doubao-Seed-2.0-lite preprocessor: one stateless Chat API request
  per original image at the Beijing endpoint, `thinking.type=disabled`, strict
  JSON, provider/model/schema mismatch rejection, caller cancellation, and a
  bounded response size.
- EXIF-oriented legible WebP prepared views with sharp: native clarity for
  ordinary screenshots; overlapping bounded tiles plus an overview for
  long/wide screenshots. Derived views stay ephemeral.
- Backend integration in `screenshotContactTasks`: run from the canonical
  stored original, checkpoint each source result, persist the bounded packet,
  capture a sanitized product-run span (no raw bytes/data URLs), derive the
  existing `ContactChatExtraction` proposal, and pass the packet downstream.
- ARK + pinned preprocessor env/config wiring (compose, testflight example,
  Infisical `testflightBackend` contract).
- Authenticated product-run monitor shows the structured packet beside the
  already-secured original links, still redacting `data_base64`/data URLs.
- Route iOS reviewed capture and shortcut inbox through shared `preprocess_only`
  tasks; make recruiter Retry use audited task resume; surface unresolved source
  fields; remove Share Extension/local Vision OCR and ignore legacy image OCR text.

## Out of scope

- Rewriting the Web `TextContactTaskRequest` flow. It stays intact and
  unchanged. The iOS manual screenshot review keeps its governed save flow but
  now obtains the initial draft from a non-filing `preprocess_only` task.
- Any candidate score, personality, protected trait, hiring probability, fact
  confirmation, identity binding, or action authority.
- A second raw-image store; existing secure task image readback and
  deletion/expiry behavior is reused.
- Chat retention claims. Ark Responses `store:false` semantics are documented as
  API-session storage only, not proof of training/log retention.

## Chosen approach

1. `screenshotPreprocess.ts` defines `screenshot-preprocess.v2` zod schemas and
   the `ScreenshotPreprocessor` interface;
   `arkScreenshotPreprocessor.ts` implements it. Provider/model are pinned
   constants; the endpoint is a fixed Beijing Ark URL.
2. `screenshotPreparedViews.ts` renders ephemeral WebP views from the canonical
   bytes: a native-clarity view for ordinary images, or an overview plus
   overlapping bounded tiles for long/wide images. Views carry EXIF-oriented
   original-pixel coordinates.
3. Backend `screenshotContactTasks` reads the canonical stored original,
   checkpoints `preprocess.parts[index]` so retries skip completed billed calls,
   stores the packet on the task response/state, records a sanitized
   `contact.screenshot.preprocess` product-run span, and derives the
   `ContactChatExtraction` proposal from the packet.
4. The packet is passed to the downstream Agent. With no follow-up, no original
   is re-sent. Otherwise only flagged source indices are attached, exact
   follow-up regions (maximum 1,400 px per dimension) require current-run pixel
   receipts. Each region is bound to one baseline uncertainty and stable field
   target. The model returns field patches only; the host validates every
   changed field and resolved uncertainty against that declaration and merges it into the immutable
   preprocessing baseline before filing tools unlock. Unknown provider
   responses require an explicit audited resume before a retry. Providers that
   cannot issue these region receipts keep the baseline unchanged and pause for
   human review without receiving the original again. One packet can declare at
   most 24 follow-up regions across all source images, matching the global
   current-run receipt budget.
5. The iOS review draft keeps each preprocessing message and its source-image,
   visible speaker and visible-time locators. Saving emits one proposed-attribution
   fragment per message. Discard and terminal completion delete the preprocessing
   task at its exact revision before removing the local inbox source. The server
   records deletion intent before scrubbing, so a retry with the original
   requested revision can continue a temporarily failed final phase.

## Milestones

- [x] Plan recorded.
- [x] Shared contract + Ark preprocessor + prepared views in `apps/agent`,
      with focused unit tests.
- [x] Backend wiring, checkpointing, packet persistence, sanctioned span, and
      Claude follow-up gate with tests.
- [x] Env/config/Infisical wiring.
- [x] Web monitor packet display + test.
- [x] iOS reviewed capture and shortcut inbox migrated to `preprocess_only`;
      Vision OCR implementation removed.
- [x] Canonical docs + evaluation README with requirement-to-evidence mapping.
- [x] Review remediation preserves message-level iOS provenance, exposes waiting
      questions/regions, aligns the 24-region budget, and couples local removal
      to exact-revision server deletion.

## Completion evidence

- `pnpm --filter @talent-signal/agent test` / `typecheck`.
- `pnpm --filter @talent-signal/backend test -- src/modules/screenshotContactTasks.test.ts`
  and `typecheck`.
- `pnpm --filter @talent-signal/web test -- components/product-run-monitor.test.tsx`
  and `typecheck`.
- `pnpm docs:check`.
- A synthetic live Ark probe returned the pinned model identity, provider request
  receipt, token usage, two ordered messages, and no follow-up region; see the
  acceptance evidence directory. No private screenshot or extracted text was
  retained in that receipt.
- PostgreSQL integration: 40/40, including selected-source correction,
  ambiguous abstention, and explicit unknown-response retry authorization.
  The additional deletion recovery case injects a failure after intent commit
  and proves the original revision can resume the final scrub.
- iOS `RelationshipCaptureTests`: 55/55, including the shared non-filing
  preprocessing request, explicit user Retry/resume, unresolved-source display,
  receipt persistence before polling failure, readable-draft background blocking,
  per-message source provenance, foreground and background server cleanup before
  local source removal, response-loss recovery before deletion, local-only
  preflight deletion, active-request serialization, runtime-scope isolation, and
  local-source preservation across a temporary cleanup failure.
- iOS generic-simulator Release build passed after the review remediation.
- iOS localization boundary passed with 2,692 catalog keys, 174 transitional
  inline bilingual calls, and 210 raw SwiftUI literals.
- iOS `StandaloneOnboardingTests`: 53/53, including the regression that ignores
  legacy OCR text for shared images while preserving recruiter notes.

## Open decisions

- Exact prepared-view dimension/byte budgets are bounded constants in the
  preprocessor; they can be tuned after real-image evaluation without changing
  the contract version.
- `store:false` is requested where the Chat API accepts it; retention claims stay
  limited to API-session semantics.
