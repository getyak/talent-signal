# Relationship experience integration

Status: implementation complete; publication pending

## Outcome

Ship one reviewable pull request that turns the strongest unmerged local work
into a coherent Talent Signal relationship experience: governed screenshot
evidence, a useful People directory, an editorial public product surface, and
durable design rationale.

## Boundaries

- Preserve the existing evidence, identity, provenance, and human-decision
  boundaries.
- Do not re-submit work already merged through prior pull requests.
- Keep the original dirty worktree untouched; port only inspected files into an
  isolated branch from `origin/main`.
- Do not expose an internal design-study shell as the public product entry.
- Do not add automation authority: analysis remains a proposal until a human
  confirms the record.

## Completion evidence

- The public site links to an accessible `/relationships` experience that
  explains and demonstrates the relationship product without internal study
  controls.
- The authenticated workspace exposes a source-grounded People directory.
- Screenshot analysis carries provider-neutral provenance, source hashes,
  explicit source ownership, temporal ambiguity, and a signed review receipt.
- Responsive browser captures show the homepage and relationship route at
  desktop and mobile widths without clipping or broken interaction.
- Relevant unit tests, type checks, build, and `pnpm docs:check` pass.
- The PR contains multiple cohesive commits, passes GitHub checks, and is
  merged without squashing away the commit boundaries when repository policy
  permits.

## Commit slices

1. Harden screenshot evidence review.
2. Add the governed People directory.
3. Integrate the editorial relationship experience into the public site.
4. Record the relationship design decisions and reference judgments.
5. Document the Agent authority architecture with an editable diagram.
6. Cover the relationship route in the sitemap contract.

## Verification notes

- `pnpm check` passed on 2026-08-08. This covered brand, documentation,
  generated-wiki, architecture, lint, TypeScript, web tests, backend tests, and
  the production web build.
- The architecture validator passed all three governed diagrams. The new Agent
  diagram contains 117 elements, uses 14 px as its minimum text size, and keeps
  proposed/future paths visually distinct.
- The production build generated `/relationships`, the legacy redirect at
  `/concepts/relationships`, and the authenticated `/workspace/people` route.
- Playwright review covered the relationship experience at 1440 x 1000 and
  390 x 844 in light mode, plus the product surface in dark mode. Today, People,
  and the contextual Agent guide were exercised without horizontal overflow,
  console errors, or duplicate main landmarks.
- The relationship walkthrough and all evaluation evidence use synthetic
  identities and messages. No candidate conversation or screenshot from a real
  person was added.
- The original dirty worktree remains untouched. Already-merged duplicate work
  was intentionally left out of this branch.
- GitHub checks and merge state are recorded by the pull request rather than
  duplicated in this plan.
