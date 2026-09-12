# GET-9 private browser executor — 2026-09-12

Status: implementation and live transport evidence, not completed production
admission. PR178 remains open; iOS acceptance and release gates remain unmet.

## Outcome and boundary

The production research service now requires a private browse-only RPC instead
of receiving Docker access. The trusted Mac executor starts network-none,
uncredentialed Chromium workers in the dedicated daemon. Its process still has
host-user filesystem privileges; this is not a sandbox for the trusted broker.
Configuration and operational constraints live in the
[browser README](../../../apps/agent-host/browser/README.md).

The RPC accepts a discovered URL and opaque task/call/source/provider identity.
It carries no original conversation, image, candidate anchors or shell command.
The production caller fails closed without configuration. The executor acquires
one fixed loopback listener before orphan inspection, verifies daemon/image
identity, bounds bytes and deadlines, shares exact concurrent duplicates, and
keeps capacity until cancellation cleanup completes. Terminal records contain
hashes only and expire after five minutes.

## Observed evidence

- [Existing sidecar transport](completeness-executor-sidecar-first.json): the
  running `talent-signal-testflight-local-person-research-agent-1` made an
  authenticated request through the observed private Lima host route. Readiness
  returned200, unauthenticated readiness401, and real Chromium153.0.8010.12
  returned example.com in5.150seconds. Two public HTTP requests consumed559bytes.
  This used a bounded inline HTTP client in the existing container; its deployed
  application image/configuration was not replaced.
- [Execution boundaries](completeness-executor-boundaries-first.json):10/10.
  Two concurrent identical requests produced exactly one observed live worker
  and both returned success. A deadline conflict and terminal duplicate returned
 409. A second worker was observed before client cancellation; it disappeared,
  a fresh call succeeded, and final inventory contained zero browser workers.
- [Daemon admission](completeness-executor-daemon-admission-first.json): wrong
  daemon identity, absent image and absent socket all rejected; real daemon
  readiness then passed. The daemon was **not stopped**. This does not establish
  daemon-outage recovery or interrupted-cleanup restart behavior.
- Agent-host full suite:57/57 before the final readiness-race correction.
  Independent review found no P0/P1. It identified a P2 where cleanup health
  could change while readiness awaited Docker; the implementation now checks
  health again afterward and adds a deterministic regression case.
- [Source manifest](completeness-executor-source-manifest.json) records the
  post-correction source hashes. Live reports retain their original timing and
  are not rewritten as runs of the later health-only correction.

## Failures retained and remaining acceptance

The first launcher refused the macOS `__CF_USER_TEXT_ENCODING` variable; the
second exposed native image-library initialization variables. The check now
runs before importing those dependencies, with the macOS runtime variable
explicitly allowed. A third launch failed because Docker was outside the initial
PATH; the clean launcher now supplies its actual absolute CLI directory. The
fourth launch acquired readiness. These were startup failures, not successful
browser runs.

Still required: actual daemon outage/recovery; startup orphan cleanup after
interruption; source revocation before persistence through this RPC; deployment
of the reviewed caller/configuration with managed secrets and service lifecycle;
Web/iOS/installed Chrome acceptance; current-head CI, merge and exact processed
TestFlight/internal-group readback. The existing sidecar image has parallel Opik
changes and must be reconciled before deployment. None of these gates is implied
by the transport report or passing unit tests.

API references: [Node HTTP response close](https://nodejs.org/docs/latest-v24.x/api/http.html#event-close_2),
[Docker environment precedence](https://docs.docker.com/reference/cli/docker/#environment-variables).

## Later live recovery and revocation checks

The executor was rebuilt from `f72ac347` before these runs.
[Recovery trial 2](completeness-executor-recovery-second.json) passes14/14:
exactly one real worker was observed and paused, its executor was killed, the
worker remained, and a fresh executor removed that actual orphan before
readiness. A fresh browse then succeeded. The task-owned Colima profile was
stopped; readiness and browse both rejected with502. Restarting that same daemon
restored readiness in the same executor process, a new browse succeeded, and
final worker inventory was empty. Other Docker contexts were not stopped.
This covers idle daemon outage and process-loss orphan recovery, not daemon loss
while cleanup is in flight.

[Recovery trial 1](completeness-executor-recovery-first.json) remains failed:
the script incorrectly expected503 for a runtime readiness error. The existing
protocol and its unit test specify502. Its real outage rejected successfully,
but the incorrect assertion stopped the trial; the owned daemon was restored
before trial2. No service behavior was changed to satisfy this assertion.

[RPC source revocation trial 2](completeness-executor-revocation-second.json) passes10/10.
The retained [first trial](completeness-executor-revocation-first.json) passed9/9,
but review required an explicit no-result-returned-to-model assertion. Trial2
adds that gate and accurately names the stored-hash check.
A deterministic model drove a real product task through PostgreSQL, the Unix
research socket, the production RPC client, Chromium and public HTTPS. After
Chromium returned, the evaluation revoked that synthetic capture's source
receipt before returning the result to the backend checkpoint. The tool was
fenced with `CONTACT_TASK_LEASE_LOST`; readback showed a deleted task, empty
public sources, erased stored state/input, no confirmed state and no external
effects. The script is
[`evaluate-browser-rpc-revocation.mjs`](../../../scripts/evals/evaluate-browser-rpc-revocation.mjs).
Its controlled model/search do not establish model quality, real Exa calls or
installed-client acceptance. Managed production caller/service configuration,
active-cleanup daemon loss, client acceptance and release gates remain open.

[Real SDK through RPC](completeness-executor-product-first.json) passes12/12 in
73.652seconds. It uses the original synthetic image, real Claude Agent SDK,
product HTTP, Unix socket, private RPC, Chromium, public HTTPS and PostgreSQL
readback. Independent quality scores are task completion4, grounding3,
naturalness3, recovery not exercised. The answer correctly withholds career
facts but overstates the breadth of its negative search conclusion and repeats
information despite a brevity request. No recovery/delegation quality score is
claimed for this all-successful path. Search remains controlled.

The [Infisical readback](completeness-executor-secrets-readback.json) confirms
both exact executor configuration values at `staging:/agent-host`, without
printing either value. The manifest and TestFlight deployment contract now
require them. The existing running sidecar was not recreated; canonical secret
configuration is not managed service or deployed caller acceptance.
