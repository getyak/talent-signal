# Agent work lifecycle Live Activity and action handoff

## Status

Completed implementation slice on 2026-08-29. The user explicitly asked the
Agent to resolve the direction and complete the elegant end-to-end lifecycle
instead of waiting for the recruiter study. Direction `73` (Quiet Handoff) is
therefore the implementation baseline because it makes the running-to-review
attention handoff primary. This is a user-authorized implementation decision,
not a Gate 1 research result.

The visual evidence contract still requires all of the following before the
repository may claim Gate 1 validation:

- `gate1Decision = PASS`;
- one `selectedDirection` in `17 | 42 | 73`;
- the raw eight-recruiter Gate 1 JSON or CSV showing that the selected direction
  passed its compact misunderstanding gate and the Lock Screen comprehension
  and privacy gate.

The connected Notion pages still report `0/8`, `UNSET`, `0/10` real ActivityKit
screenshots, and `0/4` boundary-atlas states. The current browser session has no
recoverable Gate 1 page or participant results. An Agent must not invent the
participants or present direction 73 as recruiter-validated. The existing
recording Live Activity also cannot become proof of the research Activity.

## Outcome

Deliver one truthful Debug-only Agent lifecycle showcase that uses real
ActivityKit surfaces to demonstrate a single privacy-safe task moving from
`preparing` through discrete processing stages to `completed + review + fresh`.
The exact synthetic review route then moves into evidence-backed, independently
selectable action cards such as create contact, update contact, and create
meeting, and ends only the expected Activity instance.

The user questions are: while the recruiter is away from the App, what trusted
stage is active and may they remain away; when the Agent is done, which proposed
changes are available to inspect, approve, dismiss, or leave unapplied?

## Boundary

In scope under the user's direction-73 implementation authorization:

- one Agent-work domain state split into execution, attention, freshness, and a
  small truthful stage vocabulary;
- one pure projector shared by the App and Widget Extension;
- opaque task and Activity-instance identity, monotonic revision handling,
  terminal-state protection, payload allowlisting, and safe fallback;
- minimal, compact, expanded, and Lock Screen surfaces for the selected
  direction;
- deterministic Debug controls for Start, stage-by-stage Advance, Open review,
  and End showcase;
- exact task + instance deep-link validation, foreground expiry cleanup, sign
  out/delete cleanup, and duplicate-start recovery;
- a calm Actions area that separates the one current Live Activity route from
  reviewable contact/meeting cards and from App Shortcut / Action Button setup,
  labels simulation honestly, and never claims it can read or assign the
  physical Action Button binding;
- localization, accessibility, Release isolation, focused tests, system
  screenshots, and evidence receipts.

Out of scope:

- APNs, push-to-start, backend token registries, outbox delivery, or Atom B;
- real candidate, company, conversation, research-body, or contact data;
- island approval, contact/calendar writes, candidate messaging, ATS/CRM writes,
  or another external effect;
- fake progress, ETA, background timers, automatic task cancellation, or a
  claim that Simulator proves Always-On or background delivery;
- commit, push, pull request, TestFlight upload, or production release.

## Current evidence

- Current repository revision is
  `7981df785c6275f471f82d9505972a8567d5bed9`; `origin/main` is
  `75ff39b7964dfaaced691a69ca80ad144e64922f` as observed on 2026-08-29. The
  local-only commit adds `.data/` to `.gitignore` and does not change iOS code.
- The repository already embeds `TalentSignalLiveActivity`, but it projects the
  foreground audio-recording contract (`Recording Signal` → `Saved ·
  Organizing` → `Ready to Review`). It has a Stop App Intent and may remain a
  separate Widget in the same extension bundle.
- The App already exposes App Shortcuts and an Action Button setup surface. iOS
  does not expose the active physical Action Button mapping to the App, so the
  UI correctly relies on explicit user confirmation and must preserve that
  truth boundary.
- The Notion implementation package defines the research state contract,
  ten-system-screenshot manifest, four-state boundary atlas, two uncut videos,
  and synthetic-timing disclosure. Those pages are dated external evidence,
  not proof that the code or recruiter study is complete.
- The only unrelated worktree state observed at planning time is untracked
  `.data/`; this plan does not inspect, edit, or remove it.

## Design read

- **Primary surface:** iOS capture / Today companion projected into Live
  Activity system surfaces, with a Debug showcase in the App.
- **Audience:** independent recruiters moving between bounded public research
  and mobile review.
- **Character:** quiet evidence instrument, warm neutral App surface, black
  system island, one restrained vermilion causal seam, no decorative glass,
  glow, particles, or continuous loading theater.
