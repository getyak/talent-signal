# Chat media album

## Outcome

Recruiters can attach one or more images to the native iOS relationship Ask
composer, see honest upload and failure states, submit them with the scoped Chat
task, and read them back as a compact media album bubble. The backend owns
durable metadata and supports local development storage plus S3-compatible
object storage without making an uploaded image evidence or authority by
itself.

Completion is observable when the real relationship workspace can select,
upload, remove, retry, submit, and render multiple images; the backend proves
account and relationship scoping, idempotent Chat binding, authorized readback,
and deletion; relevant tests, typechecks, lint, build, and UI checks pass.

## Boundaries

In scope:

- image-only attachments in the native iOS relationship Ask composer;
- up to ten JPEG, PNG, WebP, GIF, or HEIC/HEIF files with explicit size limits;
- durable media metadata and content in local or S3-compatible storage;
- attachment lifecycle states, scoped access, removal, and Chat-task binding;
- an accessible media album bubble for one or many images.

Out of scope:

- OCR, interpretation, or automatic conversion into governed evidence;
- videos, documents, external messaging, or autonomous actions;
- desktop Web composer integration, which remains a separate follow-up slice;
- a general media library or cross-relationship reuse;
- retroactive rendering of legacy Chat answer bodies that the product does not
  persist as conversation history.

## Current evidence and unknowns

- `RelationshipAskView` submits a scoped 1,000-character objective and preserves
  local draft/idempotency recovery.
- backend Chat creates a `context_manifest`, but no message or media entity
  exists today.
- source resources are governed evidence and require review; Chat attachments
  must not silently enter that model.
- S3 endpoint, bucket, region, and credentials are deployment configuration and
  cannot be proven against a real external bucket in this workspace. The same
  adapter contract will be covered with deterministic tests; local storage is
  the runnable proof surface.

## Approach

Add a `chat_media_assets` aggregate with account, person, relationship,
uploader, content metadata, object key, lifecycle state, and timestamps. Add a
manifest join so a ready asset becomes immutable input context for exactly one
submitted task. An authenticated backend route streams bounded content through
the configured local or S3-compatible adapter and marks the asset ready only
after storage succeeds. Authorized reads enforce the same account scope.
Deletion is allowed only before task binding in this slice; submitted media
remains part of the durable task receipt and follows the future Chat retention
policy.

Rejected alternatives:

- base64 images inside the Chat JSON request: duplicates sensitive bytes in
  application memory and idempotency records and does not scale to albums;
- treating every image as a `source_resource`: that would imply evidence
  authority before identity, purpose, transcription, and human review;
- storing browser object URLs: they are not durable or recoverable.

## Milestones

1. Define contracts, migration, storage interface, and configuration.
2. Implement upload negotiation, local/S3 content operations, completion,
   authorized read, deletion, and Chat-task binding/readback.
3. Implement composer selection, validation, progress/error/retry/removal, and
   single/multiple-image album rendering.
4. Verify contracts, lifecycle, scope isolation, idempotency, iOS UI semantics,
   simulator rendering, and production build.
5. Review safety, route durable operational configuration, and hand off known
   external S3 verification uncertainty.

## Decisions that would change direction

- If attached images should immediately become governed source evidence, the
  flow must move to source intake and add identity/transcription review before
  Chat can cite them.
- If submitted media must be user-deletable independently of the Chat task,
  the product needs a derivative invalidation and retention decision rather
  than a simple object delete.

## Completion evidence

- The relationship workspace selected, uploaded, retried, removed, submitted,
  and read back images against the real local backend and PostgreSQL migration.
- Two-image and five-image turns rendered as responsive album bubbles; the
  five-image case exposed four inspectable tiles plus a `+1` remainder marker.
- Backend storage and manifest tests passed with scope, lifecycle, deletion,
  local round-trip, path-escape rejection, and S3 private-write assertions.
- `pnpm docs:check`, backend tests and typecheck, the iOS Simulator build, and
  `git diff --check` passed on the clean delivery branch.
- A real external S3 bucket remains deployment verification because this
  workspace has no authorized bucket or credentials; the adapter and production
  configuration are covered deterministically.
- The native iOS Ask composer now uses the system multi-select Photos picker,
  streams ready media through the same scoped backend, persists submitted media
  metadata with the Session, and renders a four-tile album plus `+N` remainder.
- On an iPhone 17 Pro Simulator running iOS 26.5, the five-photo canonical UI
  test passed through real Photos selection, upload, Ask binding, authorized
  readback, keyboard dismissal, and album rendering. Its final screenshot is in
  `output/ios-media-album-2026-08-27/final/`.
