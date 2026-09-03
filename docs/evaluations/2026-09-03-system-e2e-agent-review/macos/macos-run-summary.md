# macOS real E2E baseline and retest

- Artifact: `TS-SYSTEM-E2E-2026-09-03-01`
- Frozen repository commit: `5ba505ae45e3df51b3339427da79c96fde42c137`
- Host: Apple silicon, macOS 26.4 (`25E246`), Xcode 26.6 (`17F113`)
- Baseline app: `TalentSignalMac 0.1.0` build `7`, Debug
- Baseline runtime dylib SHA-256: `895c88f2cabbd160500c875cfb56687e9f9b1d83f6de793ceffde67dd46a926d`
- First retest runtime dylib SHA-256: `0590c63729e79587fd2444e0b1a6c3db60d227fc806fdecd5e5ce2f3280ec153`
- Retest-v2 runtime dylib SHA-256: `9352136780ca712e8d4303417357bd3ccb5511fe89ecd37aa4c6206bc7165815`
- 200% layout-fix runtime dylib SHA-256: `caa8a7ca3344f7e669c27cdeb475373bc795539da971237f4bceb5f9035ea7b7`
- Data/effect boundary: repository synthetic fixture only. No production candidate data, Mail handoff, Apple Reminders approval, Calendar write, candidate communication, or other external effect was executed.

## Outcome

The native app, unit suite, and build-for-testing pass. The real app can complete
the primary synthetic Today -> relationship review -> explicit decision ->
verified receipt journey by keyboard. Dark mode, reduced motion, a resizable
desktop window, explicit selected-text capture, system-window-picker
cancellation, prepared local follow-up, reminder preflight, duplicate-action
avoidance, and truthful terminal states were exercised directly.

The frozen baseline does **not** clear the requested release-quality bar. Its
P1 evidence-integrity defect remained reproducible after the first focused
fix. The second source-bound fix then passed the exact four-gate real-UI retest:
an unconfirmed current source keeps governance visible and submission disabled;
selecting Candidate without confirming remains disabled; confirming that exact
source enables submission; and the decision evidence is byte-for-byte the new
selection while the old source is absent. The resulting receipt still states
that nothing was sent.

That P1 is therefore resolved on the retest-v2 working-tree build, not on the
frozen baseline. A subsequent narrow layout fix also resolves the recorded 200%
visual-reachability defect without reducing the candidate-name type size: the
accessibility branch uses the semantic `.title` style, separates the descriptive
suffix into `.title3`, and preserves the complete original identity as one AX
label. Live-backend/UI-runner/VoiceOver gaps remain explicitly unproved.

## Executed checks

