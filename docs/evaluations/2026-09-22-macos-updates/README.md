# macOS maintenance verification

## Scope and method

Verified in an isolated worktree and the separate `com.talentsignal.macos.rehearsal`
Debug application on an Apple silicon Mac, macOS 26.3.1, Xcode 26.4. The Web fixture
uses the production account-menu/update components with synthetic content. No
relationship messages, credentials or private account data were used.

## Observed evidence

- Native unit suite: 132 passed, five existing live-service skips, zero failures.
  Native UI tests compiled. New paths were exercised manually through the real
  macOS application rather than claiming compiled UI tests as execution proof.
- Focused Web tests: six passed; Web typecheck, changed-file lint and production
  build passed. The build used an ephemeral synthetic AUTH_SECRET, not a deployment
  credential.
- Appcast policy tests: four passed; release policy tests passed.
- `pnpm docs:check` passed, including architecture boundaries and diagrams.
- A signed local appcast advertised build 900002 to installed build 900001.
  Sparkle showed version review, download/extraction and Install and Relaunch.
  Installed Info.plist readback was 900002; the app reopened its saved service.
- A deliberately modified archive for build 900003 was rejected by Sparkle with
  an invalid-signature error. Installed build remained 900002. After restoring
  signed bytes, readback and the native Updates panel showed 0.2.3 (900003).
- Checking again displayed Sparkle's explicit up-to-date result. The update
  indicator disappeared when there was no pending update.
- The live native host rendered `View macOS 0.2.3 update` beside the account avatar.
  The account menu's Connection and Diagnostics link opened the native settings
  window. Full workspace-link normalization, loopback opt-in, remote HTTP rejection,
  connection probing, explicit service-switch confirmation and persisted origin
  were observed in the native UI.
- Expanded/collapsed account controls and the native-settings entry were inspected
  in light and dark Web themes.
- The fixture development overlay initially obscured account controls; hiding that
  test-only overlay and connecting directly to the Web development server removed
  the obstruction. The final rehearsal server serves update artifacts only.

## Limits and release gates

- The local rehearsal uses an ephemeral Ed25519 key and ad-hoc code signing. This
  proves Sparkle transport, signature rejection, replacement and restart behavior;
  it does not prove Developer ID signing or Apple notarization.
- The host has no Developer ID Application identity. Owner-provided signing and
  notarization credentials plus a durable Sparkle release key are still required.
- No production feed was published and no production server was deployed as part
  of this verification. GitHub release/feed automation is implemented, but its
  production readback requires those credentials and a trusted main release.
- Early command-line/IAB requests to the private 10443 service timed out. The
  final packaged app's native probe subsequently returned HTTP 200, and its
  WebKit window loaded the real sign-in page after the protected workspace redirect. This supersedes the earlier
  blanket reachability concern; authenticated business acceptance remains separate.
- The Universal preview DMG/ZIP passed SHA-256 readback, nested code-signature
  verification and both arm64/x86_64 checks. The packaged Release app launched
  successfully and accepted the full supplied workspace link.
