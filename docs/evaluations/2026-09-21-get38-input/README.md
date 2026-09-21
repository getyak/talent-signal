# GET-38 image input verification

Historical evidence only: this source-intake implementation shipped in PR
#231 (`224cd374`), then was rejected by the user because image messages belong
directly in the conversation. The checks below do not establish GET-38
acceptance. See the [inline chat correction plan](../../../plans/2026-09-21-get-38-inline-chat-images.md).

## Request and baseline

The authenticated GET-38 issue requests repair of image sending, drag-and-drop,
image presentation, and storage. Baseline `643175d2` routes the queue composer
to the older ephemeral single-image capture editor, and has no image paste or
drop handling. The shared macOS WKWebView uses the resident Web UI; its existing
file chooser supports multiple selection.

The implementation reuses the governed contact-source pipeline. Images are
saved as Sources, with preview and explicit `Save and organize`; this does not
turn an image into a text queue message or confirmed relationship facts.

## Real source-storage probe

On 2026-09-21 the resident Web was used with an isolated, expiring test workspace.
A browser-generated 600 x 420 PNG said `GET-38 SYNTHETIC TEST` and explicitly
contained no person, contact, or private data. Public research remained off.
The existing real source-intake UI admitted the image and completed with no
Person creation. The original was then read through the authenticated image
endpoint, independently of the local preview:

- Task: `09e37971-b7fd-474e-a30d-dbbbc9f79e20`.
- Response: HTTP 200, `image/png`, 18,920 bytes.
- SHA-256: `d6dd33496468281927c06e29a082b0192692d7fcb40cc7e08bdb3a688ede3d4c`.
- Result: no person found; source retained for inspection or deletion.
- Returned to the primary workspace after the probe; test workspace expires
  under its existing policy.

This proves the existing backend source-storage path, not the new UI. New UI
verification below must use the final implementation.

## Framework references

- [MDN file drag and drop](https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/File_drag_and_drop):
  file-only default prevention, chooser parity and object URL cleanup.
- [Radix Dialog](https://www.radix-ui.com/primitives/docs/components/dialog):
  controlled modal state, focus containment and restoration.
- Installed Next.js 16.3.4 guide:
  `next/dist/docs/01-app/02-guides/lazy-loading.md` (Client Component dynamic
  imports). React version is 19.2.8.

## New UI verification

The final candidate passed independent review with no unresolved P0/P1/P2.
The reviewer independently ran 27 checks; the parent ran 114 affected Web
tests. Pi also ran the full Web suite (1,140 passed, one skipped) before the
parent's final targeted lifecycle repairs.

An explicitly labeled local fixture mounted the real conversation and source
components while simulating API responses. It was removed before delivery.
Browser acceptance confirmed:

- Dropping a browser-generated PNG opened a centered dialog, decoded a
  600-pixel-wide thumbnail, and made zero submission requests.
- The existing conversation text remained unchanged. Closing and keeping the
  draft, then pasting an image, reopened the intake with its original image.
- A simulated lost response locked the attempt; adding another image was
  refused. Retrying after close/reopen sent an exactly identical request body.
- Successful admission exposed the original-image viewer; the scoped Blob
  decoded correctly. The 390 x 844 dark layout had no horizontal overflow.
- Regression tests cover file selection/paste/drop, invalid batches, removal,
  Strict Mode preview URL replay, unknown retries, same-tick close protection,
  text restoration, late encoding after unmount, and late viewer responses.

Screenshots: [desktop preview](input-dialog-desktop-fixed.jpg),
[narrow dark result](result-narrow-dark.jpg),
[narrow original-image viewer](original-narrow-dark.jpg).
These fixtures prove UI behavior, not provider execution or durable storage;
the separate real-storage probe above covers the existing backend.

Parent validation also passed ESLint, `pnpm docs:check`, and the production
build (including TypeScript) with an explicitly synthetic build-only auth
secret, as CI does. An initial build without that required environment failed
closed before route collection; no application-code repair was needed.

## Delivery

[PR #231](https://github.com/getyak/talent-signal/pull/231) merged as `224cd374`
after its applicable checks passed, and the resident Web release was activated.
The user's later correction invalidated this implementation as GET-38
acceptance. No native iOS build or TestFlight release was part of this change.