| Check | Result | Evidence |
| --- | --- | --- |
| `pnpm macos:check` | **passed**, exit 0: project generation, companion-trial Node tests, native build, all native unit tests, and UI-test build-for-testing | `logs/macos-check.log` (retained locally) |
| `RUN_MACOS_UI_TESTS=1 pnpm macos:check` | native build/unit/build-for-testing passed, then UI runner did not emit a test event for more than three minutes; run was interrupted and is **not counted as passed** | `logs/macos-check-ui.log` (retained locally) |
| focused `AppModelSafetyTests/testSyntheticDecisionReviewPreservesTheExactSubmittedEvidence` after first fix | **passed**, exit 0 | `logs/retest-focused-evidence-match.log` (retained locally) |
| retest-v2 native app build | **passed**, exit 0 | `logs/retest-v2-build.log` (retained locally) |
| retest-v2 four-gate real UI path plus receipt | **passed**: unconfirmed disabled; selected-but-unconfirmed disabled; confirmed enabled; decision exact evidence equals the current source and excludes the old source | [`logs/retest-v2-gate1-unconfirmed-ax.txt`](logs/retest-v2-gate1-unconfirmed-ax.txt), [`logs/retest-v2-gate2-selected-not-confirmed-ax.txt`](logs/retest-v2-gate2-selected-not-confirmed-ax.txt), [`logs/retest-v2-gate3-confirmed-enabled-ax.txt`](logs/retest-v2-gate3-confirmed-enabled-ax.txt), [`logs/retest-v2-gate4-decision-exact-evidence-ax.txt`](logs/retest-v2-gate4-decision-exact-evidence-ax.txt), and [`logs/retest-v2-gate5-receipt-ax.txt`](logs/retest-v2-gate5-receipt-ax.txt) |
| post-layout-fix `pnpm macos:check` | **passed**, exit 0: project generation, companion-trial tests, app build, all native unit tests including `RelationshipWorkspaceLayoutTests`, and UI-test build-for-testing | command result plus the compiled UI test below; this run did not claim UI XCTest execution |
| dark 200% real-app layout retest | **passed** at the 768 px target height in a `1499 x 768` final capture, which is 14 px narrower than the requested 1513 px viewport; a separate near-exact `1514 x 768` scroll-end capture also passes. Semantic Dynamic Type identity remains readable; receipt is in the first viewport; one relationship-scroll action makes the complete separate-local-handoff and both CTA controls visible | [`23-dark-200-percent-post-change-top.png`](screenshots/23-dark-200-percent-post-change-top.png), [`24-dark-200-percent-post-change-cta.png`](screenshots/24-dark-200-percent-post-change-cta.png), [`25-dark-200-percent-post-change-local-draft-receipt.png`](screenshots/25-dark-200-percent-post-change-local-draft-receipt.png), [`logs/200-percent-post-change-top-ax.txt`](logs/200-percent-post-change-top-ax.txt), and [`logs/200-percent-post-change-ax.txt`](logs/200-percent-post-change-ax.txt) |
| direct app/AX state capture | **executed** for `no-action`, `failed`, `outcome-unknown`, `stale`, `deleted`, `ambiguous-identity`, and `clarification` | [`logs/terminal-states-ax.txt`](logs/terminal-states-ax.txt) |
| `pnpm macos:e2e:live` | **not_run**: the system review owner requested that this lane not start Docker/backend compose while a shared backend was being coordinated | reason recorded here; no Docker project was started or stopped |

The XCTest UI target is compiled, but the real UI evidence in this packet comes
from launching the built `.app`, operating it through macOS accessibility/UI
events, saving the resulting accessibility tree, and capturing the visible
window. This is not presented as an XCTest assertion pass.

## Exact journeys

### 1. Today to truthful relationship receipt

1. Launch `--ui-testing --fixture-state ready --today-preview --reduced-motion-preview`.
2. Verify Today leads with the current conversation and three relationship
   follow-ups.
3. Press Command-Option-Down to open the first relationship without opening a
   duplicate window.
4. Verify identity/context, exact evidence, unresolved dependency, and next
   step are present before the decision.
5. Press Command-Option-R to open the exact proposal decision.
6. Verify no choice is preselected and Save is disabled.
7. Press Command-Option-Shift-1, then Command-Option-Return.
8. Verify the receipt says `Relationship updated after your review` and
   `Nothing was sent or scheduled.`

Expected: evidence, interpretation, decision, and receipt stay distinct; no
external effect is implied. Actual: **passed** in fixture mode.

Evidence: [`01-today-ready.png`](screenshots/01-today-ready.png),
[`02-today-relationship-detail.png`](screenshots/02-today-relationship-detail.png),
[`03-proposal-decision.png`](screenshots/03-proposal-decision.png), and
[`04-verified-receipt.png`](screenshots/04-verified-receipt.png).

### 2. Explicit capture and attribution

1. Launch `--fixture-state empty` with dark and reduced-motion previews.
2. Use Command-Option-1 and Command-Option-C to select and confirm the exact
   synthetic Pursuit/Person/relationship scope.
3. Enter only `I need the exact remote-work policy before Wednesday because
   another process moved earlier.` and press Command-Return.
4. Verify upload boundary remains `0 reviewed` and submit is disabled.
5. Use Command-Shift-A and Command-Option-Shift-A to propose and separately
   confirm candidate authorship.
6. Verify the upload boundary changes to exactly one eligible reviewed item.
7. Press Command-Shift-Return, review the decision, explicitly confirm it, and
   save.

Expected: scope confirmation does not imply author attribution and local text
cannot cross the boundary before both reviews. Actual: **passed**.

