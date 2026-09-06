# Multi-image contact intake verification

## Delivered behavior

Web and iOS send up to ten ordered screenshots as one contact task. Each image
is limited to 10 MB; the request is limited to 30 MB total (the native picker
retains its existing 8 MB per-file guard). Native HEIC/HEIF/GIF selections are
converted to JPEG for this flow. The legacy single-image request remains valid.
Web previews support incremental selection and removal. Routine attachment,
post-send, and explanatory profile/source footnotes are removed; actual errors,
identity questions, evidence labels, and progress remain inspectable.

Private original storage shares the existing local/S3 adapter. A durable
manifest reserves immutable account/task/index/hash keys before upload; retries
skip completed uploads. Extraction checkpoints each image and reconstructs the
ordered message stream with server-owned image indices and message IDs.
Different visible contact names and unreadable members stop the whole batch
before filing. Overlapping messages retain distinct source observations and
are not asserted to be repeated events. Authenticated original readback exists
in Web and the native conversation/history/contact cards.

The [storage playbook](../../operations/backend-production.md#chat-media-object-storage)
owns configuration, permissions, retention, and permanent deletion semantics.

## Real browser and provider proof

The real Web composer selected two copies of the existing explicitly synthetic
Andrew Ng fixture, removed/replaced the second, then submitted one task. This
deliberately exercises overlap without representing a real private conversation.
Chrome extension local-file access was unavailable; the fixtures were served
temporarily by the local test Web server and selected via a browser FileList.
The temporary public fixture was removed after the test.

The first vision call returned provider HTTP 429. Clicking Continue reused the
stored originals without reattachment. Real vision and tool calls then completed
the same task, reused the existing contact, and saved six messages, three from
each image. Public research was disabled for this test. Both original readbacks
returned HTTP 200, matching byte lengths and SHA-256 hashes, image MIME types,
and `no-store`. The [runtime receipt](runtime-proof.json) records task/contact
identities, message-to-image mappings, and original readback. The first resolved
429 remains in the historical task's collapsed limitations.

- [Desktop composer](01-composer-desktop.jpg): two previews, removal controls,
  count, objective, and one send action without the removed footnote.
- [390-pixel result](02-completed-mobile.jpg): completed task and evidence;
  document width equals viewport width, with no horizontal overflow.

This is a synthetic product-flow proof, not a general OCR/identity accuracy
claim. The complete UI proof used two images; the ten-image boundary is checked
deterministically.

## Checks

- 17 focused backend tests passed, including nine real-PostgreSQL cases. New
  cases cover partial PUT/replay, extraction recovery, ordered provenance,
  wrong uploader/storage scope, mixed identities, unfiled expiry, immediate
  revoked-source denial, and failed-purge retry.
- The backend suite passed 316 tests; nine database tests were skipped in that
  invocation and separately passed against the disposable proof database above.
- Web/backend typechecks, the production Web build, and targeted Web ESLint
  passed. The build used an ephemeral build-only auth secret; generated build
  output and its temporary TypeScript paths were removed afterward.
- Native Simulator build and test build passed. Two native XCTest cases passed
  on a task-owned iPhone 17 Pro simulator: routing and ordered ten-image request
  encoding, including the eleven-image rejection. No native photo-picker UI
  trial or new TestFlight binary publication is claimed.
- iOS localization, documentation/wiki, and architecture checks passed.
- S3 adapter tests verify AES256 PUT and exact-version deletion. No live cloud
  bucket was provisioned or tested.
- The broader secret-inventory suite passed 17/18 checks. Its ownership scan
  still flags pre-existing Lab/proof database variables and generated auth
  aliases absent from the manifest (`CONTACT_AGENT_TEST_DATABASE_URL`, the
  `LAB_*` evaluation variables, `TS_LAB_EVALUATION_TOKEN`, `GOOGLE_SECRET`, and
  `NEXTAUTH_SECRET`). These were present outside this change; the new
  `AWS_SESSION_TOKEN` is declared. This is not a fully green repository-wide
  check, and unrelated secret ownership was not expanded in this task.

## Deployment and review

The local TestFlight API and Agent Host run the rebuilt
`talent-signal-backend-local:multi-image-20260906` image. Migration 049 is applied;
health, Apple auth, voice, chat, loopback, and tailnet HTTPS probes passed.
[Source readback](deployment-proof.json) matches all seven checked implementation
and migration files. Docker Hub metadata failed with EOF; the image was rebuilt
from the verified prior local Node 24.19.0/pnpm 11.18.0 image, with a frozen
offline dependency install and current source compilation, then deployed through
the normal script. The repository Dockerfile was unchanged by this fallback.

Current deployed storage is `local`, with no S3 bucket configured. S3 and
temporary-credential settings are wired into Compose and the Infisical contract;
using an actual bucket remains an environment configuration step. No user
credentials or private candidate screenshots were copied into proof artifacts.

Review confirms task inputs remain distinct from reviewed evidence, conflicting
identities cannot be overridden by resume, and original access follows current
source authority. Revocation/expiry queues permanent object cleanup; failures
remain pending rather than claiming deletion. Reversible archive preserves the
original expiry. The proof database/Web contain only synthetic task data, and
unrelated working-tree changes are preserved.
