# Conversation image execution diagnostics

## Incident evidence

Observed on the private Tailnet Web/macOS deployment at backend revision
`973e7913ee1908aaa0fea95417974f212ba6f463` on 2026-09-25.

- Admission returned HTTP 202 in 362 ms. The original PNG remained available
  and image readback returned HTTP 200.
- The queue claimed the message less than one second after admission. Its
  execution failed after 64.65 seconds with `MODEL_RUN_FAILED`.
- There was no matching local `product_runs` record. The HTTP monitoring hook
  covered synchronous task routes but not the background conversation runner.
- The deployed Opik policy did not include the affected account. A working
  transport or an unrelated trace cannot establish coverage for this run.
- The original exception was discarded by the unscoped execution fallback.
  A 60-second application deadline is a plausible cause, not a recovered error.

The actual image path persists the original decoded bytes at admission, then
passes base64 to a configured Ark inspection and to Claude. Both model stages,
SDK startup, tool calls and the final answer share the workspace deadline.
The durable queue is a recoverable execution record, not an image conversion
or upload wait. Removing it would not fix this model-stage failure.

## Safe live probes

Two generated images containing only artificial test text exercised the
installed image-inspection and Claude SDK code, with in-memory contact/memory
fixtures. No original user screenshot was replayed and no product record was
created by these probes.

| Probe | Ark inspection | Claude including SDK startup | Total | Result |
| --- | ---: | ---: | ---: | --- |
| Explicit short image summary | 7.68 s | 11.57 s | 19.29 s | Answer returned |
| Image-only default objective | 6.09 s | 13.34 s | 19.47 s | Answer returned |

These demonstrate that the configured providers can process a valid synthetic
image now. They do not reproduce the incident or establish production latency
percentiles. The second run reported one model response and no tool call; it
is not proof of contact-card creation.

## Deadline decision

Keep one cancellable execution deadline. It prevents indefinitely occupied
queue workers and bounds SDK/tool execution. HTTP admission and SSE reconnect
are separate lifetimes and do not require a 60-second model deadline.

Workspace Claude defaults to 180 seconds, configurable between 30 and 300
seconds. This is provisional operational headroom for the existing sequential
inspection/startup/tool path, not an empirically optimal percentile. The global
Agent budget, dollar, token, turn and tool limits are not expanded by this
change. Source invalidation and user cancellation still abort immediately.
Reconsider the value using captured stage timings and timeout rates.

## Verification state

The deadline tests exercise successful completion after 60 seconds, eventual
deadline expiry, and external cancellation using a controlled clock. Background
capture integration and delivery evidence are recorded in the associated plan.
Original incident root cause remains unrecoverable from its discarded exception.