Evidence: [`13-dark-empty-scope.png`](screenshots/13-dark-empty-scope.png),
[`14-captured-text-boundary.png`](screenshots/14-captured-text-boundary.png),
[`15-attribution-confirmed.png`](screenshots/15-attribution-confirmed.png), and
[`16-dark-receipt.png`](screenshots/16-dark-receipt.png).

### 3. Prepared follow-up and reminder boundary

1. From the verified receipt, select `Prepare local draft`; verify `Draft
   prepared` is a local-only receipt and `Copy` remains a separate action.
2. Open Quick Panel with Command-Shift-Space; inspect the editable draft,
   purpose, Mail handoff boundary, and explicit `Local · not sent` status.
3. Discard the local draft and verify `Nothing was sent`.
4. Select `Create reminder`; inspect exact evidence, reminder title/date,
   relationship/source review, and disabled destination preview.
5. Confirm only the synthetic source author, preview the synthetic destination,
   and cancel without final approval.
6. In `--consequence-preflight-preview`, choose `Use existing action`; verify
   `No Apple Reminder was created` and no destination preview survives.

Expected: draft, reminder proposal, destination preview, final approval, and
verified result remain separate. Actual: **passed** through preflight and
cancellation. No real destination effect was authorized or executed.

Evidence: [`05-prepared-follow-up.png`](screenshots/05-prepared-follow-up.png),
[`07-quick-panel.png`](screenshots/07-quick-panel.png),
[`08-reminder-consequence-review.png`](screenshots/08-reminder-consequence-review.png),
[`09-reminder-final-approval.png`](screenshots/09-reminder-final-approval.png), and
[`19-duplicate-use-existing.png`](screenshots/19-duplicate-use-existing.png).

### 4. Capture cancellation and terminal/recovery states

- Open the macOS single-window picker only from `Choose window…`, then cancel
  from the explicit in-app control. Actual receipt: `Window selection
  cancelled. Nothing was captured or retained.`
- `no-action` visibly preserves the existing owned action and says no duplicate
  was created.
- `failed` offers `Review local Capsule — no retry`.
- `outcome-unknown` offers only `Reconcile original operation` and warns not to
  retry.
- `stale`, `deleted`, `clarification`, and temporal-owner ambiguity remain
  plain-language, non-success states. Identity ambiguity preselects neither
  owner and blocks new-person creation.

Evidence: [`21-system-window-picker.png`](screenshots/21-system-window-picker.png),
[`22-window-picker-cancelled.png`](screenshots/22-window-picker-cancelled.png),
[`state-no-action.png`](screenshots/state-no-action.png),
[`state-failed.png`](screenshots/state-failed.png),
[`state-outcome-unknown.png`](screenshots/state-outcome-unknown.png), and
[`state-ambiguous-identity.png`](screenshots/state-ambiguous-identity.png).

### 5. Window, keyboard, dark, reduced-motion, and 200% checks

- Keyboard-only scope, attribution, submit, proposal decision, and receipt
  completed successfully.
- Dark and Reduced Motion previews preserve state labels and semantic icons.
- Drag-resizing changed the captured workspace from `1199 x 768` to
  `1090 x 732`; content remained available through vertical scrolling, though
  the side-by-side proposal becomes cramped.
- Baseline 200% preview preserved an accessibility tree and vertical scroll,
  but the mixed-script identity consumed most of the decision column. At scroll
  value `1`, the receipt was visible while the local-handoff action remained
  below the visible window boundary.
- Post-change, the accessibility layout keeps `Alexandra 陈嘉宁-Sørensen` in
  semantic `.title` type and moves `International Leadership & Platform
  Transformation` to a separate semantic `.title3` line. The full original
  string remains the candidate's AX label, so visual hierarchy does not weaken
  the identity evidence.
- In the final dark 200% real-app capture at `1499 x 768`—slightly narrower and
  therefore more constraining than the requested `1513 x 768`—the name occupies
  one enlarged line rather than most of the first viewport; the verified
  receipt is already visible. One scroll reaches the full `Separate local
  handoff`, `Prepare local draft`, and disabled-until-prepared `Copy prepared
  draft` controls. A separate `1514 x 768` scroll-end capture brackets the exact
  target by one pixel and shows the same result. The final AX tree reports scroll
  value `1`, a separately addressable full identity label, and the distinct
  `decision.prepareDraft` / `decision.copyDraft` identifiers.

