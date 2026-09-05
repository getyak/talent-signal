# iOS paged retrieval

Status: implementation and independent review complete; release verification
in progress.

## Outcome

Make Today, Sessions, and People feel like one continuous mobile retrieval
space: a horizontal page gesture changes the primary destination, the top
selection visibly follows that movement, and row-level secondary commands no
longer compete for the same gesture.

## Boundary

- In scope: the primary retrieval pager and header motion, Session and People
  row command entry points, accessibility equivalents, canonical interaction
  guidance, and focused regression tests.
- Out of scope: changes to governed relationship state, Session persistence,
  People identity, external writes, or the visual hierarchy inside each page.
- The release work is isolated from unrelated changes in the original dirty
  worktree.

## Approach

1. Use a native page-style container in every workspace phase so the page
   follows the finger with platform paging physics.
2. Report live page geometry to the header and interpolate a restrained
   stretching indicator between measured tab anchors; mirror gesture progress
   in RTL and remove elastic treatment under Reduce Motion.
3. Replace Session and People row swipe actions with a 44-point trailing menu,
   keep the matching native context menu, and preserve explicit confirmation
   for local Session deletion.
4. Preserve page-local search, filter, and scroll state across page changes and
   temporary sheets rather than rebuilding the pager for transient dismissal.
5. Rewrite focused UI tests around paging, menu equivalence, direction,
   destination state, and accessibility identifiers.

## Rejected alternatives

- Keeping both page paging and row swipes: repeats ambiguous same-axis gesture
  arbitration.
- Custom velocity or angle thresholds: adds recognizer, RTL, accessibility, and
  physics debt without improving the ownership model.
- Long press as the only row shortcut: too hidden; the visible menu is the
  discoverable equivalent.
- Equal-width indicator segments: drift from the real label positions under
  RTL and adaptive layout.
- Rebuilding the entire pager to close row actions: row swipes no longer exist,
  and reconstruction discards useful People search and filter context.

## Independent review resolution

The review returned `pass_with_changes / HOLD`, with no safety veto. It found
two high-priority defects and one proof blocker:

- RTL used LTR-only page-progress and indicator geometry. Resolved by applying
  semantic direction to page measurements and interpolating measured tab
  centers.
- The old transient-intent generation rebuilt the pager and cleared People
  state. Resolved by removing identity-based reconstruction while retaining
  scroll-position capture.
- Core interaction tests had not executed. Release remains held until the
  focused suite and release checks pass.

The adaptive header also moves utility actions to their own row at
accessibility text sizes and caps only compact navigation chrome at XXXL,
instead of shrinking labels to 72 percent.

## Completion evidence

- A drag changes Today to Sessions, then People, and reverses reliably in LTR
  and RTL.
- Session and People commands are reachable from both the visible menu and long
  press, without row swipe actions.
- Top selection stays semantically selected and the visual indicator follows
  measured page progress.
- Search, filter, and scroll state remain owned by each destination.
- Relevant iOS build/tests, localization checks, documentation checks, and
  clean-diff checks pass before release.

## Verification record

Pending final isolated-worktree verification.
