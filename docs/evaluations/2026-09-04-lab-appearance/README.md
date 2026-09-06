# Lab appearance and page-state delivery

## Outcome and boundary

Internal iOS testers can inspect compiled pages with synthetic states, save
named display presets, and try a temporary display configuration across the
current app. The interaction contract is documented in the
[iOS README](../../../apps/ios/README.md#talent-signal-lab) and
[ADR 0012](../../decisions/0012-useful-device-lab-and-real-experiments.md).
This is an appearance milestone in the
[full Lab plan](../../../plans/2026-09-04-lab-complete-runtime.md), not completion
of the remaining diagnostics, reset, experiment-coverage or Web work.

All screenshots use synthetic product data. No proof backend or external model was used for these checks. The offline
sign-in journey deliberately attempts an unavailable loopback endpoint. The controls neither change iOS system
permissions nor authorize a canonical or external write. Release packaging and
physical-device accessibility remain separate from Simulator evidence.

## Implementation evidence

- `LabDisplayConfiguration` keeps theme, language, text size, retrieval-card
  density, app motion/transparency, contrast rendering and bounds separate.
- `LabDisplayStore` owns a memory-only trial, a sleep-aware monotonic deadline,
  explicit stop and context-change recovery. Device presets do not auto-apply.
  Malformed saved data blocks replacement until a successful reload.
- `LabDisplaySessionRoot` reserves a separate row for the restore banner.
  An earlier root safe-area inset covered the workspace navigation; the current
  native test switches People and Today while the trial stays active.
- `LabPagePreview` uses actual People, Today, Sessions and standalone review
  components. Synthetic callbacks and review persistence remain local to the
  preview. The preview header reserves its own layout space and 44-point
  controls, including at accessibility sizes.
- The shared People, Sessions and Today decision cards can show their bounds.
  This does not measure all UIKit hit regions or text baselines. The contrast
  switch is a rendering preview, not a system setting or certification.
- Builds without device-tool capability retain previews and show why saving
  or applying display settings is unavailable; disabled actions match the store
  guard.
- App-private preference use is declared in the main privacy manifest. This
  narrow declaration does not constitute an audit of every existing API use.

The elapsed clock uses Apple's sleep-inclusive monotonic clock semantics;
see [mach_continuous_time](https://developer.apple.com/documentation/kernel/1646199-mach_continuous_time).
The preference declaration follows Apple's
[required-reason API categories](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitype).

## Native proof

Device: iPhone 17 Pro Simulator, iOS 26.5, Xcode 26.6. Target deployment remains
iOS 16. The test fixture launches the actual app with its synthetic workspace.

| Journey | Observed result | Artifact |
| --- | --- | --- |
| Failed page → retry | Second attempt remains visibly failed; no canonical substitute | [Failure](failure-retry.png) |
| Long person → inspect | The real row truncates for retrieval; opening exposes the full synthetic name | [Long name](people-long.png) |
| Full evidence review | Actual source and independently reviewable proposed fact | [Review](review-evidence.png) |
| Sessions → stale read | Existing session cards plus a visible stale-read notice | [Sessions](sessions-stale.png) |
| System AX5 → request Large → Chinese/dark onboarding | System accessibility floor remains active; close and display controls are reachable | [AX5](chinese-dark-ax5.png) |
| Apply Chinese/dark/comfortable → navigate → restore | Effective root values change; navigation works; restore matches the previous values | [App trial](current-app-trial.png) |
| Save preset → apply → terminate/relaunch | Preset persists, trial does not; the saved preset is then deleted | [Relaunch](preset-relaunch.png) |

`LabDisplayTests` covers temporary/persistent separation, monotonic expiry and
replacement, corruption recovery, disabled builds, accessibility floors,
explicit preference scope and isolated synthetic identity/review state.

The final catalog journey passed in
`/tmp/talent-signal-lab-v2/appearance-catalog-final.xcresult`. The current
AX5 and apply/restore/relaunch journeys passed in
`appearance-native-verified.xcresult`; that aggregate also contains an earlier
catalog dismissal-acknowledgement failure, which the focused catalog run
resolves. The final passing harness taps the observed close target and verifies the
return destination. Numeric geometry checks allow 0.001 points for binary
floating-point subtraction; the actual target remains 44 points. Screenshots
wait for the product's page crossfade to finish.

Twelve signed unit checks and the offline tools/sign-in journeys passed in
`appearance-offline-final.xcresult`. The Release Simulator build passed from
`/tmp/talent-signal-lab-v2/appearance-source-verified`, with the source hashes in
[source-manifest.json](source-manifest.json) and build log
`/tmp/talent-signal-lab-v2/appearance-release-final.log`. The compiled device
Lab flag is `NO`. The recorded main privacy manifest passed `plutil` validation.
The snapshot avoided concurrent calendar edits observed during the first live
Release build. Its final refresh includes the display capability gates, current
localization catalog and tested close helper; no unrelated source was reverted. Current-workspace localization
also passed with 1,724 catalog keys. See [the review packet](review.json).
A comprehensive VoiceOver, physical-device performance, online outcome or
hosted CI validation is not claimed here. No deployment or TestFlight upload
has occurred.