Evidence: [`17-dark-200-percent.png`](screenshots/17-dark-200-percent.png),
[`18-dark-200-percent-scrolled.png`](screenshots/18-dark-200-percent-scrolled.png),
[`20-window-resize-attempt.png`](screenshots/20-window-resize-attempt.png),
[`23-dark-200-percent-post-change-top.png`](screenshots/23-dark-200-percent-post-change-top.png),
[`24-dark-200-percent-post-change-cta.png`](screenshots/24-dark-200-percent-post-change-cta.png),
and [`25-dark-200-percent-post-change-local-draft-receipt.png`](screenshots/25-dark-200-percent-post-change-local-draft-receipt.png).

## Findings

### P1 — current Quick Panel evidence differed from decision evidence

Status: **resolved by the source-bound second fix and real-UI retest-v2**.

Baseline reproduction:

1. Preserve an earlier reviewed candidate source in the Capsule.
2. Finish a relationship review so Quick Panel can later restore a saved flow.
3. Choose `Review another…` and enter `I can decide Friday once the client
   confirms the exact remote policy.`
4. Press Command-Return and verify the consequence card cites that exact text.
5. Select `Review save proposal`.

Baseline actual: the decision cited a static older fixture sentence. The first
fix changed the fixture service to use the latest item in the submitted
manifest and added a passing model-level test.

First-fix real UI retest actual: still failed. The consequence card cites the
new sentence, while the decision cites the older already-reviewed source:
`I need clarity on the remote policy before Friday because the other process
has accelerated.` The new item has not passed source-author review, but a stale
receipt hides governance and the older eligible item keeps
`capsule.canSubmit == true`; submission therefore freezes the older source.

Impact on baseline and first fix: a recruiter could believe they were reviewing
a proposal based on the newly visible selection while the decision was grounded
in a different source. This was an evidence-integrity and human-decision veto,
even though the exact decision card displayed the older evidence.

Retest-v2 actual:

1. With an older candidate-confirmed source and existing receipt, adding the new
   current source kept `Who said this? Needs review` visible and `Review save
   proposal` disabled.
2. Selecting `Candidate` enabled only `Confirm source author`; save remained
   disabled.
3. Confirming that exact source produced `Candidate source confirmed` and
   enabled save.
4. The decision line contained `EXACT EVIDENCE “I can decide Friday once the
   client confirms the exact remote policy.”`; the older evidence string was
   absent from the complete AX tree.
5. Explicit Confirm + Save returned a visible relationship receipt and
   `Nothing was sent`.

The completed proof binds save eligibility and source-bound freeze to the
current `provisionalInsight.sourceItemID`. It does not retroactively convert the
baseline or first-fix recordings into passes.

Evidence: [`11-new-selection-analysis.png`](screenshots/11-new-selection-analysis.png),
[`12-context-decision-return.png`](screenshots/12-context-decision-return.png),
[`retest-01-new-selection-analysis.png`](screenshots/retest-01-new-selection-analysis.png),
[`retest-02-decision-exact-evidence.png`](screenshots/retest-02-decision-exact-evidence.png),
[`logs/retest-pre-submit-ax.txt`](logs/retest-pre-submit-ax.txt), and
[`logs/retest-decision-ax.txt`](logs/retest-decision-ax.txt). Passing v2 evidence:
[`retest-v2-01-unconfirmed-disabled.png`](screenshots/retest-v2-01-unconfirmed-disabled.png),
[`retest-v2-02-selected-still-disabled.png`](screenshots/retest-v2-02-selected-still-disabled.png),
[`retest-v2-03-confirmed-enabled.png`](screenshots/retest-v2-03-confirmed-enabled.png),
[`retest-v2-04-decision-exact-evidence.png`](screenshots/retest-v2-04-decision-exact-evidence.png),
and [`retest-v2-05-receipt.png`](screenshots/retest-v2-05-receipt.png).

### P2 — 200% visual path hid the final local handoff at scroll end

Status: **resolved by the semantic Dynamic Type layout fix and real-app retest**.

