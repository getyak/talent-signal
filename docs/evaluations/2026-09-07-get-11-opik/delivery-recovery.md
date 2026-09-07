# GET-11 delivery and Swift analysis recovery

Date: 2026-09-07. This records implementation delivery; funded optimization,
candidate exposure and post-candidate-release observations remain unverified.

## Delivered baseline

[PR 153](https://github.com/getyak/talent-signal/pull/153) merged as
`5dffa3d32dd41da79663afbd33faa28a00b85981`. Its final reviewed head was
`929468a8eaed7fd1732f9729650d9e31ef57fce0`; their complete trees match.
The final PR CI and applicable JavaScript/Actions CodeQL analyses passed.
The [baseline deployment receipt](https://github.com/getyak/talent-signal/pull/153#issuecomment-5572404773)
records 35 passing readback checks. The separate installed-artifact check is
not authenticated configuration readback from the running API. The real
deployment's synthetic Chat/ASR health probes are distinct from the 35 read-only
checks; the deployment is not claimed to have made zero provider requests.

[Main CI](https://github.com/getyak/talent-signal/actions/runs/34134788085)
passed, including iOS smoke. [Release iOS](https://github.com/getyak/talent-signal/actions/runs/34137872076)
completed successfully. The [v0.1.64 release](https://github.com/getyak/talent-signal/releases/tag/v0.1.64)
receipt binds build `20260907152335` to the same merge SHA and workflow. Its
`testflightState` is `processed` at `2026-09-07T15:36:13Z`; the annotated tag
independently resolves to that SHA. Receipt SHA-256:
`edbade12e65d059e016e6b501173114f5e6c0b99ee94493e42e3fa5222dc3011`.
This proves exact-build processing, not a particular tester's access.
GET-13/14/15/16/17/19 are Done
with acceptance receipts. GET-12's monetary and candidate-exposure parameters
remain missing; GET-18/20/21 and GET-11 retain their actual live acceptance work.

## Observed security failure

[Main Security](https://github.com/getyak/talent-signal/actions/runs/34134788084)
failed its required gate after the Swift job exceeded 45 minutes. Build ran
from 14:47:58Z to 15:32:04Z and was cancelled; Analyze was skipped. No successful
Swift extraction or processed analysis is inferred from this run. The completed
log contains both arm64 and x86_64 compilation of the app, Share and Live
Activity targets using Release, `-O` and whole-module optimization. The main
target only entered compilation after 15:20Z. The earlier
[run 34100392600](https://github.com/getyak/talent-signal/actions/runs/34100392600)
also timed out during duplicate architecture compilation. The intervening
successful Security run skipped Swift and is not a passing Swift baseline.

## Narrow repair and proof required

The follow-up adds only `ARCHS=arm64` to the existing CodeQL `xcodebuild` command.
[GitHub recommends a single architecture for Swift analysis](https://docs.github.com/en/code-security/reference/code-scanning/codeql/build-options-for-compiled-languages#customizing-swift-compilation-in-a-codeql-analysis-workflow).
Use Apple's `ARCHS` build setting, confirmed by local resolved settings, rather
than relying on `ONLY_ACTIVE_ARCH`, which generic destinations ignore.
[Apple build settings](https://developer.apple.com/documentation/xcode/build-settings-reference)
define those controls.

Release conditions, optimization, the complete scheme, clean build, manual
extraction, `security-extended`, Analyze, event policy and required gate remain
unchanged. The source scan found no architecture conditional directives in
project Swift files. Debug would change authentication branches, so it is not
an equivalent analysis configuration. This keeps the existing simulator
coverage boundary; it does not claim device-only or x86-specific dependency
coverage. No numerical speedup is established before a hosted run.

Independent review must inspect the actual diff. Before merge, run the existing
Security workflow explicitly on the branch because Swift is intentionally
ineligible on pull-request events. Require all three targets to compile for
arm64, successful build and extraction, successful Analyze and processing of
the real `/language:swift` result, plus the required Security gate. Repeat the
eligible security check on main after merge. A skipped job, failed-run SARIF or
local build alone cannot satisfy that evidence.
