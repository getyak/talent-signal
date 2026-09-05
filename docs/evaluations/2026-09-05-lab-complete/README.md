# Complete iOS Lab source and Simulator delivery

## Outcome

The iOS Lab now provides a complete internal product-improvement loop for the
source and Simulator boundary: inspect the active product/runtime, choose a
bounded product question, select an admitted backend/model/prompt or feature
variant, run the real product path on frozen synthetic evidence, review actual
execution and outcome receipts, save failures as immutable regressions, and
restore the default state.

The first screen routes people by intent: improve the product, inspect this
build, diagnose this device, or restart a test. Appearance controls, page-state
fixtures, named transport failures, MetricKit history, protected reset and
onboarding replay, temporary test workspaces, and reversible current-session
trials remain separate tools within that workflow.

## Delivered product paths

| Product question | Implemented path | Evidence |
| --- | --- | --- |
| Does a model or prompt improve relationship understanding? | Durable text and image batches with frozen cases, repetitions, budgets, hard checks, human review, cancellation and unknown-result recovery | [Text batches](../2026-09-04-lab-batches/README.md), [image parity](../2026-09-05-lab-batch-task-parity/README.md) |
| Does the Workspace Agent behave safely? | The exact product Agent core runs against a read-only synthetic contact directory; its only admitted tool is contact_workspace and business writes remain zero | [Agent parity](../2026-09-05-lab-batch-task-parity/README.md) |
| Does a candidate product configuration help in normal use? | Authenticated session-only model/prompt trials, a closed feature-override catalog, frozen adoption receipts, observation windows, guardrail stops, expiry and rollback | [Session trials](../2026-09-04-lab-task-trials/README.md), [feature overrides](../2026-09-05-lab-feature-overrides/README.md), [controlled observation](../2026-09-05-lab-controlled-observation/README.md) |
| What build and backend are active? | Build, device, endpoint, workspace, backend/prompt revision, actual-run receipt, approved target preflight, isolated credentials/state and rollback | [First delivery](../2026-09-04-lab-v2/README.md), [runtime switching](../2026-09-04-lab-runtime/README.md) |
| Why is a task slow or failing? | Guided diagnostics with request stages, capture/audio/transcription stages, frame/memory/thermal samples, server stages, named faults, sanitized export and bounded retention | [Diagnostics](../2026-09-04-lab-diagnostics/README.md), [automatic stages](../2026-09-05-lab-automatic-stages/README.md) |
| How can a tester start cleanly? | Scoped cache and diagnostics reset, display restore, exact-session sign-out, onboarding replay, synthetic Demo reset, empty test workspace, resumable recovery and verified deletion | [Reset](../2026-09-05-lab-reset/README.md), [Demo reset](../2026-09-05-lab-demo-reset/README.md), [test workspace](../2026-09-05-lab-workspace-native/README.md) |
| Can a failure prevent recurrence? | Immutable saved regressions, held-out separation, rerun/delete, Web review and a read-only case-specific CI consumption contract | [Regressions](../2026-09-04-lab-regressions/README.md), [Web review](../2026-09-05-lab-web-batch/README.md), [CI contract](../2026-09-04-lab-ci/README.md) |

Image inputs retain only a registered synthetic fixture ID and SHA-256 digest
in durable job/regression state. Bytes are materialized only at admitted
provider dispatch. Agent receipts distinguish remote execution from a
local_only product decision after a read-only tool result. The implementation
never promotes either result to confirmed candidate state or grants external
write authority.

## Final verification

The machine-readable [verification record](verification.json) retains the final
gate results and release boundary.

- The full backend suite passed 42 files and 306 tests. Focused batch tests
  passed 25 tests, and the evaluation package passed 22 tests.
- The disposable PostgreSQL/Fastify parity evaluation completed image and Agent
  source jobs, regression reruns, and CI consumption with eight local
  deterministic provider-adapter requests and zero external provider calls.
- The Web workbench passed lint, type checking, 53 test files and 318 tests; one
  file and one test remain intentionally skipped.
- The affected iOS suite passed 58 tests. The signed image/Agent picker journey
  and the persisted automatic-diagnostics journey each passed on iPhone 17 Pro
  Simulator, iOS 26.5.
- The final iOS Release Simulator build passed. Its compiled
  TalentSignalDeviceLabEnabled value is NO, preserving the public-build
  boundary.
- Localization, canonical documentation, architecture diagrams, source-proof
  hashes and whitespace checks passed.

The retained native views include the
[image configuration](../2026-09-05-lab-batch-task-parity/image-configuration.png),
[Agent cases](../2026-09-05-lab-batch-task-parity/agent-cases.png), and
[automatic audio/presentation stages](../2026-09-05-lab-automatic-stages/audio-presentation-stages.png).

## Release boundary

No TestFlight or production build was published. The local provider proof
exercises the real adapter and product lifecycle with a deterministic upstream;
it is not an external-model quality or availability claim. Physical-device
Keychain, microphone/audio-session, MetricKit callback, GPU/CPU/hang, deployed
storage, external-provider, and hosted case-specific CI evidence remain release
checks. Online assignment is a separate product extension; current-session
observation remains descriptive and has no causal authority.
