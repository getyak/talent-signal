# iOS Action Button screenshot capture release artifact r7

## Frozen artifact

- Artifact ID: `ios-action-button-capture-2026-09-04-r7`
- Repository base: `19241cd0e1cb2d89250201fd22139fff84c9de9c`
- Product commit: `c43145222c7750bf5cfc705384e46ce694f325df`
- Build and UI device: iPhone 17 Pro Simulator, iOS 26.5 (`23F77`)
- Result bundle: `/tmp/talent-signal-action-button-c431452.xcresult`
- Retained Release build: `/tmp/talent-signal-action-button-release-r7-derived`
- Physical-device boundary: `xcrun xctrace list devices` found the host Mac and
  simulators but no connected iPhone. A physical Action Button assignment or
  press is not claimed.

The product commit is immutable. The review packet added after that commit does
not alter any product, test, localization, or integration file listed below.

| File | SHA-256 |
| --- | --- |
| `apps/ios/Sources/App/CaptureAppIntents.swift` | `6c381253982fb8c3bf4b3d93b1bb82a95a7a546efa0c80db084ff5d79a96e34b` |
| `apps/ios/Sources/Features/AgentSourceSettingsView.swift` | `2fd79efee7cfb6f3a8bed48c092ff5c615ea577f072d2c673480df8ac5335095` |
| `apps/ios/Sources/Features/AppSettingsView.swift` | `97fdb6c6416cf0bfba732db9f5992087bcc9e009ac3e5274abc37b694abbde76` |
| `apps/ios/Sources/Features/RelationshipAgentStudioView.swift` | `c3ec3eaa563e10922b2604869d3871b266e1fa853203697e116a27f196f0bb20` |
| `apps/ios/Sources/Features/RelationshipArchiveSheets.swift` | `d1a9ee4f92f896222d82eb3dbea8d548f93af773a7821642147e743598e7c6f0` |
| `apps/ios/Sources/Features/StandaloneOnboardingView.swift` | `36ebfd627e0224c4ce49ad45abb4ba8ebbae7732d1de3953174e8c099d23403e` |
| `apps/ios/Sources/Services/PendingCaptureInbox.swift` | `0ff1de27b8819dc3fc1bf20de919af2051a6a4171f2fbde6b4028fa777aa7e99` |
| `apps/ios/Sources/App/TalentSignalApp.swift` | `3eb83d4397bcfeca7f11fa7c270f860e8c243e7e3f934c4c9d91abbd1071ef6c` |
| `apps/ios/Sources/Features/RelationshipCaptureStore.swift` | `45201bea6efc9657bbbbdff7554eba619e37e178f3dda187fd6bf1363dfce961` |
| `apps/ios/Sources/Features/RelationshipCaptureView.swift` | `95ccdbbd4f790465fa6f4917027a51d4077644fba43491ed9477edbf308431cd` |
| `apps/ios/Resources/Localizable.xcstrings` | `b3eacc854a27666741a44921491854f0afbcc3e2805c7902b4194f1ef1e938d6` |
| `apps/ios/Tests/RelationshipCaptureTests.swift` | `20cfde5891135412cdd06aeb71cc6843597632aadf116b8c657e4feecb1c888e` |
| `apps/ios/UITests/CandidateSignalUITests.swift` | `cefa49d3ebd253f9011c202c3b2601bbca35febca6f34fe38dd83f8a64f48f01` |
| `apps/ios/README.md` | `98798210ff7f8eb479488dc36d775d60226b979cc1c07abe3bfc63e2ce149bee` |
| `docs/integrations.md` | `f0069a1326b2819e0a96c7ab968aa1abb32f3b8d8ff17b6cab61dd9ea286ba87` |

## User outcome

The app teaches one honest, low-burden setup:

1. Open an empty personal Shortcut editor from Talent Signal.
2. Add system `Take Screenshot`, then Talent Signal `Review screenshot`.
3. Give the Shortcut a short name.
4. In Settings > Action Button, choose Shortcut and select that name.
5. Press and hold while an authorized conversation is visible.
6. Talent Signal validates and stages the exact image locally.
7. On the next app launch, review it, then keep, discard, or explicitly tap
   `Save and check identity`.

No Focus mode is required. The primary control says `Open Shortcut editor` and
discloses that the editor opens empty. Generic App Shortcuts remain separate
under `Other shortcuts`. The setup entry says `One-time setup`, not an
unmeasured duration promise.

## Truth and authority boundaries

- `Assigned` is based only on the user's self-confirmation.
- Compact `Local receipt` / `本地回执` means only an app-owned local receipt.
- `Screenshot received via Shortcuts` states that a receipt does not prove the
  current Action Button assignment or a physical press.
- A receipt cannot confirm identity, a candidate fact, a relationship, Agent
  processing, or an external action.
- Empty, corrupt, unknown, over-25-MiB, or over-80-megapixel image content is
  rejected before persistence and before the receipt timestamp changes.
