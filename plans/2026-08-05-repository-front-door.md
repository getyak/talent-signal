# Repository front door refresh

## Outcome

Make the repository legible and compelling to an international open-source
audience while keeping agent context small and trustworthy.

Completion means:

- one canonical repository Skill directory is visible at the root;
- `AGENTS.md` contains only project-wide invariants, routing, and recurring
  gotchas;
- `README.md` explains the product, trust boundary, architecture, current
  maturity, and first-run path without requiring prior project knowledge;
- the product and system architecture diagrams are readable in English and
  remain editable and reproducible;
- documentation, Wiki, diagram, and Markdown-link checks pass.

## In scope

- consolidate `.agent/skills/` into `.agents/skills/` without losing any Skill;
- tighten `AGENTS.md` and update directly related knowledge routing;
- rewrite the repository README for international contributors and product
  discovery;
- translate the existing product and system architecture diagrams to English;
- preserve editable Excalidraw sources and deterministic render checks.

## Out of scope

- changing product behavior, visual implementation, or external integrations;
- inventing production-readiness, adoption, privacy-compliance, or model-quality
  claims;
- redesigning the iOS icon or marketing website;
- rewriting canonical product or architecture decisions that remain accurate;
- publishing, committing, or opening a pull request without a separate request.

## Evidence and current diagnosis

- `.agent/skills/` contains eleven real Skill directories.
- `.agents/skills/` exposes those same Skills through eleven tracked symlinks
  and owns four additional repository Skills. The duplicate root folders are
  therefore compatibility indirection, not two independent implementations.
- No tracked documentation or tooling requires `.agent/skills/`; the README
  already presents `.agents/skills/` as the discoverable path.
- The current README is accurate but behaves like a repository note: it lacks
  a strong promise, trust boundary, architecture reading guide, maturity
  statement, and contributor journey.
- The two strongest architecture assets are visually coherent but contain
  mixed Chinese and English text, which blocks international comprehension.
- The external reference reinforces context minimalism, progressive
  disclosure, verification loops, and routing repeated corrections into Skills
  or executable checks rather than expanding always-on instructions.

## Chosen approach

1. Make `.agents/skills/` the single canonical Skill home and replace symlink
   indirection with real directories.
2. Reduce `AGENTS.md` by moving method and explanation behind existing links;
   retain only the product safety boundary, retrieval path, default proof loop,
   and high-signal knowledge routing.
3. Build the README as an editorial product narrative:
   promise → product loop → trust contract → product architecture → system
   architecture → current state → quick start → repository map → contribution.
4. Translate the existing diagram source strings and update deterministic
   diagram assertions rather than creating detached README-only images.

The rejected alternative is to leave both Skill roots and merely explain them.
That preserves visible ambiguity and creates two places contributors may
mistakenly edit.

## Milestones

### 1. Knowledge and asset audit

Pass condition:

- every Skill path and symlink is accounted for;
- canonical documentation and current visual assets are inspected;
- external principles are reduced to project-relevant decisions.

### 2. Canonical agent context

Pass condition:

- all Skills resolve under `.agents/skills/`;
- no repository reference requires `.agent/skills/`;
- `AGENTS.md` is shorter without weakening privacy, authorization, provenance,
  or verification boundaries.

### 3. International repository narrative

Pass condition:

- the README is English-first, visually composed, and honest about maturity;
- a new contributor can choose Web, iOS, docs, or architecture paths quickly;
- architecture visuals answer distinct product and system questions.

### 4. Verification and review

Pass condition:

- diagrams regenerate from editable source and pass structural/visual review;
- `pnpm wiki:test`, `pnpm docs:check`, and Markdown-link checks pass;
- the final diff contains no generated drift, broken symlinks, duplicate
  claims, or unrelated changes.

## Reconsider when

Preserve `.agent/skills/` only if a verified runtime in the supported toolchain
requires that exact path and cannot consume `.agents/skills/` or symlinks in
the opposite direction. If that evidence appears, keep one canonical source
and generate or link compatibility surfaces explicitly.

## Remaining launch decision

The repository has no `LICENSE` file. The refreshed README therefore invites
review and contribution without claiming that reuse rights have already been
granted. Choose an explicit license before presenting the repository as a
legally open-source release.

## Verification evidence

- all 63 moved Skill files match their original Git blobs byte for byte;
- `.agent/` is absent and `.agents/skills/` contains no compatibility symlinks;
- GitHub's Markdown API renders the refreshed README successfully;
- both full-resolution architecture PNGs were visually inspected after the
  final render;
- project and Excalidraw structural validators pass for both diagrams;
- `pnpm wiki:test` passes all six Wiki compiler tests;
- `pnpm check` passes documentation, Wiki, architecture, lint, typecheck,
  eleven Web tests, and the production Web build;
- `git diff --check` passes.
