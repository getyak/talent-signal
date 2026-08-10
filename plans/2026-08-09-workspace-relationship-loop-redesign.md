# Workspace relationship-loop redesign

## Outcome

Turn `/workspace` into a coherent relationship desk where an independent
recruiter can bring one governed image or text source, bind it to the right
person and relationship, review extracted claims, compile the living Wiki, and
return to a usable people directory without losing provenance or control.

The slice is complete when the browser proves both a screenshot path and a text
path from capture through review into the living contact page, and the frozen
artifact passes the selected product panel without an active veto.

## Boundary

In scope:

- `/workspace` onboarding, fixed Agent rail, living person page, Wiki, evidence
  review, source intake, and responsive behavior;
- `/workspace/people` retrieval and relationship-context presentation;
- program logic defects exposed by those paths;
- loading, empty, ambiguity, failure, and no-action states relevant to the
  tested loop;
- focused tests, build, browser evidence, and review packets.

Out of scope:

- autonomous messages, calendar writes, ATS writes, or new connector authority;
- candidate scoring, fit inference, personality labels, or acceptance prediction;
- production migration, deletion of pre-existing local fixtures, or unrelated
  browser-extension work already present in the worktree;
- replacing the backend truth model or the published Wiki compiler.

## Current evidence

- The working tree already contains unrelated browser-extension edits. They are
  preserved and not owned by this plan.
- `/relationships` establishes the desired visual/product logic: one supported
  dependency in the main field, exact evidence nearby, and one separate next
  move with draft-only authority.
- `/workspace` already exposes real backend-backed source, review, Wiki,
  identity, merge, and people-directory operations.
- The empty workspace first viewport pushes the actionable source form below the
  fold and spends too much space explaining the loop before the user can begin.
- The workspace uses a 58 px global rail plus a 382 px Agent rail, while the
  people directory inherits only the 58 px rail. The context switch feels like
  a different product and leaves navigation ownership inconsistent.
- The living person page contains the right objects, but Wiki, merge, external
  effects, source launcher, lineage, claim review, next move, history, and
  deletion compete with similar visual weight.
- Kimi WebBridge is currently unavailable because its daemon PID record points
  to an unrelated live macOS process while port 10086 has no listener. Local
  Playwright is the interim real-browser surface; Kimi remains a completion
  check.

## Important unknowns

- Whether the configured image-analysis provider can complete the supplied
  synthetic screenshot fixture in the current local environment.
- Whether a text source attached to an existing relationship automatically
  generates atomic claims or remains a source awaiting an explicit compile.
- Whether the current people API exposes enough lifecycle state to support
  useful filters without inventing client-side status.
- Whether Kimi WebBridge can be restored during this goal without violating its
  no-restart/no-cleanup safety rule.

## Product invariant (D0)

- Visitor: an independent recruiter returning from or preparing for one
  consequential conversation.
- Moment of tension: evidence is scattered and may be stale, ambiguous, or
  attached to the wrong person.
- Understand: what changed and exactly what supports it.
- Feel: calm control, not AI spectacle or CRM administration.
- Do: review one governed source and take one smallest safe next step, or accept
  `no_action`.
- Product truth: removing or contesting evidence retracts the interpretation and
  its dependent action; neither a generic contact manager nor a generic chat
  assistant can honestly show this causal contract.

## Recursive design tree

### D1 brand theorem

- Question: what visual argument should organize the desktop workspace?
- Parent invariant: evidence must visibly govern relationship understanding.
- Branch A, **Evidence desk**: a persistent Agent rail coordinates intent while a
  wide notebook canvas uses the vermilion redline to connect source, state diff,
  Wiki, and next move. Anti-reference: a tiled CRM dashboard.
- Branch B, **Relationship dossier**: the person page becomes a document-like
  single column with a collapsible Agent drawer and sticky consequence band.
  Anti-reference: a generated profile report.
- Evidence needed: desktop/mobile first viewport, one evidence-review state, one
  Wiki/next-move state, and keyboard order.
- Expected visible difference: A is a two-surface working desk; B is a reading
  document with temporary tools.
- Failure signal: either direction hides exact evidence, breaks Agent/object
  simultaneity, or turns source review into a secondary modal.
- Winner: **Evidence desk**.
- Why: the repository's accepted workspace contract requires the Agent and living
  person page to remain simultaneously legible at material decisions. It also
  aligns with `/relationships` without copying its marketing composition.
- Challenger retained: Relationship dossier for future narrow-screen or focus
  mode exploration.
- Backtrack condition: the fixed rail prevents task completion or leaves the
  living object unreadable at 1024 px.

### D2 architecture

- Question: how should the Evidence desk lead attention?
- Parent invariant: begin from the source, then expose review, current state, and
  one consequence.
- Branch A1, **Start in place**: compact orientation strip plus a two-column first
  source workbench visible in the initial viewport; selected identity and source
  edit together.
