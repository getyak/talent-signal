# Lab V2 product design

Completed design-phase record. The owner subsequently approved the first
delivery; its implementation and proof are tracked in
[the delivery plan](2026-09-04-lab-v2-delivery.md).

## Outcome and scope

Design a useful internal iOS Lab that helps its owner improve the product through
real model experiments, environment inspection and switching, appearance review,
guided performance diagnosis, and scoped local reset/onboarding tasks.

This task produces a reviewable design and source-grounded recommendations. It
does not implement features, call paid models, change endpoints or accounts,
clear device state, or authorize production data for evaluation.

## Evidence and unknowns

- The current Lab uses five synthetic scenarios and predefined baseline/candidate
  outputs. Its backend persists real quality records but does not call a model
  when replaying those scenarios.
- Existing contracts and the native surface already cover session, run,
  comparison, inspection, issue receipt, and human Eval promotion.
- The user explicitly wants a broader product-improvement workspace, including
  backend/model selection and useful device debugging/recovery tasks.
- Backend deployment inventory, admitted model availability, and the installed
  device build have not been verified. The design must not imply availability.
- Current ADR 0011 remains accepted truth; the redesign is a proposal that would
  require an explicit successor decision when implementation is selected.

## Approach

Use current repository capabilities plus official documentation from evaluation,
native debugging, and performance tools. Separate repeatable product experiments
from device maintenance while giving both a coherent internal entry. Every
feature needs an input, a visible result, scope, and failure/recovery behavior.

Rejected direction: adding more static examples or undifferentiated debug toggles
without a measurable product decision or named recovery task.

## Milestones

1. Complete: inspect relevant capabilities and primary-source precedents.
2. Complete: write one design draft with journeys, switching semantics, evaluation
   validity, reset scopes, instrumentation limits, and prioritized slices.
3. Complete: review against REVIEW.md; run documentation checks; hand off the
   proposal with remaining decisions and no implementation claim.

## Completion evidence

- One linked draft in `_index/inbox/`, with observed facts separated from proposed
  behavior and external references.
- The design covers every requested capability and gives concrete acceptance
  examples, with sensible iOS/Web responsibilities.
- `pnpm wiki:test` and `pnpm docs:check` pass for the documentation changes.
- No unrelated user changes or production application code are modified.

## Design record

The [design draft](../_index/inbox/2026-09-04-lab-v2-product-design.md) owns the
proposal and references; this plan owns execution state.

Important implementation findings: native authentication currently owns an
immutable backend URL and a single current Keychain session record. Standalone
onboarding already offers replay/reset, but that is a separate Demo boundary.
The actual chat provider and provider-neutral Agent runtime exist outside the
fixed-output Lab. New work should connect these foundations rather than create
another independent inference implementation.

## Final verification

- The Chinese proposal covers all requested capabilities, nine official reference
  groups, a phased roadmap, concrete acceptance paths, and explicit limitations.
- Design-level review used REVIEW.md; no implementation or runtime proof is
  claimed. Deployment and provider inventories remain implementation inputs.
- `pnpm wiki:test`: 8/8 passed.
- `pnpm docs:check`: documentation, Wiki, and architecture checks passed.
- Only this plan and the proposal were added. Existing untracked `.pnpm-store/`
  and the unrelated design evaluation directory were preserved.

## Interactive design handoff — 2026-09-05

The owner requested delivery of the complete design. The existing proposal now
opens with a concise mobile journey and correctly points to accepted ADR 0012.
Its original implementation observations above remain dated design evidence.

The conversation preview lives at
`/Users/cubxxw/.codex/visualizations/2026/09/04/01a06b09-b71d-7711-a59e-ac65cc09f8ed/lab-product-workbench.html`.
It is a local presentation of synthetic states, not a backend, native app,
model run, or deletion proof. The existing native Lab screenshot grounded its
warm neutral grouped-list direction. Optional density and text alternatives
remain available through the host design controls.

Browser inspection exercised experiment recovery and failure-to-regression,
task-scoped trial, incompatible target rejection and compatible target login,
appearance with large text in dark mode, workspace entry/management/exit,
composite reset receipts, and the diagnostic timeline. The 360px dark appearance
and 320px light timeline fit without visible clipping. The script syntax check
passed; browser error logs were empty. Documentation checks passed with 428
Markdown files. This design handoff leaves the broader implementation goal and
its remaining runtime/physical-device/release gates active in
[the complete runtime plan](2026-09-04-lab-complete-runtime.md).