- **Canonical object:** one synthetic research task; every App, island, Lock
  Screen, and review view is a projection of the same task + Activity instance.
- **Attention hierarchy:** trusted stage, evidence boundary, whether the user
  must return, then one reversible route into the App.

## Approach

1. Record direction 73 as a user-authorized implementation choice while
   keeping Gate 1 evidence explicitly unverified.
2. Add pure research attributes, domain state, validation, projection, and
   tests without coupling them to the existing recording activity.
3. Extend the existing Widget bundle with a separate research Activity widget
   that consumes only the shared projector and selected visual tokens.
4. Add a controller that deduplicates by account × installation × environment ×
   task, rejects stale/conflicting revisions, and updates/ends only an exact
   task + instance pair.
5. Add a Debug-only showcase and route. Keep the completed review state active
   until exact deep-link validation succeeds; perform abandoned-fixture cleanup
   on the next foreground transition.
6. Recompose the App's action-management surface so Live Activity controls,
   App Shortcuts, Action Button setup, simulation, disabled capability, and
   failure recovery are visibly distinct. Preserve one primary action per
   current state and 44-point touch targets.
7. Generate with XcodeGen, run focused tests and `pnpm ios:check`, then verify
   the real system surfaces on the required simulator/device boundaries.
8. Record the screenshot/video manifest and only then update the Notion evidence
   board with fact-level PASS/FAIL results.

Rejected approaches:

- selecting 17, 42, or 73 from Agent taste would invalidate the human Gate 1;
- replacing the recording activity would conflate two different business
  states and remove a working foreground-safety feature;
- placing high-consequence controls in the island would bypass the review gate;
- styling a custom black capsule in the App would not prove ActivityKit;
- using a timer or closed progress ring would claim timing evidence the task
  does not have.

## Milestones

1. **Completed — implementation direction**
   - direction 73 selected under explicit user authorization;
   - Gate 1 remains labeled `UNVERIFIED`, with no invented participant result.
2. **Completed — executable state contract**
   - test every supported execution × attention × freshness projection;
   - test illegal combinations, duplicate/out-of-order/conflicting revisions,
     terminal regression, identity mismatch, allowlist, and 4 KB limit.
3. **Completed — system surfaces and lifecycle**
   - implemented selected minimal/compact/expanded/Lock Screen views;
   - implemented unique-instance start, ordered update/end, relaunch expiry
     cleanup, exact deep link, and disabled fallback.
4. **Completed — Debug demo and actions management**
   - implemented deterministic Start → Read evidence → Check identity → Prepare
     actions → Review evidence → Choose action cards → Local outcome;
   - keep synthetic disclosure visible;
   - implemented separate create-contact, update-contact, and create-meeting
     cards derived only from confirmed facts;
   - preserved truthful App Shortcut / Action Button setup and simulated state.
5. **Completed — implementation verification and evidence**
   - `pnpm ios:check` passed: clean Release build, 214 unit tests, and 83
     isolated UI scenarios with 79 passed, 4 environment-gated skips, and 0
     failures;
   - localization, documentation, Release isolation, stale-state, exact
     deep-link, action-card, and settings regressions passed;
   - real Simulator Dynamic Island receipts prove the running `AWAY` and
     completed `REVIEW` states and the exact deep-link return. Simulator proof
     does not establish physical-device Always-On behavior.

## Implementation completion proof

- The App and extension share one deterministic projector, and focused tests
  prove identity, ordering, privacy, illegal-state, stale, failure, and cleanup
  behavior.
- The real surface visibly moves one task + instance from running to review;
  the review CTA revalidates identity and ends only that instance.
- Actions management shows one current next step, separates setup from
  execution, discloses simulation, and never claims a physical mapping or
  external write that cannot be read back.
- `pnpm ios:check`, localization checks, documentation checks, and Release
  boundary checks pass.

## Research validation still unverified

- The exact Gate 1 export and recruiter-selected direction have not been
  supplied. No Agent-authored participant result is used.
- TS-LA-01…10, the four-state research atlas, physical-device Always-On proof,
  and independent recruiter comprehension results remain research work. They
  are not prerequisites for the completed Debug implementation showcase and
  are not claimed by it.

## Replanning signals

Re-plan if no candidate passes Gate 1, the selected direction fails real system
geometry or accessibility, current `origin/main` changes the iOS routing or
extension contract, the existing recording activity and research activity
cannot safely coexist in one extension, or system limits prevent the required
minimal proof without a separate deterministic fixture.
