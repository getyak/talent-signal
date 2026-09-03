# iOS Action Button screenshot capture final review artifact r6

## Frozen artifact

- Artifact ID: `ios-action-button-capture-2026-09-04-r6`
- Repository base: `f2ca9abadd8cfb2840bd5a79e3b3a5895a3efe94`
- Review surface: the uncommitted workspace represented by the hashes below
- Build and UI device: iPhone 17e Simulator, iOS 26.5 (`23F77`)
- Result bundle: `/tmp/talent-signal-action-button-r6.xcresult`
- Retained Release build: `/tmp/talent-signal-action-button-final-derived`
- Physical-device boundary: `xcrun xctrace list devices` found the host Mac and
  simulators but no connected iPhone. A physical Action Button assignment or
  press is not claimed.

| File | SHA-256 |
| --- | --- |
| `apps/ios/Sources/App/CaptureAppIntents.swift` | `6c381253982fb8c3bf4b3d93b1bb82a95a7a546efa0c80db084ff5d79a96e34b` |
| `apps/ios/Sources/Features/AppSettingsView.swift` | `97fdb6c6416cf0bfba732db9f5992087bcc9e009ac3e5274abc37b694abbde76` |
| `apps/ios/Sources/Features/RelationshipAgentStudioView.swift` | `10d591fd91518a227dbf5eba51a60c9e2c53e75cc6f82ca177bb52c0d08440f7` |
| `apps/ios/Sources/Features/RelationshipArchiveSheets.swift` | `d1a9ee4f92f896222d82eb3dbea8d548f93af773a7821642147e743598e7c6f0` |
| `apps/ios/Sources/Features/StandaloneOnboardingView.swift` | `36ebfd627e0224c4ce49ad45abb4ba8ebbae7732d1de3953174e8c099d23403e` |
| `apps/ios/Sources/Services/PendingCaptureInbox.swift` | `0ff1de27b8819dc3fc1bf20de919af2051a6a4171f2fbde6b4028fa777aa7e99` |
| `apps/ios/Sources/App/TalentSignalApp.swift` | `3eb83d4397bcfeca7f11fa7c270f860e8c243e7e3f934c4c9d91abbd1071ef6c` |
| `apps/ios/Sources/Features/RelationshipCaptureStore.swift` | `45201bea6efc9657bbbbdff7554eba619e37e178f3dda187fd6bf1363dfce961` |
| `apps/ios/Sources/Features/RelationshipCaptureView.swift` | `95ccdbbd4f790465fa6f4917027a51d4077644fba43491ed9477edbf308431cd` |
| `apps/ios/Resources/Localizable.xcstrings` | `d6f090c482ba20cf466e8b5c4be97252ee4c9f4420c5d80490f3c4ec42bca4c3` |
| `apps/ios/Tests/RelationshipCaptureTests.swift` | `20cfde5891135412cdd06aeb71cc6843597632aadf116b8c657e4feecb1c888e` |
| `apps/ios/UITests/CandidateSignalUITests.swift` | `4a27ac4575a44ff17c3c70770c4280a78c63a009006df26c68fd32fd5b4466f2` |
| `apps/ios/README.md` | `7bc6dca8a7fb17206d2a5c5269f2639e093c6d89bae3235e50cc2cae611d6abe` |
| `docs/integrations.md` | `a3f74f46b291624191c4cd96db849c87dfdd474abc1f31931098ac1eb206f138` |

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
discloses that the editor opens empty. The generic App Shortcuts catalog is
separated under `Other shortcuts`. The setup entry uses `One-time setup`, not
an unmeasured duration promise.

## Truth and authority boundaries

- `Assigned` is based only on the user's self-confirmation.
- Compact `Local receipt` / `本地回执` means only an app-owned local receipt.
- The detail `Screenshot received via Shortcuts` states that receipt does not
  prove the current Action Button assignment or a physical press.
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

## Final test evidence

