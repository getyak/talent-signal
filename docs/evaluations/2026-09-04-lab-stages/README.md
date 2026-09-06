# Automatic client and server diagnostic stages

## Outcome and boundary

Internal iOS Lab can connect a client operation, its HTTP attempts and the
backend stages returned for each attempt. The report survives restart and its
reviewed JSON preserves the same request identity. This helps a tester locate
an observed interval without inventing first-token, rendering or causal claims.
The current capture and retention contract is in the
[iOS README](../../../apps/ios/README.md#talent-signal-lab).

Client task-local spans cover workspace reads, relationship/conversation tasks,
image research, media upload, common body encoding/JSON decoding and workspace
state publication. A request links to its current operation. Concurrent reads
keep distinct parents; cancellation is not completion. Store publication does
not establish that a frame rendered or the task became usable.

Backend capture uses Fastify request lifecycle hooks and async-local context
established after body parsing. Capture exists only with the internal capability
and a valid request UUID; a response returns typed metadata only for
authenticated work or exact read-only health routes. Context loading, model
adapters, Agent tools/schema validation, database connection wait and commit are
wrapped at their existing code boundaries. Labels, durations and relative offsets
are the only stage fields. Arguments, SQL, errors and provider output have no
field and are not logged or persisted by this collector. See the
[Fastify hook lifecycle](https://fastify.dev/docs/v5.8.x/Reference/Hooks/).

The client validates a bounded base64url envelope, matching UUID, version,
closed origin/stage enums and time consistency before retention. Invalid or
missing metadata does not change the HTTP result. Server and client monotonic
clocks remain separate; nested intervals may overlap. The current provider
adapter returns a complete result, so its duration is not first-token latency.

## Native evidence

Device: iPhone 17 Pro Simulator, iOS 26.5, Xcode 26.6; deployment target iOS 16.

The final native journey opens Lab from sign-in, starts recording, performs a
loopback health probe, stops, reviews the client operation and matching server
trace, inspects the exported JSON, terminates the app and restores that exact
report. It asserts that the request belongs to the completed health-probe
client span and the server UUID matches the request UUID.

| Observed surface | Evidence |
| --- | --- |
| Completed client operation and its request | [Client timeline](client-operation.png) |
| Matching server origin, interval and model-adapter stage | [Server detail](server-stages.png) |
| Exact reviewed report JSON | [Export preview](reviewed-export.png) |
| Same report after process restart | [Restored detail](restored-server.png) |

The proof service bound only `127.0.0.1:4340`. It used the real unscoped product
adapter with a local synthetic provider and an explicit `synthetic_fixture`
trace origin. This special proof endpoint does not describe normal readiness
semantics or real model speed. Its final readback counted two probes across
the initial and final native runs, zero external model calls and zero business
writes. It required no database and was stopped after verification.

## Focused checks

The final `stages-final.xcresult` under `/tmp/talent-signal-lab-v2` passed fifteen
signed checks and one native journey. Four client checks exercise actual
workspace reads/decoding/publication, concurrent ancestry, cancellation and
late/cross-session protection. Two server-envelope checks cover the product
networking boundary and malformed/mismatched metadata. Nine diagnostic checks
retain loopback URLSession metrics/redirect rejection, retention, recovery,
corrupt-file preservation, disabled capability and protected-file readback.

The new capacity check writes and reloads five reports, each with 160 requests,
16 server stages per request, 24 network phases, 120 client spans, 60 markers and
301 device samples. That complete archive fits the 6 MB cap. An oversized write
is rejected while preserving the preceding file. Earlier `stages-client-unit`
proof also passed the nine fault checks; these did not need a repeated native
fault run for the stage-only change.

Backend `stages-backend-final.log` passed 37 tests across the diagnostic collector,
chat provider, unscoped task and workspace Agent suites. Five collector tests
cover UUID isolation, authorization/capability gates, closed payloads, bounded
spans, error omission and the actual product adapter with a local provider.
Backend typechecking passed. These checks do not claim a real database or
external model request was traced in this milestone.

The 180-file [source manifest](source-manifest.json) identifies the immutable
iOS snapshot at `/tmp/talent-signal-lab-v2/stages-source-verified`.
All captured files matched the working tree at the stage handoff. The Release
Simulator build passed in `stages-release.log`; its compiled public device-Lab
flag is NO. Localization passed with 1,898 catalog keys, documentation with 420
Markdown files, and whitespace checks passed. The machine-readable
[review](review.json) records these gates.

## Remaining proof and coverage

The collector does not yet instrument every capture/audio preparation/rendering
path or detached worker. It does not provide streaming first-token measurements.
Actual database/provider stage timing, physical-device performance, full
VoiceOver, smaller-device and older-OS journeys remain unverified here. These
limits do not turn an absent stage into zero duration.

MetricKit history, durable reset/test-workspace flows, online observations,
image/Agent batches, Web review and hosted CI remain in the
[complete plan](../../../plans/2026-09-04-lab-complete-runtime.md).
No deployment, TestFlight upload or hosted CI run was performed. The xcresults,
source snapshots, copied synthetic screenshots and exported synthetic JSON are
classified local development artifacts.
