# Publication data review — r39

Reviewer: `evidence-safety-reviewer`.
Lens: evidence integrity, privacy, and public-artifact minimization.

Scope: proposed public `getyak/talent-signal` PR, `/Users/cubxxw/data/talent-signal-account-sync`, relative to `origin/main` `6cad31f449aee8c9d905def7d30b339e1024ce5b`. Final reviewed HEAD: `67e8904c15a8fb38fc0d54c50120d70b4ae5dd3e`. At 2026-09-25 06:33 UTC there were 257 added/modified/untracked candidate paths: 234 text files and 23 images, including 148 account-sync evaluation artifacts and the active plan. The initial inventory had 239 paths; the subsequently added login-design artifacts were included in the later text, metadata, and local OCR pass. Moving Pi worktrees and other projects were not scanned.

## Result

No confirmed newly introduced production credential, real production email, non-synthetic conversation/contact record, or production account identifier was found in the reviewed text. No private-key block, credential-bearing database URI, JWT/JWE-shaped literal, or recognized provider-key-shaped literal was detected in newly added diff lines. JSON authority-field inspection did not find a non-empty raw password/token/secret/verifier scalar in the candidate evidence files.

This is a bounded data-exposure review, not proof that arbitrary opaque strings are harmless. The receipts' synthetic/disposable provenance was checked; a UUID, public source hash, error code, or provider method name is not itself a credential. Original source-bound failure evidence should remain available privately when producing a smaller public summary.

The two initial screenshot label questions are closed as synthetic fixture content. The parent visually inspected the first image and identified the exact left-sidebar synthetic session title and contact created by this task's CSV import in the disposable acceptance account. Independent local OCR located the same label in both images; comparison with the parent-verified title explains the three OCR character errors that prevented an exact source-text match. This is parent visual confirmation plus independently located pixel/OCR and repository fixture provenance, not a claim that OCR alone identifies people. No confirmed publication-blocking P0/P1 remains in this reviewed snapshot. No actual label, email, credential, or personal value is reproduced below.

## Data classifications and optional minimization

| File | Line / image location | Data category |
| --- | --- | --- |
| `docs/evaluations/account-sync/actual-macos-send-r18.png` | Image; local OCR line 7; left-side label, normalized Vision rectangle approximately `(0.0087, 0.4281, 0.0712, 0.0146)` with lower-left origin | Resolved: synthetic session-title/contact label; parent visual confirmation and disposable import provenance |
| `docs/evaluations/account-sync/actual-web-person-macos-r19.png` | Image; local OCR line 13 | Resolved: same synthetic session-title/contact label; pixel/OCR match to the parent-verified fixture |
| `plans/2026-09-25-unified-account-sync.md` | 17, 156, 536 | Operator home/worktree paths; optional minimization, not an authentication secret |
| `docs/evaluations/account-sync/backend-r22-review.md` | 7, 10 | Operator home/worktree paths; optional minimization |
| `docs/evaluations/account-sync/backend-r35-review.md` | 7 | Operator home/worktree path; optional minimization |
| `docs/evaluations/account-sync/login-design-r39/receipt.json` | 30 | Operator home/worktree path; optional minimization |
| `docs/evaluations/account-sync/actual-client-readback-2026-09-25.json` | 74, 131 | Task simulator identifier; not a physical-device account or bearer credential |
| `docs/evaluations/account-sync/actual-web-person-r19.json` | 93 | Task simulator identifier; optional minimization |

The two image candidates do not require privacy redaction on the evidence now available. For any later live-account image or evidence without synthetic provenance, keep the original in the private task artifact directory and publish a cropped/redacted derivative or textual pass/failure summary; do not delete the original audit evidence. Verify replacement pixels and metadata, not only filenames. Optional path/device minimization can use repository-relative source paths and stable synthetic device aliases while preserving private receipts for exact reproduction.

## Classified non-findings

