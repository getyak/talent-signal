# Quiet Workspace reference fidelity and native craft

## Outcome

The user rejected PR206's visual quality despite functional verification. Match
reference 8e4a4b0's actual rendered pages and final CSS overrides, not a reduced
interpretation of DESIGN.md. Product controls retain real authenticated behavior.
Parent owns evidence/review/delivery/native architecture; Pi owns scoped coding.

## Frozen acceptance

Frozen craft rubric: geometry 25, type/material 20, subpage parity 20,
interaction/accessibility 20, native/platform 15. Target total at least 95, each
category at least 90%, no P0/P1 or false functional control. Scores are subjective
expert observations backed by rendered comparisons, not user-study results.
Missing evidence stays unverified and cannot earn automatic points.

Compare home, sidebar/menu, people, person, calendar, settings and drilldowns,
connections, conversation, source/review. Include light/dark, 1440x1000 and narrow
views, keyboard, reduced motion, empty/error states and native runtime. Preserve
all explicit mismatches and deductions across Pi revisions; do not tune rubric
to the result. Capability omissions are declared, never simulated as success.

## Baseline mismatches

- Secondary navigation takes the reference's conversation hierarchy space.
- Settings is a wide administration layout rather than narrow grouped rows.
- Composer uses earlier design styles, not the final workbench override.
- Person header, controls and nested legacy sections use inconsistent density.
- Native wrapper lacks ordinary focused commands and native preferences.

## Milestones

1. Complete: Pi Web pass followed by parent corrections after provider HTTP402.
2. Complete: native preferences, focused commands and real runtime verification.
3. Complete: parent rendered comparison and independent source review. Independent
   rendered scoring is unavailable; do not present source review as visual review.
4. Active: current-head CI, merge, resident restart and release readback.

## Execution evidence

Pi task: 20260920-130425-57939f82. Base35c26c2e. Parent isolated worktree:
`/Users/cubxxw/data/talent-signal-quiet-fidelity`. Synthetic artifacts are registered
under `/private/tmp/ai-test-quiet-fidelity-final.xcsza0`; no private candidate data used.
Reference and actual UI are inspected via CUA. Registered artifacts and test
containers are removed after durable delivery evidence is recorded.

### Iteration 1 and independent findings

Pi stopped after 202 replies with provider HTTP402 Insufficient Balance. Its
uncommitted Web diff was reviewed and integrated into the parent worktree; no
blind retry or extra model budget was attempted. Parent continues implementation.

Independent review found and closed: P1 implicit composer submission when Enter
was pressed in person search; P2 filtering only first8 people; misleading
association labels. Composer is now a group with explicit send activation,
search covers the authorized response before limiting suggestions, and labels
say find/open. CUA with a real unsent draft, query and Enter kept the draft and
popup; database readback showed zero agent_sessions. Normal navigation restored
the draft. Profile labels now use matching canonical workspace/user data and
layout revalidation; stale JWT display names no longer persist in the sidebar.

Native review closed shared origin resolution, durable pending settings navigation,
and settings/main-window level coordination. CUA verified Cmd-comma, zoom, Cmd1,
CmdK/Escape, back, floating toggle, and settings reopening a closed workspace at
/workspace/settings. Full native unit run:125 passed,5 skipped,0 failed.
Web full unit run:714 passed,1 skipped,0 failed (before final visual refinements).

Evidence note: two registered artifact directories were removed by concurrent
machine cleanup despite an open owner handle. Source worktrees were unaffected.
Current native xcresult is in registered quiet-fidelity-final.xcsza0. Durable
counts above were read from xcresulttool summary. Independent subagent browser
bridge is unavailable; do not treat its source review as a rendered visual score.

### Final local verification

Web:715 passed,1 skipped; lint,typecheck,production build passed. Documentation,
Wiki and architecture checks passed. Native:125 passed,5 skipped; source review
and real macOS preference/navigation/file-dialog checks passed. No unresolved
P0/P1. Final source review also closed narrow draft-menu overflow and false
compiled-brief labeling (shared visible Wiki projection with regression test).

CUA evidence:1440x1000 source/reference home comparisons; populated person,
people, calendar, connections, settings overview/account, conversation and source
review. At390px the draft popup bounds are x31..261 and document width390.
Dark settings preserved hierarchy; reduced-motion emulation returned true and
interactive controls' transition durations were0.00001s. Reset emulation and
restored light appearance. Native settings used100% zoom/floating off after QA.
Native file selection opened NSOpenPanel and canceled without upload. Draft
navigation/back restored exact text; own test text was cleared and saved.

Parent craft assessment (subjective, synthetic scenarios, not a user study or
independent visual certification): geometry24/25; typography/material19/20;
subpage/configuration19/20; interaction/accessibility19/20; native/platform14/15.
Total95/100; every category exceeds90%. Preserved deductions: small home vertical
spacing differences; fallback initials and technical provenance metadata;
source-review detail is denser than the reference; complete VoiceOver traversal
is unverified; WebKit content retains a separate web topbar beneath native chrome.
These are deliberate limits, not claims of pixel identity or fully native SwiftUI
content. Native controls/preferences/menus/file dialogs are platform-owned.

Missing reference capabilities are not fake controls: the reference companion,
MCP catalog and automatic calendar synchronization are not available production
contracts. Real connection scope, recoverability and meeting drafts remain visible.
Pi cannot continue until its provider balance is restored; parent completed the
remaining implementation and verification without retrying an exhausted provider.
