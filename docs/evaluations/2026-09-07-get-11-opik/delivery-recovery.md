# GET-11 delivery and Swift analysis recovery

Updated: 2026-09-08 (Asia/Shanghai). This records implementation delivery; funded optimization,
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

## Verified repair and remaining acceptance

[PR 155](https://github.com/getyak/talent-signal/pull/155) merged as
`2b712e62c7a4894ea60c7c1b398ecfc994d1c0e9` after final head
`1ebfa08ab23e5e1400ac24f64b10b84c34cea0b8` passed independent actual-diff
reviews, all applicable PR checks and a separately eligible real Swift scan.
The complete reviewed, tested and merged trees equal
`efdc436abe1321ba4720e8636ce19b1eefa5a08b`.
The [final validation receipt](https://github.com/getyak/talent-signal/pull/155#issuecomment-5574002321)
binds each check to that head.

[Final PR CI](https://github.com/getyak/talent-signal/actions/runs/34144484216)
passed all seven jobs. Independent completed-log inspection confirmed a
successful Release build, followed by 532 Debug unit tests and all nine
configured UI smoke tests, with zero failed or skipped cases. The full runner
suite passed 201 tests. These are the configured smoke and control-plane checks,
not paid-model or live candidate acceptance.

The Swift job in [actual Security](https://github.com/getyak/talent-signal/actions/runs/34144486125)
passed in 46m27s. Build succeeded at 17:28:30Z on 2026-09-07, upload processing
completed at 17:30:02Z and Security required passed at 17:30:18Z. Processed
analysis `1737157893` binds the final head with empty error/warning and zero
Swift results. Compile paths exactly match all 158 iOS product Swift files
across Sources, Shared, ShareExtension and LiveActivityExtension. The analyzer
reports 158 of 275 repository Swift files; the remaining 117 are iOS tests (69),
macOS files (47) and a documentation example (1). Release, `-O`, whole-module
optimization and all three targets remain present. This is arm64 simulator
product coverage, not every platform or branch condition. The analyzer reports
348 unresolved AST nodes out of 1,770,256 extracted nodes; their details were
unavailable, so complete AST resolution is not claimed. The branch has no new
alerts relative to the eight pre-existing baseline alerts; the PR merge ref
has no open alerts. Existing repository alerts are not claimed to be zero.

The [main CI](https://github.com/getyak/talent-signal/actions/runs/34148228404)
on `2b712e62` passed, including iOS smoke. Its eligible
[release classifier](https://github.com/getyak/talent-signal/actions/runs/34150103081)
verified the same SHA against trusted receipt v0.1.64 at 18:03:57Z and reported
`TestFlight release required: false`; archive, upload and finalize were skipped.
[Main Security](https://github.com/getyak/talent-signal/actions/runs/34148228407)
also passed. Its real Swift job completed in 41m18s: Build succeeded at
18:15:20Z, Swift finished at 18:17:02Z and Security required at 18:17:07Z.
Processed analysis `1737292249` binds the exact merge SHA with empty error and
warning and zero Swift results. This completes the required actual main scan;
the intentionally skipped PR-event Swift job was not used as its substitute.

The repair changes only CI, a test harness and documentation. The delivered
backend and TestFlight v0.1.64 remain bound to product implementation `5dffa3d3`;
no optimized candidate was deployed. GitHub's merge integration automatically
marked GET-11 Done at 17:35:18Z; its owner restored In Progress at 17:37:58Z
because GET-12/18/20/21 still have unobserved acceptance. GET-13/14/15/16/17/19
retain their six accepted results. Missing currency, per-run/monthly monetary
limits and candidate environment/workspace scope still prevent funded execution.
