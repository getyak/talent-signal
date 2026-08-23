# Engineering decision brief and project-health page

## Outcome

Create a repository-local `engineering-decision-brief` Skill, use it to
produce an evidence-backed assessment of the current project, and render that
assessment as a calm three-depth Web page: executive brief, engineering
dossier, and exact evidence.

Completion is observable when:

- the Skill passes the canonical Skill validator;
- every material page claim is classified as observation, interpretation, or
  recommendation and links to repository evidence;
- the new route renders at desktop and mobile widths with keyboard-accessible
  navigation and without modifying unrelated work;
- focused tests, typecheck, lint, build, and documentation checks pass.

## Boundaries

- This is an internal engineering knowledge surface, not a candidate-data
  surface and not a new system of record.
- The assessment is snapshot-bound to the inspected worktree and does not
  claim field validation that the repository cannot prove.
- Existing uncommitted changes in shared Web files are user-owned. Add new
  route, data, style, test, plan, and Skill files instead of rewriting them.
- The Skill may propose findings and durable knowledge changes. It cannot make
  unsupported findings authoritative.

## Current evidence and unknowns

- The repository already separates canonical docs, ADRs, research,
  evaluations, executable truth, and compiled Wiki pages.
- The Web stack is Next.js 16.2.12, React 19.2.8, TypeScript 6, Tailwind CSS 4,
  and Vitest 4.
- Hundreds of evaluation artifacts exist, but their active, superseded, and
  topic-level relationships need inspection.
- The current worktree is dirty in existing Web files; the new slice must stay
  non-overlapping.

## Approach

1. Scaffold the repository Skill with the official Skill initializer.
2. Encode a concise analysis workflow and a reusable brief contract.
3. Validate the Skill before using it.
4. Apply it to repository structure, checks, code hotspots, documentation,
   evaluation evidence, and current worktree state.
5. Encode the resulting snapshot as typed static data and render it through a
   dedicated server route with local CSS.
6. Verify semantic traceability, responsive presentation, and repository
   checks; then tighten the Skill if real use exposes ambiguity.

## Rejected alternatives

- Do not add Backstage, Docusaurus, MDX, or a new content database for the
  first slice; they add a second publication system before the page contract
  is proven.
- Do not ingest or summarize every evaluation file. Curate the smallest
  evidence set that supports current findings and expose inventory scale as an
  observation.
- Do not put analysis prose directly in a large JSX page. Keep content in a
  typed module so the page is a projection rather than the authority.

## Verification

- Skill: `quick_validate.py` and a real project-analysis run.
- Knowledge: every finding has evidence, uncertainty, implication,
  recommendation, and verification.
- Web: focused Vitest tests, lint, typecheck, production build.
- Docs: `pnpm docs:check`.
- Surface: browser inspection at desktop and 390-pixel mobile widths, including
  keyboard landmarks and exact evidence links.

## Status

Completed on 2026-08-11 as a dated, reviewable draft rather than an accepted
project decision.

- Added and validated `.agents/skills/engineering-decision-brief/` with a
  reusable three-layer brief contract.
- Added the static `/briefs/project-health` route, typed evidence ledger, local
  styles, and contract tests without touching the user-owned modified Web
  files.
- Verified the page at 1440 pixels and 390 pixels with no horizontal overflow
  or browser errors. In-page layer navigation lands on the intended section.
- Focused Vitest, ESLint, typecheck, the final production build, Skill
  validation, and `pnpm docs:check` passed.
- The volatile Release iOS observation was rechecked at handoff: run
  `31377762230` remained `pending` with no jobs, so the page continues to label
  the cause as unknown rather than asserting a workflow defect.

The durable reusable method remains in the Skill. This plan preserves task
scope and proof only; the page remains a snapshot projection whose evidence
links continue to own the underlying claims.