- Accepted images and drafts use complete file protection, are excluded from
  backup, roll back partial persistence, deduplicate pending exact retries, and
  retain explicit per-item removal.
- Button capture performs no network work. Reviewed text leaves the local
  review surface only after the user taps `Save and check identity`; no
  downstream candidate fact or external action is confirmed automatically.

## Release-gate evidence

The final focused gate completed against product commit `c431452`:

- Release generic iOS Simulator clean build: passed.
- `RelationshipCaptureTests`: 20 passed, 0 failed, 0 skipped.
- Setup, status, localization, recovery, and documented bare-Debug-fallback UI
  tests: 6 passed, 0 failed, 0 skipped.
- Combined result: 26 passed, 0 failed, 0 skipped.
- Localization validation: passed with 1,265 catalog keys.
- `pnpm docs:check`: passed.
- Brand, secret-contract, Agent, Web, and backend tests: passed. The first local
  production Web build correctly failed closed without `AUTH_SECRET`; it passed
  when rerun with an explicit ephemeral local gate value.
- `git diff --check`: passed.

The first r7 attempt used a Simulator UDID removed by the local Xcode runtime
refresh. Its Release build passed, then the script stopped with `Invalid
device`. The retained result above is the complete retry on the current iPhone
17 Pro Simulator; no failed product assertion was discarded.

Unit coverage includes decoded-image validation and byte/pixel bounds, corrupt
input, rejection before both queue and receipt, file protection, backup
exclusion, FIFO, exact-retry deduplication, later re-import, draft isolation,
migration, deletion, receipt/assignment separation, OCR, identity ambiguity,
no-action, and retry.

UI coverage includes all four assignment/receipt combinations across relaunch,
receipt without assignment, Simplified Chinese at AX5, pre-processing
keep/discard, the exact two-action recipe, a 44-point primary control,
empty-editor disclosure, the separated App Shortcuts catalog, and the documented
bare Debug local-preview fallback.

The r7 screenshot manifest is
[`evidence/ui-test-attachments-r7/manifest.json`](evidence/ui-test-attachments-r7/manifest.json).
Primary rendered evidence:

- [Fresh English setup](evidence/ui-test-attachments-r7/3CCAE38B-A080-47A9-8E02-AA93CEF28919.png)
- [Local receipt with assignment unchecked](evidence/ui-test-attachments-r7/5638E563-863E-488F-BC6E-5FAA0459495C.png)
- [Simplified Chinese at AX5](evidence/ui-test-attachments-r7/23F307C1-00B3-494A-9A40-98FB2F106BAC.png)
- [Keep or discard before processing](evidence/ui-test-attachments-r7/5B7E88EB-5F57-4D6A-9567-D4DC36EC8184.png)
- [Neutral one-time setup entry](evidence/ui-test-attachments-r7/9BE3703B-4A2E-41A1-96E3-A75CA7BFD4F0.png)
- [Chinese AX5 source entry](evidence/ui-test-attachments-r7/A10384E2-31A3-4CB8-9B1C-348D854AB108.png)
- [Chinese AX5 Agent entry](evidence/ui-test-attachments-r7/D5A64D76-0D8D-434A-A558-32A81DE90971.png)
- [Documented Debug fallback](evidence/ui-test-attachments-r7/E6F4EF2F-9485-43C4-BA2E-02AC4E6B9460.png)

## Release App Intents evidence

The retained Release product's extracted metadata reports:

- `ImportConversationScreenshotIntent` title: `Review screenshot`;
- mode: background (`openAppWhenRun: false`);
- `screenshot` parameter: required `IntentFile`;
- advertised App Shortcuts: `Capture Signal`, `Review Signal`, `Open Pursuit`,
  and `Record Signal`;
- `Review screenshot` advertised as a one-step App Shortcut: false.

The required-image action is therefore suitable as step two of the user's
personal Shortcut, without pretending that the bare action provides one-press
capture.

## Review history and rules

- The first review round found a state-promotion bug: a screenshot receipt
  could set the manual Action Button assignment flag. r7 writes only the receipt
  timestamp, and the four-state/relaunch UI test proves the separation.
- The safety review requested a negative integration test tying input rejection
  to both an empty queue and no receipt. r7 passes that test for corrupt,
  over-25-MiB, and over-80-megapixel inputs.
- r7 rebases the feature onto `v0.1.42`, preserves the mainline Agent profile
  reference architecture, and adds the local-receipt state to the separate
  source-settings surface.
- Full post-save deletion/retraction across capture, resource, and wiki records
  remains a broader lifecycle-governance follow-up; this artifact does not claim
  that separate system-wide audit is complete.
- Review this file and r7 evidence only. Recompute every hash before scoring;
  abstain if any listed source differs.
- Treat missing physical hardware as an explicit evidence boundary, never as
  simulator proof.
- Any hidden upload, confirmed-state promotion, identity merge, candidate
  ranking, or external action without human authorization is a veto.
- Specialist scores use 0–4. The requested 100-point acceptance score is a
  separate atomic adjudication, never an average of specialist scores.
