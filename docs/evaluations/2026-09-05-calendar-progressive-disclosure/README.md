# Calendar progressive disclosure review

Synthetic iPhone 17 Pro Simulator review, September 5, 2026. This evaluation
compares the released calendar v1 with the compact native implementation. It
is a design and behavior review, not evidence of recruiter productivity.

## Observed change

| Surface | Released baseline | Refined direction |
| --- | --- | --- |
| Day | Large month enclosure, permanent view and person rows, repeated card properties | Compact date strip, named view menu, active filter only, time rail and person/activity rows |
| Week | Seven-day list beginning on any selected date | Actual calendar week with readable horizontal day columns and a fixed hour gutter |
| Detail | Source, original zone, and duplicated scope expanded | Person, time, preparation and preview boundary first; secondary metadata behind Calendar details |

The compact direction preserves the warm neutral palette, restrained attention
accent, and person/context identity. It improves scanning by removing repeated
framing and normal status, without shrinking text or controls below touch-size
minimums. The default dense synthetic day shows five activities in the initial
viewport. Cross-event conflicts remain explicit rather than relying on color.

The first implementation pass exposed English AM/PM wrapping and a vertically
misaligned hour gutter. Actual native captures led to a consistent 24-hour rail,
a shorter month label, and explicit top alignment. A disclosure test also needed
a case-insensitive lookup because native English metadata headings are uppercase.

## Evidence

- [Baseline day](01-before-day.png), [baseline week](02-before-week.png),
  [baseline detail](03-before-detail.png).
- [Compact Chinese day](04-after-day-zh.png), [view menu](05-view-menu.png),
  [Chinese week with aligned hours](06-after-week-zh.png).
- [Compact English day](07-after-day-en.png), [collapsed detail](08-collapsed-detail.png),
  [expanded metadata](09-expanded-detail.png).
- [Large-text dark week list](10-week-ax5-dark.png),
  [preview composer](11-composer-boundary.png), [empty week](12-empty-week.png).

Day/menu/week Chinese captures were observed through Simulator and then saved
from the same device. Other captures are native XCTest attachments. All names
and activities are synthetic; the denser fixture is Debug-only and guarded by
preview mode. Release-mode preview behavior and external-write authority are
unchanged. The final verification manifest records tests and source hashes.

## Design boundaries

- View and filter are different menu sections. Selecting a view retains the
  date/person choice; an applied person filter stays visible and removable.
- Default day rows are chronological, not proportional duration charts. Week
  geometry represents clock time with minimum tappable blocks and explicit
  start/end labels. Short blocks get separate lanes when touch rectangles would
  otherwise overlap; only actual time overlap creates a conflict warning.
- Phone week columns scroll horizontally instead of squeezing seven names into
  unreadable cells. Empty hours represent missing Talent Signal activities, not
  verified availability. This is not a team availability or Apple Calendar read.
- Accessibility text and non-24-hour DST days use the chronological week list.
  DST interval math is unit-tested; no claim is made of visual DST grid coverage.
- Preview provenance, pending/failed/uncertain sync and conflict warnings remain
  outside folded metadata. Preparation remains an editable unsent draft.

Notion's [view and property visibility documentation](https://www.notion.com/help/views-filters-and-sorts)
informs the separation of layout, filtering and secondary properties. This
implementation follows native SwiftUI conventions; it does not claim parity
with Notion's mobile calendar or measured user preference.

The stable density decision lives in [the design system](../../design-system.md).
Final checks also include [week scrolling](13-week-rail-scroll-proof.png),
[visible conflict metadata](14-visible-conflict-detail.png), and
[active person filtering](15-active-person-filter.png). Seventeen distinct
checks pass across the bounded runs in [verification.json](verification.json).

Active delivery and release state lives in [the plan](../../../plans/2026-09-05-calendar-progressive-disclosure.md).
