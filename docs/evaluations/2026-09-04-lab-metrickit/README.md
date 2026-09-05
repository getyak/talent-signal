# MetricKit history

## Outcome and authority

Internal iOS Lab now has a historical system-summary surface beside explicit
task recordings. A physical-device tester can start reception, pause it, inspect
retained summaries, review a single-summary export and clear local history.
The Simulator exposes a labeled synthetic layout preview and the real
unavailable-delivery state. The current product contract is in the
[iOS README](../../../apps/ios/README.md#talent-signal-lab).

The adapter uses the local Xcode 26.6 SDK's public `MXMetricManagerSubscriber`
APIs. Apple's [manager documentation](https://developer.apple.com/documentation/metrickit/mxmetricmanager)
distinguishes daily metric delivery by source from diagnostic delivery when
available, and requires a physical device for actual callback testing. Its
[past diagnostics API](https://developer.apple.com/documentation/metrickit/mxmetricmanager/pastdiagnosticpayloads)
only covers the manager's current lifetime. The app's own saved summaries
therefore own cross-process history; a refresh cannot force a new system report.

Reception is explicit, lasts no longer than 24 hours in the current app process,
and ends on pause, account/environment change or expiry. Relaunch never resumes
it. The system may retain reports separately; removing the app's subscription
does not claim to delete those reports or stop all OS-level measurement.

## Data lifecycle

The public SDK adapter reads typed properties directly. It does not call raw
payload JSON conversion or retain metadata, signposts, exception messages or
call stacks. The projection holds available cumulative timing/memory metrics,
first-draw/hang histogram buckets, diagnostic-entry counts, a reported time
window and admitted app-version fields. Unknown values remain absent. The UI
shows unavailable values, multi-version windows and synthetic origin explicitly.
CPU time is cumulative rather than a utilization percentage; first draw is not
workspace readiness; diagnostic entries are not a crash-free-rate denominator.

The archive holds at most 20 summaries covering seven days, at most 64 buckets
per histogram and at most 1 MB after encoding. Protected app-private writes are
atomic, excluded from backup and read back. A stable hash of only the typed
projection deduplicates repeated delivery without persisting a raw payload hash.
This counts retained summaries rather than claiming every original OS payload
is individually represented. Identical projections are one retained summary.

Pause and clear invalidate queued callback generations. Clear atomically
replaces summaries with a minimal deletion watermark; subsequent subscriptions
cannot restore system-held payloads ending at or before that boundary. The
watermark also survives relaunch and ages out of retention. Failure preserves
the preceding file and a visible retry path. Corrupt storage cannot be replaced
by starting reception or preparing an export. Separate exported files and
system-held reports have independent deletion ownership.

## Verification and limits

Six signed checks passed in `metrics-final.xcresult` under
`/tmp/talent-signal-lab-v2`. They cover explicit subscription, duplicate delivery,
missing fields, exact one-record export, no automatic relaunch subscription,
old/queued callback rejection, a persisted deletion watermark, monotonic expiry,
retention and count bounds, synthetic/future/stale rejection, storage failure,
corrupt-file preservation, failed clear, disabled/Simulator gating, and a full
protected-file roundtrip with twenty two-histogram summaries.

The English native flow passed: sign-in Lab → performance → history → real
Simulator unavailable state → synthetic preview/distribution → relaunch → still
no measured history. Chinese AX5 origin text and the return action also passed. Both final native
journeys are in `metrics-ui-final.xcresult`; time-window fields use paired,
localized start/end rows. A first Chinese run failed because the harness
tried to tap a virtualized off-screen diagnostic row; the corrected helper
scrolls until that existing row is actionable. This was not a system-report
or product-data failure.

The tests inject typed projections into an isolated test receiver. They do not
prove `MXMetricManager` delivered a real report. The SDK adapter compiled, but
physical-device callbacks, actual system histogram values, and a real received
summary's native export remain unverified. The synthetic preview does not offer
an export and never enters saved history. No provider call, database, source
upload, external business write, deployment or TestFlight upload occurred.

Physical-device acceptance remains explicit: use an internal device build,
start reception, observe an actual callback and its declared report window,
inspect available/absent values, pause, export/read back that exact summary,
then clear/relaunch/re-enable and confirm old payloads do not return. Xcode's
injected development reports must be labeled development evidence separately
from naturally delivered usage reports. Do not infer real-world performance
from this Simulator evaluation.


## Native artifacts

| Surface | Evidence |
| --- | --- |
| Simulator delivery unavailable and no measured history | [Unavailable](unavailable.png) |
| Explicit synthetic authority, version window and missing values | [Summary preview](synthetic-summary.png) |
| Histogram ranges and observation counts | [Distribution](synthetic-distribution.png) |
| Chinese AX5 unavailable state and synthetic provenance | [History](chinese-ax5.png), [example](chinese-example.png) |

The 186-file [source manifest](source-manifest.json) identifies the immutable
iOS snapshot under `/tmp/talent-signal-lab-v2/metrics-source-verified`. The final Release Simulator build passed in `metrics-release-final.log`; all
186 captured files matched the working tree and the compiled public device-Lab
flag is NO. Localization passed with 1,958 keys, documentation with 421 Markdown
files, and whitespace checks passed. The final count-label wording avoids an
English singular/plural mismatch; the saved screenshots precede that text-only
adjustment. The accompanying [review](review.json) records these gates. The
xcresults, source snapshots and synthetic screenshots are local development
artifacts. No proof service or database was started for this milestone.