- Branch A2, **Agent-first start**: hide the main start form and complete all
  creation inside the fixed Agent rail before opening the person page.
- Evidence needed: five-second comprehension, input visibility, long-name state,
  and mobile collapse.
- Expected visible difference: A1 makes the governed form the main object; A2
  turns the Agent into a wizard.
- Failure signal: the user cannot tell what will be created, or must scroll before
  the first meaningful input.
- Winner: **Start in place**.
- Why: identity, relationship, and source deserve reviewable space; forcing them
  into the narrow Agent rail increases error and administration.
- Challenger retained: Agent-first start only as an optional shortcut that opens
  the same governed form.
- Backtrack condition: the first workbench cannot fit above the fold at 1280x900
  or cannot collapse into one semantic column on mobile.

### D3 composition prototypes

- Prototype A: restrained 58 px product rail, 344 px Agent rail, and a main field
  whose first viewport contains a short promise plus the governed source form.
  The three-step explanation becomes a quiet horizontal ledger below the title.
- Prototype B: 58 px product rail with a full-width dossier canvas; Agent appears
  as a top strip and the source form becomes a centered document block.
- Pairwise selection: A wins product truth and task continuity; B wins reading
  space but weakens the accepted Agent/person simultaneity and makes desktop work
  resemble a document editor.
- Selected composition: Prototype A.
- Mobile collapse: one vertical task surface, evidence before decisions, sticky
  bottom navigation, and no horizontal comparison dependency.

## System decision (D4)

- Keep the existing component and backend contracts. Refactor only where a
  deterministic test or visible hierarchy requires it.
- Use existing CSS variables, Phosphor icons, sans body/display roles, warm
  neutral surfaces, and restrained vermilion.
- Shape rule: 12-16 px for work objects, 8-10 px for fields/compact controls,
  pills only for status or compact mode selection.
- Motion rule: feedback and state transition only, CSS transform/opacity, reduced
  motion honored. No ambient animation.
- No new dependency or parallel design system.
- No person score. Counts describe sources, reviewed facts, and relationship
  contexts only.

## Milestones

1. Freeze desktop/mobile screenshots, console state, and current workflow notes.
2. Make the initial governed-source workbench visible and consistent with the
   relationship desk.
3. Strengthen the living page's causal hierarchy from evidence to Wiki to next
   move, while keeping full review/recovery states.
4. Make People a usable relationship index with consistent shell behavior,
   clear context access, and no invented ranking.
5. Exercise screenshot and text paths in the real browser; fix exposed logic
   defects and add focused tests.
6. Freeze the final artifact and run the smallest sufficient review panel:
   recruiter workflow, evidence safety, and responsive/mobile UX, with
   design-system conformance as supporting evidence.
7. Retest only affected lenses until no veto remains and the explicit user
   quality target is met without manufacturing an averaged score.

## Completion evidence

- before/after desktop and mobile screenshots;
- successful screenshot and text source receipts tied to synthetic evidence;
- one living person page and Wiki snapshot read back from the backend/UI;
- people-directory retrieval of the tested relationship;
- keyboard-visible focus and no horizontal overflow at desktop/mobile widths;
- no uncaught browser console or failed network request in the tested path;
- focused lint, typecheck, test, build, and `pnpm docs:check` results;
- contract-valid specialist packets and adjudication artifact with no active veto.

## Completion

- The source-first workspace, living contact, governed Wiki, next-move area,
  and server-backed People directory now preserve identity, evidence, current
  state, and action authority as separate reviewable objects.
- Screenshot analysis fails closed on uncertain speaker ownership, keeps
  ambiguous claims out of confirmed state, and is cancellable through the
  provider request boundary without saving a source or losing browser-local
  crop and masks.
- The text and image paths, duplicate handling, `no_action`, People readback,
  mobile reflow, keyboard order, and cancellation recovery were exercised with
  repository-owned synthetic evidence. The final frozen evidence is recorded
  in the `2026-08-10-workspace-*` evaluation artifacts.
- Request-generation guards prevent a stale People lookup from overwriting a
  newer query or enabling new-person creation while lookup is pending or has
  failed; focused tests preserve both this invariant and screenshot
  cancellation behavior.
- The full repository check, production build, browser acceptance matrix, and
  selected reviewer contracts passed without an active veto.

Independent human screenshot labels, assistive-technology and broader device
coverage, provider-side lifecycle inspection, consented recruiter comparison,
and any separately authorized external-effect loop remain outside this result.

## Re-plan signals

- Image analysis is unavailable or produces no inspectable evidence.
- A backend contract cannot represent the needed state without a new authority
  decision.
- The Agent rail prevents the required object/evidence comparison at supported
  widths.
- A safety reviewer finds wrong-identity, unauthorized-write, deletion, or stale
  state behavior.
