# macOS update delivery verification

## Observed starting state

On 2026-09-24, the installed macOS application was `0.1.0 (10)`.
Native Settings showed an unconfigured updater and a disabled Check for Updates
button. The disabled automatic-check toggle nevertheless appeared enabled.
The bundle contained an empty `SUPublicEDKey`; the fixed production appcast
returned HTTP 404. Repository and `macos-release` environment variables were
empty. Presence-only checks found none of the documented macOS signing,
Sparkle, or notarization credentials in Infisical `staging:/release`.
No credentials or workspace contents are included in this report.

The existing [release workflow](../../../.github/workflows/release-macos.yml)
accepts successful trusted push CI for the exact current `main` revision,
then builds/tests the native application before publishing. It defaults to
ad-hoc preview distribution; signed feeds require explicit signing setup.

[Main CI run 35969029633](https://github.com/getyak/talent-signal/actions/runs/35969029633)
failed in iOS tests because synthetic preview sessions used a fixed August 25
date and crossed the normal 30-day retention boundary. One expected session
was already expired; a subsequent search test indexed the missing session.
[Release run 35971778866](https://github.com/getyak/talent-signal/actions/runs/35971778866)
was therefore skipped. The scoped fixture fix uses the preview clock while
retaining the same expiry policy. A future-clock regression test checks both
initial visibility and eventual expiry.

## Verification boundary

- Release policy tests: 8 passed across the two policy suites.
- Updated driver, session, click bridge and actual WorkspaceBrowser class compiled
  against checksum-verified Sparkle 2.10.0 using a small standalone harness.
- Native XCTest: 16 passed (9 session, 7 connection/command boundary).
- Web component tests: 3 passed; focused ESLint passed.
- Independent review closed check/install confusion, synthetic navigation consent,
  staged-offer handling and restoration of the isolated listener after metadata
  publication. No unresolved P0/P1 in the final static review.
- Synthetic native-click rehearsal installed build 900002 over 900001 and
  relaunched without a second application confirmation. Installed bundle and
  latest-version UI readback passed. See [runtime evidence](runtime-proof.txt).
- Actual WebKit account-footer flow passed: page handler unavailable, synthetic
  click rejected, listener survives reload, real click upgrades/relaunches,
  latest status removes indicator. A tampered archive was rejected with the old
  installed build preserved; retry only rechecked and required a new offer click.
- First remote macOS full build/unit tests and UI-test compilation passed on
  `2396ab6a` ([run 36011500218](https://github.com/getyak/talent-signal/actions/runs/36011500218)).
  Final-head CI is tracked on [PR 245](https://github.com/getyak/talent-signal/pull/245);
  this first result is not a substitute for that final revision.
- Documentation checks passed. Full local Web typecheck encountered existing
  meetingDraft/source_image contract mismatches through shared dependency builds;
  fresh remote CI remains required. The modified component reported no type error.
- Internal free space was 54–56 GiB, below the project's 80 GiB heavyweight
  build threshold. No local Xcode application build or Simulator was started.
- `Check macOS` adds premerge native build/unit-test coverage. It is a separate
  check, not a new required branch-protection rule. The release workflow still
  performs its own exact-revision native checks. UI tests compile by default.

Production acceptance remains incomplete until a signed/notarized release,
signed appcast readback, and an actual old-to-new installation are verified.
Cross-device delivery additionally needs a second physical Mac. An unconfigured
preview cannot acquire an updater trust key automatically; one manual trusted
installation is required to bootstrap that machine.

## References

- [Distribution and credential contract](../../operations/macos-distribution.md)
- [Sparkle user driver callbacks](https://sparkle-project.org/documentation/api-reference/Protocols/SPUUserDriver.html)
- [Sparkle configuration and signed feeds](https://sparkle-project.org/documentation/customization/)
