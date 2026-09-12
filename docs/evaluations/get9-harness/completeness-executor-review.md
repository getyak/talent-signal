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