| File | Line | Data category |
| --- | --- | --- |
| `docs/evaluations/account-sync/actual-client-readback-2026-09-25.json` | 29–30, 147, 150, 165–167, 188 | Retained synthetic account/user identifiers and explicit disposable-fixture provenance |
| `docs/evaluations/account-sync/actual-ios-web-sync-r16.json` | 3–5, 14–34, 37, 49, 51–55 | Synthetic account/session/message identifiers, synthetic conversation/draft text and isolated test-session metadata |
| `docs/evaluations/account-sync/actual-macos-password-sync-r16.json` | 3–5, 14–39, 42, 54–64 | Synthetic cross-device fixture identifiers and intentionally authored test text |
| `docs/evaluations/account-sync/actual-web-person-r19.json` | 9–10, 13, 38, 53, 86, 95 | Synthetic account/contact fixture and explicit source boundary; the recurring named contact is also present in existing bundled import/test fixtures |
| `docs/evaluations/account-sync/parent-checkpoint-2026-09-25.md` | 13–15 | Disposable database/synthetic-account scope statement |
| `plans/2026-09-25-unified-account-sync.md` | 19–21, 79–84, 151–153 | Aggregate production observation and configuration status; no literal production identity or secret disclosed on these lines |
| `docs/evaluations/account-sync/native-apple-system-checkpoint-r20.json` | 7, 11–14 | Verifier description/system-prompt text and boolean outcomes; not verifier material or an Apple identity token |
| `docs/evaluations/account-sync/design-preview.html` | 13–16 | Reserved example-domain addresses in a synthetic design |
| `apps/backend/src/modules/accountIdentity.test.ts` | 23–24 | Fixed Apple relay normalization fixture; real provider domain does not make the fixed test address a live user credential |
| `apps/ios/Tests/AccountSignInMethodsModelTests.swift` | 174–175 | Fixed relay/example-address fixture |
| `apps/web/components/account-sign-in-methods.test.tsx` | 110 | Fixed relay-display fixture |
| `apps/backend/src/database/seed.ts` | 55, 64–67 | Non-example-domain seed literals already present on `origin/main`; not newly introduced by this diff |
| `apps/backend/src/modules/auth.test.ts` | 232, 289 | Non-example-domain test literals already present on `origin/main` |
| `apps/ios/Sources/Features/RelationshipArchiveView.swift` | 526 | Non-example-domain literal already present on `origin/main` |
| `docs/operations/account-access.md` | 234, 283 | Pre-existing deployment hostname/address example; not added by this diff |

Any task-only test password or mock authority introduced later must remain explicitly tied to an isolated fixture and must not be reused in production. No production rotation or incident claim is justified by the synthetic UUIDs, fixed example strings, or descriptive verifier field above.

## Image boundary

All 23 in-scope images were read locally with ImageIO and Vision OCR; no image was uploaded to a provider or external scanner. ImageIO exposed no GPS, owner/artist, device serial, user comment, image description, location, or capture-time fields. Existing sync screenshots carried only pixel/color/profile/JFIF metadata; the login assets carried pixel/color/PNG metadata, with software/resolution metadata in the provider button artwork.

OCR email hits in the native synthetic-contact screenshot and the new login-page screenshots used reserved example domains. No image OCR credential-pattern hit was detected in the original sync screenshots. The new login screenshots show the static example form; their text scan and associated receipt do not establish a live credential. OCR can miss small or occluded text and is not a full manual pixel certification. The two label candidates were resolved using the parent's direct visual inspection and the existing synthetic import evidence; they were not silently dismissed or classified as private persons.

No screenshot was edited. No source, plan, original report, runtime, database, credentials, or external destination was changed. The only reviewer-authored file is this report.

## Source binding

The sorted `{path,sha256}` candidate inventory at 06:33 UTC has aggregate SHA-256 `62a527111d3cab49efb77e80269f15cec937c39976d1bd60e78392cae0c05637` (JSON, sorted keys, compact separators). Relevant file hashes:

| File | SHA-256 |
| --- | --- |
| `plans/2026-09-25-unified-account-sync.md` | `9b3f1922e67a4045251f1171803f989ef19e90a931af7c268ae4896465f54b67` |
| `docs/evaluations/account-sync/actual-client-readback-2026-09-25.json` | `f58c8bebb3e2cfa79d2f1f99fc26e2ef6d2986684ffed5ffe6f9f6f7feb8ae6c` |
| `docs/evaluations/account-sync/actual-web-person-r19.json` | `ff6ddcc3113be7c476d1cb5e63d787dc50727fca5c10e8c33be5759b5cb5b51e` |
| `docs/evaluations/account-sync/actual-macos-send-r18.png` | `c544e0b5af02e33b7573ffe2565bd8829ba91b80780ad3cdf1747eaeebcc2137` |
| `docs/evaluations/account-sync/actual-web-person-macos-r19.png` | `c59b5c2d8d32f4e795a80bfe680c803eefe876c17088450db71a895af8f01dcf` |

Recheck newly added evidence and changed lines before the public push; this report does not authorize publication of later live-provider screenshots or raw account records.
