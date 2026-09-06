# Guided device diagnostics

## Outcome and scope

An internal iOS tester can choose a task, explicitly start recording, reproduce
it in the actual app, mark observations, stop, inspect a typed report and review
an export. The normal runtime networking boundary supplies real request timing.
The app samples its own physical footprint, thermal/power state and display-link
callback cadence. This implements the guided capture portion of the
[full Lab plan](../../../plans/2026-09-04-lab-complete-runtime.md); named fault
adapters and automatic product/server stage correlation remain outstanding.

All native proof uses the synthetic workspace or an unavailable loopback
backend. The network integration test owns an ephemeral loopback TCP listener,
serves two synthetic responses, and cancels it in teardown. No real candidate
input, backend database, provider call, external business write, hosted CI,
TestFlight upload or deployment is part of this milestone.

## Behavior and lifecycle

The current contract lives in the [iOS README](../../../apps/ios/README.md#talent-signal-lab)
and [ADR 0012](../../decisions/0012-useful-device-lab-and-real-experiments.md).
Reports use closed vocabularies for task, route, method, result and markers.
Only relative monotonic timing and numeric measurements reach storage; full
URLs, headers, credentials, bodies, source material and raw errors have no
fields in the report. Recording is explicit and bounded to ten minutes.

Late results carry their original session/request identity and cannot update a
new recording, a stopped report or a deleted result. Background and context
changes stop capture; six-second checkpoints recover as interrupted after
relaunch. Missing completions remain unfinished. Protected atomic storage has
readback, size/count limits, backup exclusion and verified deletion. Failed
storage stops capture and offers a retry; corrupt data cannot be replaced by
starting or exporting an old in-memory report. Reports expire after 24 hours,
with pruning on launch, foreground and Lab access. Independent exported files
have a separate lifecycle and a report-specific filename.

## Verification

Device: iPhone 17 Pro Simulator, iOS 26.5, Xcode 26.6; minimum target iOS 16.

Eight signed unit/integration checks passed in
`/tmp/talent-signal-lab-v2/diagnostics-verified.xcresult`:

- request sanitization and late cross-session results;
- event bounds, monotonic expiry and unfinished attempts;
- checkpoint recovery and deletion after stop;
- background/context changes and retry after storage failure;
- retention, bounded export and corruption preservation;
- disabled-build exclusion from capture and storage;
- actual protected-file roundtrip, backup exclusion and deletion;
- real URLSession response-phase timing and HTTP redirect rejection.

The loopback proof observes its deliberate response wait in URLSession metrics,
then receives an unfollowed 302 response through the per-task metrics delegate.
This verifies the actual networking path, not a hand-authored metric fixture.

Two native journeys passed in the same bundle:

| Journey | Evidence |
| --- | --- |
| Record → use People → mark problem → stop → inspect samples and exact JSON → relaunch | [Active app](active-workspace.png), [report](report.png), [JSON review](reviewed-json.png), [restored report](restored-report.png) |
| Start from sign-in → failed loopback health probe → background → review stopped report | [Offline/background report](offline-background.png) |

The first UI run exposed an approximately 20-point accessible stop target.
Explicit content shapes now cover both 44-point banner controls; the passing
journey verifies the stop target and reachable workspace navigation. Review
screenshots show actual sampled values, not performance targets or claims of
improvement. The system file-picker journey passed separately in
`/tmp/talent-signal-lab-v2/diagnostics-export-final.xcresult`: a report-specific JSON
file was saved through Files and read back byte-for-byte before the app
reported success. See [the picker](file-picker.png) and
[verified save](file-verified.png). This creates an independent synthetic file
in the owned Simulator; the app does not submit an issue. The screenshot
retains the longer inline title; final source shortens that label to “Review
export” without changing the verified controls or file operation. The final Release
Simulator build passed in `diagnostics-release-verified.log`, from the
167-file snapshot under `/tmp/talent-signal-lab-v2/diagnostics-source-verified`.
The [source manifest](source-manifest.json) was verified, and all diagnostic
source/test files and their runtime integration points match the working tree.
The compiled public device-tools flag is `NO`; privacy-manifest validation,
localization (1,809 keys), documentation and whitespace checks passed.

## Measurement meaning

[CADisplayLink](https://developer.apple.com/documentation/quartzcore/cadisplaylink)
callbacks measure main-run-loop cadence; they do not establish rendered FPS,
GPU work or the cause of a frame delay. Physical footprint and thermal state
are sampled observations, not leak or CPU diagnoses. The report identifies
Simulator measurements and instructs testers to compare matching device,
power, appearance and cache conditions.

[URLSession task metrics](https://developer.apple.com/documentation/foundation/urlsessiontaskdelegate/urlsession(_:task:didfinishcollecting:))
provide available transaction phases. Missing phases remain unavailable. TLS
can overlap connection duration, so phases must not be summed. Server/model
stages and final UI usability require separate evidence. Manual task markers
are explicitly the tester's observation, not automatic completion signals.
`LabDiagnosticSession` and `LabDiagnosticMarker` signposts support a separate
Instruments investigation. Sampling/checkpoint work is measured; total
instrumentation overhead is not claimed.

The privacy manifest declares the in-app elapsed-time reason for Lab's existing
`systemUptime` use, following Apple's
[required-reason definitions](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitypereasons).
No absolute uptime is exported. This is a narrow API declaration, not a full
privacy-manifest or regulatory certification.

Physical-device performance, comprehensive VoiceOver/accessibility, MetricKit
history, automatic server traces and causal attribution are not established by
these checks. The full Lab goal remains active.