The repository-level `pnpm ios:check` held the global Simulator/build lock and
completed successfully against these hashes:

- Release generic iOS Simulator clean build: passed.
- `RelationshipCaptureTests`: 20 passed, 0 failed, 0 skipped.
- Selected setup, status, localization, and review UI tests: 5 passed, 0 failed,
  0 skipped.
- Combined result: 25 passed, 0 failed, 0 skipped.
- Localization validation: passed with 1,071 catalog keys.
- `git diff --check`: passed.

Unit coverage includes decoded-image validation and byte/pixel bounds, corrupt
input, the invariant that rejected input creates neither a queued capture nor a
receipt, file protection, backup exclusion, FIFO, exact-retry deduplication,
later re-import, draft isolation, migration, deletion, receipt/assignment
separation, OCR, identity ambiguity, no-action, and retry.

UI coverage includes all four assignment/receipt combinations across relaunch,
receipt without assignment, Simplified Chinese at AX5, the pre-processing
keep/discard decision, the setup entry, the exact two-action recipe, a 44-point
primary control, empty-editor disclosure, and the separated App Shortcuts
catalog.

The r6 screenshot manifest is
[`evidence/ui-test-attachments-r6/manifest.json`](evidence/ui-test-attachments-r6/manifest.json).
Primary rendered evidence:

- [Fresh English setup](evidence/ui-test-attachments-r6/B16C3951-5CAB-4789-8354-231BFCCAF8EB.png)
- [Local receipt with assignment unchecked](evidence/ui-test-attachments-r6/94B14121-7794-4FCE-AACF-2B80239F277F.png)
- [Simplified Chinese at AX5](evidence/ui-test-attachments-r6/5547C5B5-DFAB-4805-A837-3CBD3B7D03EF.png)
- [Keep-or-discard before processing](evidence/ui-test-attachments-r6/301C4D0A-37F5-4630-8965-97921CF83C11.png)
- [Neutral one-time setup entry](evidence/ui-test-attachments-r6/60E55713-0E06-4074-AE5E-B03DD3C4AE66.png)
- [Chinese AX5 source entry](evidence/ui-test-attachments-r6/B3003111-60B0-4A15-95B1-32C76F8E41FD.png)

## Release App Intents evidence

The retained Release product's extracted metadata reports:

- `ImportConversationScreenshotIntent` title: `Review screenshot`;
- mode: background;
- `screenshot` parameter: required `IntentFile`;
- advertised App Shortcuts: `Capture Signal`, `Review Signal`, `Open Pursuit`,
  and `Record Signal`;
- `Review screenshot` advertised as a one-step App Shortcut: false.

The required-image action is therefore suitable as step two of the user's
personal Shortcut, without pretending that the bare action itself provides
one-press capture.

## Review history and rules

- The first review round found a real state-promotion bug: a screenshot receipt
  could set the manual Action Button assignment flag. r6 writes only the receipt
  timestamp, and the four-state/relaunch UI test proves the separation.
- The r4 safety review requested a frozen negative integration test tying input
  rejection to both an empty queue and no receipt. r6 adds that test and passes
  it for corrupt, over-25-MiB, and over-80-megapixel inputs.
- r5 is an invalid intermediate run: its new test did not compile because an
  async actor call was placed inside an XCTest autoclosure. No r5 pass is
  claimed. r6 fixes only the test expression and reruns the complete gate.
- Full post-save deletion/retraction inventory across capture, resource, and
  wiki records remains a broader lifecycle-governance follow-up; this artifact
  does not claim that separate system-wide audit is complete.
- Review this file and r6 evidence only. Recompute every hash before scoring;
  abstain if any listed source differs.
- Treat missing physical hardware as one explicit evidence boundary, never as
  simulator proof.
- Any hidden upload, confirmed-state promotion, identity merge, candidate
  ranking, or external action without human authorization is a veto.
- Specialist scores use 0–4. The requested 100-point acceptance score is a
  separate atomic adjudication, never an average of specialist scores.
