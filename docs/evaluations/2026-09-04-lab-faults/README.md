# Isolated fault testing

## Outcome and boundary

Internal iOS Lab now reproduces seven named fault conditions through the
actual workspace client, JSON decoder, store and compiled People/Today pages.
A tester can inspect failed reads, retry, stop injection, cancel a delayed
read, inspect its request trace and compare the healthy fixture. The current
contract is in the [iOS README](../../../apps/ios/README.md#talent-signal-lab).

The fixture uses one synthetic person, pursuit and proposal. Its dedicated
session accepts only fixed read routes, synthetic credentials and an
unsupported-by-default URL scheme. Unexpected hosts, methods, bodies or
credentials are rejected before dispatch. No global protocol registration,
normal-session change, real account, backend database, provider call, source
upload or external business write is involved.

The [session-local protocol mechanism](https://developer.apple.com/documentation/foundation/urlsessionconfiguration/protocolclasses)
provides response delivery through the real URLSession client. The custom
scheme additionally prevents accidental HTTP or DNS fallback. Timing from
this path is explicitly marked synthetic in diagnostic reports; successful
fixture delivery is not evidence of backend health or model quality.

## Native behavior

The one-shot 401, 429, 500 and interrupted-response presets target the People
read once; parallel workspace reads cannot consume the fault unpredictably.
An interrupted response delivers a JSON prefix and a transport failure; that
partial input must never become a workspace. Offline and latency presets can
be stopped. Expiry uses monotonic time and prevents new injection; an already
delayed request may finish. Stop/background cancels the current read. Close
cancels and disposes the session, with scoped identity preventing an old view
from closing a newer test. Nothing restores after relaunch.

The expired-evidence fixture preserves the source observation timestamp while
removing its authority. It exposed an actual product rendering defect: Today
showed the timestamp and hid the unavailable reference. Both primary and
continuation summaries now give unavailable/partial evidence priority over
freshness. The native journey compares the same proposal before and after
stopping the fault. Review remains a human decision; the fixture has no write
or model capability.

Large Dynamic Type uses vertically arranged actions and expandable details.
The close and trace controls keep explicit 44-point targets. Failure/retry
copy identifies the synthetic read. The request trace is bounded to 120 events
and reports HTTP status separately from delivery, interruption or cancellation.

## Verification

Device: iPhone 17 Pro Simulator, iOS 26.5, Xcode 26.6; deployment target iOS 16.

Nine signed fault tests and the existing eight signed diagnostic/network tests
passed in `/tmp/talent-signal-lab-v2/faults-verified.xcresult`. They cover one-shot
recovery, partial JSON rejection, monotonic expiry, evidence restoration,
cancelled trace settlement, delayed-read close, credential/origin rejection,
normal-session preservation, disabled capability, synthetic diagnostic origin
and stale-view identity. The diagnostic checks retain their actual loopback
metrics/redirect and protected-file coverage.

Three native journeys passed in the same bundle:

| Journey | Observed evidence |
| --- | --- |
| 401/429/500/interrupted reads → failure → retry → real People page; open/close trace | [HTTP 500](server-error.png), [relative request timeline](request-trace.png) |
| Offline → stop → reload; latency preview close; unavailable evidence → stop → same healthy proposal | [Unavailable reference](evidence-unavailable.png), [restored authority](evidence-restored.png) |
| Chinese AX5 → failure → background → stopped fault → healthy read → usable configuration page | [Failure controls](chinese-ax5.png), [background recovery](background-recovery.png) |

The final relative-offset label was read back in a focused rerun of the
one-shot/trace journey, `faults-trace-final.xcresult`. It passed; the trace image
comes from this final run. The first failed run, `faults-native-ui.xcresult`,
is retained as development evidence. Its screenshots exposed the real Today
freshness/authority defect and large-type truncation. Two harness corrections
wait for background-stop readback and the visible return control, rather than
an immediate transition or virtualized off-screen picker. The passing journeys
also verify actual 44-point close/retry/reload target geometry and tap actions.

The 174-file [source manifest](source-manifest.json) matches the working tree
and snapshot under `/tmp/talent-signal-lab-v2/faults-source-verified`.
The final Release Simulator build passed in `faults-release-final.log`; its
compiled public device-Lab flag is `NO`. Localization passed with 1,866 catalog
keys; documentation and whitespace checks passed. Temporary xcresults, source snapshots and
fixture screenshots are classified development artifacts. No test backend or
database remains to clean up; fault sessions are disposed in the tested flows.

## Limits and remaining work

These fixtures exercise the real read transport/decoder/store/rendering loop.
They do not simulate system permissions, a true server-side rate limiter,
a production authentication expiry, model streaming or external write recovery.
The interrupted payload is a workspace JSON response, not an Agent stream.
No model quality or physical-device performance claim follows from these tests.
Full VoiceOver, older iOS and small-device coverage remain unverified here.

Automatic product/server-stage correlation, MetricKit history, durable reset
flows, test workspaces, online observations, image/Agent batches, Web review
and hosted CI remain in the [complete plan](../../../plans/2026-09-04-lab-complete-runtime.md).
No TestFlight upload or deployment was performed.
