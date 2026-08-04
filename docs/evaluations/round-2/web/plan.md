# Web craft round 2 execution plan

## Outcome

Raise the authenticated Talent Signal Web evidence-review surface to the
highest craft level that direct evidence supports, without changing the frozen
craft rubric or claiming proof that was not collected.

The primary user question is:

> For TS-CORE-01, what changed, what exact source supports it, and which
> consequential decision still belongs to the recruiter?

The canonical object is backend-owned, assignment-scoped relationship state.
The Web workspace is a governed projection. Source evidence, proposed
assertions, recruiter-confirmed state, action approval, execution, and observed
outcome remain separate.

## Scope and boundaries

In scope:

- `apps/web/**`;
- Web tests required to prove deterministic behavior;
- `docs/evaluations/round-2/web/**`;
- a disposable Docker Compose project and localhost-only browser sessions.

Out of scope:

- the frozen `docs/evaluations/overnight/final/**` record;
- backend, iOS, browser extension, Codex plugin, root documentation, and rubric
  changes;
- live candidate data, production identity, analytics, model calls, or
  external writes;
- manual VoiceOver or Chrome-extension claims that were not directly observed.

The existing `XS-CAPTURE-01` browser-extension veto is preserved. Web work
cannot resolve it.

## Frozen starting evidence

- Base branch: `codex/final-localhost-integration`
- Starting commit: `3ecb6ec3270a8070c5ddc1a437bd386bbed8954d`
- Integrated implementation under review:
  `1c9c3f0f2866b2d4c3651d422f5d886dd796c996`
- Scenario: synthetic `TS-CORE-01`
- Existing Web craft gaps:
  authenticated 390 px completion, 200% reflow, reduced motion, complete
  keyboard order, browser accessibility-tree transcript, long mixed-script
  content, and direct loading/empty/no_action/ambiguity/stale/revoked/deleted/
  error/recovery surfaces.

## Design read

- Surface: evidence review inside a desktop knowledge workspace, responsive to
  a 390 px mobile browser.
- Audience: a time-constrained independent recruiter handling one live
  relationship dependency.
- Character: a quiet professional notebook with evidence-instrument precision.
- Density: editorial context followed by compact decision rows; no dashboard
  tiles.
- Motion: only honest progress feedback; no essential transition; fully static
  under reduced motion.
- Attention: identity and dependency first, exact evidence second, one
  consequence-bearing action third. Visual weight never ranks the person.

## Chosen approach

1. Refine the authenticated integration surface so its semantic reading order
   and responsive visual order are the same.
2. Add explicit live-region feedback, skip navigation, source anchors, stable
   focus return, cancellation, stale approval, unknown/failed result,
   revocation, deletion, and recovery presentation.
3. Keep real backend mutation paths behind authenticated localhost-only Web API
   routes and explicit human controls.
4. Keep the existing eight frozen Web boundary cases reachable from the
   authenticated integration workspace for `no_action`, ambiguity, conflict,
   supersession, and prohibited-scoring proof.
5. Add deterministic pure-state tests for authority and recovery presentation.
6. Use one isolated Docker project, the signed-in localhost Web surface, direct
   browser screenshots, keyboard traces, accessibility-tree output, viewport
   measurements, and reduced-motion inspection.

Rejected:

- changing the rubric or scoring anchors;
- treating fixture-only previews as backend writes;
- resolving backend recovery by altering backend source;
- claiming a manual screen-reader or extension run from automated output.

## Milestones and proof

1. **Meaning and state model**
   - New tests prove confirmed state cannot imply approval, stale approval
     cannot execute, unknown effect requires reconciliation, revoked
     capability cannot look successful, and deleted evidence becomes a
     tombstone.
2. **Complete responsive surface**
   - The full authenticated TS-CORE-01 edit, confirm, approve, execute, and
     verified readback journey completes at 390 px without horizontal
     overflow or clipped controls.
3. **Accessibility and reflow**
   - Direct keyboard order, visible focus, skip behavior, browser
     accessibility-tree transcript, 200% zoom/reflow, high contrast,
     grayscale, and reduced-motion evidence is saved.
4. **State breadth and recovery**
   - Direct state evidence covers loading, empty, no_action, ambiguity,
     supersession, stale approval, revoked permission, deletion, offline/error,
     reconciliation, and restored state.
5. **Repository verification**
   - Web lint, typecheck, tests, build, relevant browser/accessibility checks,
     `pnpm eval:core`, and `pnpm docs:check` pass.
6. **Independent review**
   - Recruiter workflow, candidate experience, mobile UX, and evidence safety
     packets are produced one at a time against the same frozen implementation
     and evidence bundle, contract-validated, then adjudicated.
7. **Two commits**
   - Implementation is committed first.
   - Evaluation artifacts and reviewer packets are committed second.

## Scoring discipline

Every one of the twelve craft dimensions retains the frozen rubric anchors.
A score of 98 or more requires direct evidence. First-use comprehension,
manual assistive-technology behavior, field recruiter usefulness, and the
Chrome capture boundary remain below the corresponding target when direct
proof is absent.
