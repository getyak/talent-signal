# iOS Editorial Today redesign evaluation

Date: 2026-08-08

Reviewer: `mobile-ux-reviewer`

Lens: mobile task completion, visual hierarchy, accessibility, recovery, and
design distinctiveness.

## Outcome

The default mobile surface is now **Editorial Today**, not a People directory.
The recruiter sees one dominant relationship dependency, one recoverable
interrupted review, and a count of relationships that need no action. People
remains the stable retrieval surface and Library holds assignment rooms and
reviewed evidence.

The selected visual theorem is **Editorial Redline**: one exact source and one
proposed relationship-state change share a composition joined by the restrained
vermilion causal seam. The Agent remains a draft-only threshold at the bottom
instead of becoming a home-screen chat destination.

## Evidence level

- Executable Next.js prototype exercised in Chromium at 390 by 844 and 1440 by
  1050.
- The selected experience is now published through the official
  `/relationships` product route; the earlier `/concepts/relationships` path
  redirects there.
- Direct interaction covered Today, People, Library, change review,
  confirmation, undo, and resume-after-interruption.
- Semantic snapshots and console logs were inspected.
- Native iOS gestures, VoiceOver, Dynamic Type metrics, and real-device
  ergonomics remain supported inference because this is a web prototype.

## Product boundary

- Today ranks work attention, never a person.
- Exact reviewed evidence appears before a proposed state change.
- `Keep unresolved` and `Confirm change` affect prototype relationship state
  only.
- The receipt states that no message was sent and offers Undo.
- Resume copy names what was preserved and what did not happen.
- Search, capture, share, and Agent behavior remain staged; no external write is
  represented as complete.

## Design tree and decision

### Brand theorem

- **Editorial Redline:** a daily issue organized around evidence, judgment, and
  one causal seam.
- **Quiet Relationship Archive:** a museum-like index organized around stable
  people and assignment rooms.

Editorial Redline wins as the default return surface. Quiet Relationship
Archive survives as People because browseability and spatial memory still
matter.

### Architecture

- **Judgment Brief:** one return-to item, one resume item, one no-action
  remainder, then contextual Agent.
- **Relationship Journal:** chronological fragments before the current
  dependency.

Judgment Brief wins because it removes context reconstruction while keeping the
source one action away.

### First viewport composition

- **Open Page:** space, rules, and type group the page; only evidence review is
  bounded.
- **Floating Briefs:** each attention item gains a soft elevated card.

Open Page wins. Floating Briefs improves local grouping but becomes a familiar
premium-SaaS card stack and makes visual chrome compete with the dependency.

## Visible evidence

- [Before: People-first home](before-people-home.png)
- [Selected mobile Today](editorial-today-mobile.png)
- [Evidence-to-change review](evidence-review-mobile.png)
- [Resume after interruption](resume-review-mobile.png)
- [People retrieval surface](people-mobile.png)
- [Library retrieval surface](library-mobile.png)
- [Open Page desktop study](open-page-desktop.png)
- [Floating Briefs challenger](floating-briefs-desktop.png)

## Interaction observations

### Today to review

1. The first viewport states that two relationships deserve judgment.
2. `Review change` opens Leila's exact reviewed source.
3. The vermilion seam connects evidence to the proposed relationship state.
4. Both `Keep unresolved` and `Confirm change` remain explicit human decisions.
5. Confirming produces `Relationship state confirmed. No message was sent.`
6. Undo removes the prototype decision and restores the pending review.

### Resume after interruption

1. Nia's Continue row opens `You stopped while reviewing Nia`.
2. The screen states that edits are saved and no message was sent.
3. `Evidence 2 of 3` preserves position without turning progress into a score.
4. Continue opens Nia's conflicting travel evidence, not Leila's data.

### Retrieval

- Today, People, and Library are stable labeled destinations.
- People retains assignment and work-state filters.
- Library exposes assignment rooms and one-click reviewed source context.
- The bottom Agent threshold keeps search, one-line intent, and capture
  available without competing with the current object.

## Accessibility and craft observations

- Icon controls have descriptive labels and at least 44 by 44 CSS-pixel hit
  areas.
- Current navigation uses text plus an underline, not color alone.
- Review decisions use text and `aria-pressed`; receipts use `aria-live`.
- The review and resume screens preserve vertical scrolling for text growth.
- Focus-visible styling, reduced-motion, and reduced-transparency fallbacks are
  present.
- The same Phosphor icon family is used throughout.
- No continuous animation, confidence score, urgency meter, or person-value
  signal was introduced.

## Checks

- Focused component ESLint
- Web TypeScript check
- `git diff --check`
- Webpack route compilation and HTTP 200 response; the global Google Font
  request was mocked locally so the check measured repository code rather than
  network availability
- `pnpm docs:check`
- Browser semantic snapshots for Today, review, receipt, resume, People, and
  Library
- Fresh browser console contained only development and hot-reload messages
  during the stable interaction pass

## Remaining uncertainty

- A native SwiftUI implementation still needs VoiceOver order, accessibility
  Dynamic Type sizes, back-swipe behavior, safe-area metrics, dark mode, reduced
  transparency, interruption after process termination, offline recovery, and
  real-device thumb reach testing.
- The mock date and all people, sources, assignments, and counts are synthetic.
