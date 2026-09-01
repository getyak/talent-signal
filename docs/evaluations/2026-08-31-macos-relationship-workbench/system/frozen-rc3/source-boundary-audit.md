# RC3 source and permission boundary audit

Artifact: TalentSignalMac 0.1.0 build 2 RC3  
Archive SHA-256: `9891645dc3cab2919ec2458ef8df99a6aa1a775031061211622ebcdf305d357a`
Source archive SHA-256:
`982f52784fb06d759dc8f5f78840cc29afdb864f3177032ad466bdfc58ac80d5`

## Native capability surface

- The host is native SwiftUI with `MenuBarExtra`, `WindowGroup`, and typed
  application commands. It contains no embedded web renderer or generic native
  message bridge.
- System-selected window capture lives only in
  `apps/macos/Sources/Services/SystemWindowCaptureService.swift`. It configures
  `SCContentSharingPicker` for one window, excludes the Talent Signal app,
  captures one still with `SCScreenshotManager`, and performs local Vision OCR.
- The window path does not configure cursor capture, microphone, system audio,
  continuous streaming, or a background poller.
- The only pasteboard reference is a write-only local-draft handoff in
  `apps/macos/Sources/Services/PreparedDraftClipboard.swift`. No source reads
  `NSPasteboard.general.string(forType:)` or polls clipboard changes.
- No source under `apps/macos/Sources` references `AXUIElement`, `CGEvent`,
  global keyboard monitoring, Automation events, Full Disk Access, or Input
  Monitoring.

## Build entitlement observation

`apps/macos/project.yml` sets an empty `CODE_SIGN_ENTITLEMENTS` value. The
frozen local build was produced with `CODE_SIGNING_ALLOWED=NO`; therefore
`codesign -d --entitlements :-` reports no entitlement payload and Gatekeeper
reports `source=no usable signature`. This proves only the local test artifact's
absence of embedded entitlements. It does **not** prove distribution readiness.

The linked Apple frameworks are Foundation, AppKit, Combine, CoreGraphics,
CoreTransferable, CryptoKit, ScreenCaptureKit, Security, SwiftUI, Vision, and
standard Swift runtime libraries. Accessibility and EventKit are not linked.

## Typed authority boundaries

- `AppModel` accepts `MacRelationshipServing`, `WindowCapturing`,
  `LocalCapsulePersisting`, and `PreparedDraftCopying`; renderer views do not
  receive arbitrary system tools.
- `URLMacRelationshipService` accepts exact scope, immutable Capsule manifest,
  typed decision resolution, and typed Action Center projection routes.
- A canonical result is rendered only after authenticated account-scoped
  readback agrees on Account, Pursuit, Person, relationship context, capture,
  evidence IDs, Task, task revision, status, and empty external effects.
- Decision resolution revalidates current evidence authorization immediately
  before the review request. Stale, deleted, purged, expired, revoked, missing,
  or unconfirmed-attribution evidence fails before any review write.
- The deterministic backend schema constrains `agent_runs.external_effects` to
  the empty JSON array for this task class.

## Storage and deletion

- `SecureLocalCapsuleStore` partitions encrypted recovery by account, excludes
  recovery files from backup, and has tested expiry, corruption, sign-out,
  manual clear, and account A → B → A behavior.
- The UI separates pause, stop, and clear receipts. Stop deletes visible local
  items plus the encrypted recovery file without claiming to cancel a
  canonical Task.
- Submitted task-only local context is removed after canonical settlement.

## Distribution limitation

The frozen archive is deliberately unsigned. Before external distribution it
still needs a real signing identity, hardened-runtime/notarization verification,
privacy usage-description review on the final signed product, and the selected
distribution channel's review. No current evidence packet claims otherwise.