At the captured `1199 x 768` window, 200% preview plus accessibility type makes
the long mixed-script identity dominate the main column. After scrolling the
relationship area to value `1`, the receipt is visible but the `Prepare local
draft` control remains outside the visible window boundary. The element exists
in the accessibility tree, so this run does not claim VoiceOver failure, but a
sighted pointer user cannot visually reach the final action from the recorded
surface.

Fix and post-change actual:

1. Keep the person's name at semantic `.title.weight(.semibold)` in the
   accessibility layout; no fixed or smaller point size is used to fit it.
2. Parse only the structured ` — ` / ` – ` display-label separator, leaving an
   unstructured name untouched; render the descriptor as semantic `.title3`.
3. Give the accessibility layout more usable horizontal width, stack handoff
   controls vertically, and add bottom scroll runway so the scaled content can
   clear the viewport edge.
4. Launch the built app with `--fixture-state receipt --identity-tag-count 3
   --accessibility-zoom-200 --dark-appearance-preview
   --reduced-motion-preview` at the 768 px target height, with captures on both
   sides of the 1513 px width (`1499` and `1514`).
5. Verify the enlarged mixed-script name remains one line, the receipt is in
   the first viewport, and one scroll exposes the complete handoff plus both
   CTA controls without horizontal clipping.

The new contract tests preserve the structured-name split and the UI test
asserts that the name cannot consume 45% of the window and that
`decision.prepareDraft` becomes hittable after scrolling. Both test targets
compile; the native contract tests execute and pass. The UI assertion remains
compiled-but-not-executed because the XCTest UI runner limitation is recorded
separately below. Direct real-app screenshots and AX inspection provide the
runtime layout proof.

Evidence: [`17-dark-200-percent.png`](screenshots/17-dark-200-percent.png) and
[`18-dark-200-percent-scrolled.png`](screenshots/18-dark-200-percent-scrolled.png)
for the failing baseline; [`23-dark-200-percent-post-change-top.png`](screenshots/23-dark-200-percent-post-change-top.png),
[`24-dark-200-percent-post-change-cta.png`](screenshots/24-dark-200-percent-post-change-cta.png),
[`25-dark-200-percent-post-change-local-draft-receipt.png`](screenshots/25-dark-200-percent-post-change-local-draft-receipt.png),
[`logs/200-percent-post-change-top-ax.txt`](logs/200-percent-post-change-top-ax.txt),
and [`logs/200-percent-post-change-ax.txt`](logs/200-percent-post-change-ax.txt)
for the passing retest.

## Independent release assessment

- Frozen baseline: **fail** because the Quick Panel evidence-integrity P1 is
  directly reproducible.
- First focused fix: **fail** because the model-level test passes while the
  real restored-receipt UI path still submits an older reviewed source.
- Source-bound fix, retest-v2: **pass for the P1 and its five-step receipt
  path** with direct UI and AX evidence.
- 200% layout fix: **pass** for the recorded P2 at the target desktop height and
  content width, with a semantic Dynamic Type build and direct app/AX evidence.
- Overall macOS release claim: **not established by this lane**. Live-backend,
  actual UI XCTest execution, and actual VoiceOver operation remain `not_run`
  rather than inferred from fixture or compilation evidence.

## Not run / limits

- Live shared-backend macOS E2E, response-loss proxy, canonical receipt DB
  readback, and relaunch reconciliation: `not_run` pending the review owner's
  unified backend. No compose service was started by this lane.
- Real Apple Reminders create/remove, Mail draft opening, or external message:
  deliberately `not_run` because the frozen safety boundary prohibits real
  external writes. Preview-only and unit-test boundaries were exercised.
- Actual VoiceOver speech/caption interaction: `not_run`. Accessibility labels,
  order, focusable controls, and state were inspected through the real app AX
  tree; that is not equivalent to a VoiceOver usability pass.
- UI XCTest assertions: `not_run` because the runner did not establish a usable
  host session. Compilation is recorded separately.
- Full-screen and multi-display behavior: `not_run`.

## Cleanup

All Talent Signal app processes and the orphaned UI-test runner started by this
lane were stopped. No Docker/backend service was started. Runtime identities
and evidence were retained in this packet. The explicit temporary DerivedData
directories created by this lane were moved to the macOS Trash at handoff, so
they remain recoverable but are not active or release artifacts.
