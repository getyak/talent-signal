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

## Repair and proof required

The first follow-up added only `ARCHS=arm64` to the existing CodeQL `xcodebuild` command.
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
coverage. The first single-architecture run did not establish successful completion.

[The single-architecture dispatch](https://github.com/getyak/talent-signal/actions/runs/34139666155)
ran on reviewed head `bda5b7a8843d9748a858d5dfe3e9f7a50ee4842b`. Its full
Release build again reached the 45-minute job limit: Build was cancelled at
16:27:55Z, Analyze was skipped and Security required failed. Live logs showed
arm64 compilation progressing through Markdown, Live Activity, Share and the
main app; there is no successful analysis to infer. All ordinary PR checks,
including iOS smoke, passed, but they did not satisfy this separate requirement.

The next change raises only the Swift job's bounded timeout from 45 to 90
minutes. The completed runs establish that 45 minutes is insufficient; 90 is a
maximum allowance for completing the current build and analysis, not a predicted
completion time. This preserves the original compiler optimization and source
conditions. It costs additional hosted macOS time if the scan needs it, and a
continued stall can still exhaust the new bound. Independent review and a new
exact-head dispatch remain mandatory; the timeout change itself is no proof.

Investigation also found a reported traced package-resolution pause on the same
runner/Xcode family, with an explicit counterexample to pre-resolving packages.
[Upstream report](https://github.com/github/codeql/issues/22121).
The [macOS tracer discussion](https://github.com/github/codeql/issues/22275)
acknowledges additional toolchain tracing cost, but does not diagnose this
project's exact pause. No pre-resolution, object-cache, runner or compiler-mode
change is combined with this timeout adjustment.

The subsequent PR CI on `d7d18c46` exposed a separate test harness deadline:
the private-demonstration source-binding lifecycle case exceeded Vitest's
default five seconds, while the other 200 runner tests passed. The case runs
four trials with two repetitions, SQLite persistence, observation retries and
source withdrawal using fake provider/backend/Opik transports. Its test-only
deadline is increased to 30 seconds; product request deadlines, trial counts
and all source-provenance, no-retransmission and deletion assertions remain.
No test is skipped or retried. The complete runner suite and latest-head hosted
checks must pass after this focused harness correction.

Independent review must inspect the updated actual diff. Before merge, run the
existing Security workflow explicitly on the exact branch head because Swift
is intentionally ineligible on pull-request events. Require all three targets
to compile for arm64, successful build and extraction, successful Analyze and
processing of the real `/language:swift` result, plus the required Security gate.
Repeat the eligible security check on main after merge. A skipped job, failed-run
SARIF or local build alone cannot satisfy that evidence.
