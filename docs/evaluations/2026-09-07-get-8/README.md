# GET-8 native retrieval and meetings

Status: completed and locally verified on 2026-09-07. All cases use synthetic local data.

## Current-run baseline and design comparison

The current-run baseline at `a2eaaeae` passed the native default-Today and
swipe/top-control parity tests (`/tmp/get8-baseline.xcresult`). The accepted
[baseline screenshot](baseline/01-current-native.png) was exported from that
run and visually inspected. An initial Simulator-home capture was rejected and
replaced; it is not product evidence.

The first direction retained all navigation names, a separate calendar entry,
a large Today title and an inactive Lab banner. The [second rendered direction](directions/02-progressive-navigation.png)
uses one progressively disclosed current label, persistent destination symbols,
and an embedded meetings destination. Both are real SwiftUI renders at the same
402 × 874 point viewport. The second direction gives the next activity and both
preview decisions room within the first viewport. Its first review also found
that the day must accompany the activity time and that heavy form-like buttons
still competed with content; the subsequent pass addresses those issues.

The choice is based on scope clarity, five-second legibility, navigation
availability and consistency with the project's quiet visual system. It is a
design judgment, not a user-study result or a numerical claim of design quality.

## Source grounding

- [GET-8](https://linear.app/getyak/issue/GET-8), read in the authenticated Linear
  browser on 2026-09-07, owns the requested changes.
- [Notion mobile navigation](https://www.notion.com/help/workspaces-on-mobile)
  documents persistent retrieval controls and progressive secondary tools.
  [Notion navigation](https://www.notion.com/en-gb/help/navigate-with-the-sidebar)
  also describes upcoming events and recent work in Home. Public documentation
  does not prove the user's observed native swipe animation; no pixel-match or
  internal implementation claim is made.
- [Apple tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)
  recommends stable destinations and preserving navigation state. GET-8
  specifically requests quiet inactive labels; symbols retain full accessibility
  names, selected traits and 44-point targets. Visual label discoverability is a
  tradeoff, to be checked on the actual device.
- [PageTabViewStyle](https://developer.apple.com/documentation/swiftui/pagetabviewstyle)
  provides the native paged scrolling surface.
- [State](https://developer.apple.com/documentation/swiftui/state#Store-observable-objects)
  documents that published changes to a Combine ObservableObject stored in
  State do not update the containing view. [ObservedObject](https://developer.apple.com/documentation/swiftui/observedobject)
  subscribes the small navigation header. This is the basis for isolating
  frame-rate geometry updates from the relationship workspace.

Apple pages were read through their official Markdown endpoints when the web
reader returned the JavaScript shell. Current project target: Swift 5 language
mode, minimum iOS 16; test runtime: iOS 26.5.

## Outcome and rendered proof

| GET-8 need | Implemented behavior | Native proof |
| --- | --- | --- |
| Consistent swiping | Native four-page pager; header alone observes continuous progress; cancellation restores the current destination | Cancellation, RTL, rapid transitions and [paired duration observations](metrics/README.md) |
| Quiet navigation | Stable symbols, one progressive current name, no inactive Lab banner; full accessibility labels and targets | [Today](final/01-today.png), [AX5 navigation](final/04-accessibility-navigation.png) |
| Clear Home | Date, next meeting with day/time, reviewable decisions; lighter type and buttons, no repeated Today title or filler | [English Today](final/01-today.png), [Chinese dark empty calendar](final/05-chinese-dark-today.png) |
| Meetings and recollection | Persistent agenda and month disclosure; preparation/notes return to an editable scoped Session | [Meetings](final/02-meetings.png), [compact agenda](final/06-compact-agenda.png), [editable notes](final/03-meeting-draft.png) |
| Preserve decisions and recovery | Existing drafts/pending work take precedence; calendar edits still expose reviewed effects | [Calendar edit review](final/07-calendar-review.png) and calendar state tests |

## Verification record

The primary device is iPhone 17 Pro, portrait, 402 × 874 pt, iOS 26.5.
Cases start from local synthetic workspace data and use native taps, long
presses, drags, keyboard input, page changes, and return navigation. The task
persona is a recruiter returning between conversations; success means reaching
the intended person/activity/Session without losing retrieval state or a draft.
No real candidate content or system-calendar write was used.

| Run | Actual result |
| --- | --- |
| Baseline (`/tmp/get8-baseline.xcresult`) | 2 UI tests passed |
| Interaction r3 (`/tmp/get8-interaction-r3.xcresult`) | 3 new unit tests passed; 4 UI cases passed, including RTL and calendar-to-Session; 2 harness failures corrected below |
| Interaction r4 (`/tmp/get8-interaction-r4.xcresult`) | 4 UI tests passed: four-page cancellation/state, notes round trip, AX5 controls, Chinese dark empty Today |
| Calendar and metrics (`/tmp/get8-regression-and-metrics.xcresult`) | 105 unit tests and 8 UI cases passed; 3 date-dependent UI failures corrected below |
| Final interactions (`/tmp/get8-final-interactions.xcresult`) | 3 navigation/draft unit tests and 7 UI cases passed, including all 3 corrected calendar cases, search/filter retention, rapid navigation and an edited notes draft |
| Baseline metrics (`/tmp/get8-motion-baseline.xcresult`) | 2 identical metric cases passed; raw values preserved in [metrics](metrics/README.md) |
| Small device (`/tmp/get8-small-device.xcresult`) | 108 unit tests and 3 UI cases passed: long People anchors, AX5 header, Chinese dark reduced-motion Meetings. The long Session case was terminated with signal TERM; its unchanged isolated rerun passed (`/tmp/get8-small-session-retry.xcresult`) |
| Release compile (`/tmp/get8-release-build.log`) | Passed for generic iOS Simulator, signing disabled, compile-only `https://example.test` endpoint; no deployment or production connection |

Small-device captures: [375 × 667 pt AX5 navigation](final/08-small-ax5.png) and
[Chinese dark reduced-motion Meetings](final/09-small-chinese-dark-meetings.png),
visually inspected from an iPhone SE (3rd generation) Simulator.

[Machine-readable run summaries](verification.json) preserve the actual counts
and recorded failures.

Across implementation runs, [23 distinct UI cases](passed-ui-cases.txt) pass,
including 2 observational metric cases. The latest source passed all 108
focused unit tests. The signal-TERM termination has no identified product
assertion or crash stack; it is retained as a test-run anomaly, not silently
counted as a pass.

The calendar workflow suite's 9 distinct cases now pass across the calendar
and final-interaction runs: shortcuts, reviewed editing, add-before-write,
metadata disclosure, overlap visibility, creation scope, person filtering and
return, Chinese empty week, and an accessibility agenda fallback. The unit
suite covers time zones/DST, overlap layout, explicit write authority, linked
update identity, unknown/missing/failed outcomes, retry and retention.

### Findings corrected during verification

- **Late activities:** entering the preloaded Meetings page before activities
  arrived selected the wrong date. The first nonempty input now establishes the
  agenda date once; later navigation preserves the user's selection. The
  Today-to-calendar-to-Session case passes.
- **AX5 Lab control:** the first large-text capture enlarged the secondary flask
  unnecessarily. The compact symbol now has a fixed glyph size and full touch
  target; the final native AX5 capture was inspected.
- **Transition capture:** a screenshot immediately after rapid taps caught an
  in-flight page. The test now waits for the content's actual frame to settle;
  the accepted Today capture is fully aligned.
- **Harness assumptions:** a short fast drag was a flick, so the cancellation
  case now uses a slow drag and hold. Existing Session checks now use the
  current native back control. A selector aimed at the wrong test class was
  corrected by running the actual calendar workflow class.
- **Time-dependent density cases:** after today's final activity, overview
  correctly selected the next future day. The failure hierarchy showed
  September 9 selected while the test searched for September 7's morning
  fixture. These cases now explicitly choose Today; all three pass.
- **Receipt presentation:** asynchronous sync completion now refreshes only
  the matching open detail. It cannot reopen a dismissed sheet or replace a
  different activity. Device sync state/authority logic remains unchanged.
- **Documentation/localization:** canonical guidance was consolidated within
  the existing 320-line budgets, and the new no-action copy was added to the
  English/Chinese catalog. `pnpm docs:check` (including all 3 architecture
  diagrams), `pnpm ios:localization:check` (2,555 keys) and `git diff --check`
  pass.

## Scoped product review

`reviewer: mobile-ux-reviewer`
`lens: mobile task completion, visual hierarchy, accessibility, and recovery`

Evidence level 1 for the tested native interactions; visual judgments are
supported inference, not first-use user findings. Canonical objects remain
Person, relationship context, Pursuit, Proposal, Action and Receipt. Sessions
and Meetings are retrieval projections. Visual emphasis belongs to the next
activity and reviewable work, never candidate worth. Preview, evidence,
interpretation and confirmed effects retain separate labels and authority.

The implemented slice was reviewed against `REVIEW.md`: one reachable next
step, editable/dismissible decisions, scoped drafts, preserved retrieval state,
truthful unknown outcomes, and no added data collection or execution authority.
Verdict: the scoped implementation is complete with no unresolved observed
critical-path defect. Hardware smoothness and assistive-technology user testing are outside the
observed evidence; this is not a TestFlight release approval.

## Boundaries

People and relationship contexts remain canonical. Meetings is a time view of
existing activities, not a new record system. Preparation and notes open a
scoped editable Session draft; existing drafts and pending work take precedence.
Source review, confirmed state, outcomes and external calendar writes retain
separate authority. The calendar's automatic recovery is gated by its active
page, so preloading adjacent content does not start a device write.

Simulator tests and recordings can establish interaction outcomes. They do not
establish hardware frame rate, VoiceOver speech quality, or live field usability.
