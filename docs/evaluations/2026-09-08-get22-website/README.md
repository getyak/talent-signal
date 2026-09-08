# GET-22 website evaluation

Date: 2026-09-08. [Issue](https://linear.app/getyak/issue/GET-22/官网优化和设计).
[Implementation plan](../../../plans/2026-09-08-get22-website.md).
All people and conversations in these artifacts are synthetic.

## Design decision

The baseline scattered the value proposition across eight sections and rotating
demos. The new homepage has four sections: value with an interactive relationship
brief, a three-step process, trust and FAQ, and access. The primary action opens
and focuses the working brief, including on a small phone. The secondary action
opens an access-request email. No message is automatically sent.

The exploration tree and rejected source-first architecture are in the plan.
[Direction A](direction-a.png) makes one person's unresolved question and its
supporting words readable immediately. [Direction B](direction-b.png) uses a
horizontal relationship path; it is more spatially distinctive but less direct
for the initial recruiter's task and risks implying inferred acquaintance.
A was selected. B survives only as explicitly exploratory product explanation.
[Rendered prototype source](directions.html) preserves both directions, including
their mid-page structure, without adding a public demo route.

Reference mechanisms inspected: [Attio](https://attio.com) for recognizable CRM
objects, [Mesh](https://me.sh) for person-centered continuity, and
[Granola](https://www.granola.ai) for showing a recognizable output. Talent Signal
retains its warm paper, ink, vermilion and original brand geometry. The signature
interaction is removal of a source visibly invalidating its dependent suggestion.
This is design judgment; no first-time visitor comprehension study was conducted.

## Visual evidence

| Surface | Evidence |
| --- | --- |
| Baseline desktop / phone | [Desktop](before-desktop.png), [phone](before-mobile.png), [old boundary](before-boundary.png) |
| Chinese homepage | [Desktop](after-desktop-zh.png), [phone](after-mobile-zh.png) |
| English homepage | [Desktop](after-desktop-en.png) |
| Dark appearance | [Desktop](after-desktop-dark.png) |
| Direct mobile demo entry | [Phone](after-mobile-demo.png) |
| Source invalidation | [Removed source](after-source-removed.png) |
| Access and pricing | [English pricing](pricing-en.png) |
| Reduced motion interaction | [Review, confirm, remove](reduced-motion.png) |

Screenshots are unedited local Chrome captures and may include development or
browser-extension controls. They demonstrate the local implementation, not a
production deployment or measured business outcome.

## Observed behavior

- A fresh English browser request receives English server-rendered copy, title
  and document language. The Chinese/English selector refreshes the server copy
  and preserves an explicit choice across navigation. Weighted Accept-Language,
  unsupported languages, malformed quality values and cookie precedence are tested.
- Product, how-it-works, trust and pricing are real localized pages. Public demo
  access is free; early workspace access is by application, with pricing not yet
  published. No invented price, subscription or billing action was added.
- The same synthetic candidate and exact source quote persist through the home
  and relationship demo. The source has no year or time zone, so Wednesday is
  explicitly unresolved. English translation is labeled separately from Chinese
  evidence. The screenshot's other participant is identified separately.
- Keyboard Enter opens the screenshot and review, then confirms only the stated
  fact. Cancel and undo preserve the boundary. Removing evidence invalidates the
  current interpretation and suggestion, while showing prior confirmation as
  history. Restart requires fresh review. All state is local to the demo.
- The mobile menu makes background main/footer inert; Escape closes the menu
  and returns focus. The main CTA focuses the brief at approximately 82 px from
  the top at 390 by 844, with the controls visible. The interaction does not rely
  on motion or automatic rotation. Reduced-motion verification observed the media
  query active and computed scroll behavior set to auto.
- [Width checks](width-checks.json) at 320, 768, 1040, 1100 and 1440 px found no
  horizontal document overflow or header controls outside the viewport.
- Marketing regions declare their selected language. Existing Chinese content
  and body-mounted legacy dialogs retain Chinese via the body language fallback.
  Existing research, privacy articles and advanced concept demos are not translated.
- The final inspected console error entries came from a browser extension, not
  application source. This is not a claim of comprehensive production monitoring.

## Verification and review

`pnpm test`: 57 files passed, 1 skipped; 346 tests passed, 1 skipped. The skipped
case is an existing live-provider test. `pnpm lint`, `pnpm typecheck`,
`pnpm docs:check`, `pnpm brand:check` and production build passed locally.
The build used the repository CI's non-deployment AUTH_SECRET fixture.
After the final language and demo-focus changes, lint, typecheck, production
build and all 39 tests in the three affected suites passed again.

Independent sub-agent review found no P0/P1. Its P2 concerning Chinese legacy
content inheriting English was fixed with a body fallback and explicit localized
marketing regions. The reviewer rechecked the fix, body portals and hash-entry
focus lifecycle; no confirmed P0/P1/P2 remained. CI, merge and any deployment
receipts are recorded on the linked delivery PR and Linear issue.
