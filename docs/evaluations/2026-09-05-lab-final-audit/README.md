# iOS Lab source-delivery audit

Date: 2026-09-05. Scope: the iOS Lab source and Simulator milestone in the Lab
V2 design. This audit consolidates independently retained milestones rather
than treating one build or one model response as proof of the whole product.

## Outcome

The iOS Lab now shortens the intended loop: identify a product question, freeze
conditions, change a bounded variable, run the real product path, inspect
execution and product outcome, save a failure as regression evidence, and
restore the default. Device tools remain available from the signed-out or
offline entry while remote experiments stay capability-gated.

The first screen is organized around user tasks rather than infrastructure:
improve the product, inspect this build, diagnose this device, or restart a
test. It uses native navigation, compiled product components, clear scope copy,
fixed recovery actions, and explicit unavailable states.

## Requirement audit

| User outcome | Delivered behavior | Evidence |
| --- | --- | --- |
| Know what is running | App/build/device, endpoint, workspace, backend and prompt revisions, latest actual run, and last verification | [First delivery](../2026-09-04-lab-v2/README.md) |
| Compare real model behavior | Frozen synthetic cases, admitted real providers, A/B output, hard checks, duration/usage, human verdict, budgets, cancellation and recovery | [Batches](../2026-09-04-lab-batches/README.md) |
| Try a model in the product | Task-specific model and prompt selection for one authenticated sign-in, actual requested/resolved/model receipts, product adoption, expiry and rollback | [Session trials](../2026-09-04-lab-task-trials/README.md) |
| Observe whether a trial helps | Frozen question/window/sample/guardrail plan, unique request samples, descriptive outcome summary, automatic stop and default restoration | [Controlled observation](../2026-09-05-lab-controlled-observation/README.md) |
| Switch backend/version safely | Approved target directory, TLS/identity/contract preflight, isolated credentials/drafts/recovery, generation-safe activation and rollback | [Runtime switching](../2026-09-04-lab-runtime/README.md) |
| Test without contaminating the main account | Server-created empty workspace, protected relaunch/return journal, persistent isolation banner, deletion and zero-row/session receipt | [Native workspace](../2026-09-05-lab-workspace-native/README.md) |
| Inspect appearance and page states | Real compiled pages, light/dark, language, Dynamic Type, density, motion/transparency/contrast responses, loading/empty/error/stale fixtures, restore paths | [Appearance](../2026-09-04-lab-appearance/README.md) |
| Diagnose slowness and failures | Guided recording, monotonic task timeline, request phases, frame/memory/thermal samples, server stages, reviewed sanitized export and bounded retention | [Diagnostics](../2026-09-04-lab-diagnostics/README.md), [stages](../2026-09-04-lab-stages/README.md) |
| Reproduce named failures | Seven isolated transport presets with expiry and no real-network fallback | [Faults](../2026-09-04-lab-faults/README.md) |
| Inspect device performance history | Explicit MetricKit subscription, bounded typed projection, retention/deletion watermark and truthful unavailable states | [MetricKit](../2026-09-04-lab-metrickit/README.md) |
| Restart testing safely | Scoped cache/diagnostic/display/workspace steps, reviewed sign-out, resumable operation IDs, independent onboarding replay and Demo reset | [Reset](../2026-09-05-lab-reset/README.md), [Demo reset](../2026-09-05-lab-demo-reset/README.md) |
| Turn failures into durable checks | Immutable saved case, rerun, deletion, held-out separation and case-specific CI readback contract | [Regressions](../2026-09-04-lab-regressions/README.md), [CI contract](../2026-09-04-lab-ci/README.md) |

Migrations 040–045 own experiment definitions, session trials, durable jobs,
regressions, CI verification records, and isolated test workspaces. Runtime
switching and device-only state retain their own secure client boundaries.

## Final verification

- Backend typecheck passed. The backend suite passed 42 files and 302 tests.
- The controlled-observation database run passed 28 product-route checks with
  seven local fixture-provider requests and zero remote network calls.
- Seven focused task-trial tests passed, including tampered-plan and false
  causal-summary rejection.
- One signed 50.275-second `zh-Hans` product journey passed on iPhone 17 Pro,
  iOS 26.5, with zero failures or skips. It exercised configuration, activation,
  a normal product answer, actual execution, summary, and rollback.
- Fifteen Fault and MetricKit tests passed after removing all Lab-specific
  Swift 6 isolation warnings.
- The final Release Simulator build passed. Its compiled public device-Lab flag
  is `NO`; internal distribution remains an explicit build/release decision.
- Localization passed with 2,240 catalog keys. Documentation and architecture
  checks passed with 434 Markdown files. `git diff --check` passed.

The full proof index is [audit.json](audit.json). The active implementation plan
is [Complete Lab implementation](../../../plans/2026-09-04-lab-complete-runtime.md).

## Remaining full-design work and release gates

This source delivery did not publish a build. TestFlight and production require
an approved target directory, secrets, migrations, internal entitlement or
server capability, deployment manifest, and a separate rollout receipt.

Physical-device Keychain, speech cancellation, MetricKit callbacks, and live
object-store deletion still need direct device/deployment evidence. The CI UI
truthfully reports local or stale artifacts as unverified until one saved case
is consumed by the trusted hosted workflow for a published revision. At this
audit checkpoint, large Web batch review, controlled feature overrides,
image/Agent batch parity, missing automatic diagnostic stages, and randomized
online assignment remained full-design work. Current-session observation deliberately keeps
`online_assignment=false` and never reports causal improvement.

These gates constrain release claims; they are not hidden source features or
simulated successes.

Subsequent source-delivery milestones completed the Web batch workbench,
controlled feature override, [image and Workspace Agent batch parity](../2026-09-05-lab-batch-task-parity/README.md),
and [automatic capture, audio, and presentation stages](../2026-09-05-lab-automatic-stages/README.md).
The current requirement state lives in the implementation plan linked above.
Online assignment remains a separate extension rather than an incomplete part
of current-session observation.
