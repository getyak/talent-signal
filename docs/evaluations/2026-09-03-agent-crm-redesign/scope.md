# Agent CRM first-slice review scope

## Frozen artifact

- Artifact ID: `TS-AGENT-CRM-IOS-2026-09-03-02`
- Type: iOS implementation and Simulator evidence
- Repository base: `8443a7d2ed9aa6332189747728421c0bce6760ac`
- Frozen date: 2026-09-03
- Devices: iPhone 17 Pro Simulator, iOS 26.5, portrait, English; iPhone SE
  (3rd generation) Simulator, iOS 26.5, portrait, Simplified Chinese at AX5
- Entry state: synthetic preview workspace; no real candidate or customer data

The review object is the dedicated Agent destination opened from the existing
top-left relationship orb, plus its Sources & imports child screen. Today,
Sessions, People, and Calendar remain separate work surfaces.

## Scenario

A time-constrained relationship professional wants to understand and configure
the product's AI identity without turning Today into a dashboard. They open the
Agent destination, scan the four top-level controls, then inspect source states
to understand what is available now and what is only planned.

The visible success condition is:

1. the Agent has a recognizable, renameable identity without theatrical chat
   or activity metrics;
2. the first level contains only Memory, About you, Sources & imports, and
   Action permissions;
3. LinkedIn profile URL is described as an identity reference, not account
   access or synchronization;
4. Action Button and outbound Calendar capabilities remain reachable;
5. unimplemented LinkedIn archive and Contacts/vCard/CSV imports are visibly
   planned and non-interactive;
6. consequential writes still require human approval.
7. a stored LinkedIn profile reference can be cleared from the governed source
   screen, and remains cleared after relaunch.

## Evidence bundle

- [`RelationshipAgentStudioView.swift`](../../../apps/ios/Sources/Features/RelationshipAgentStudioView.swift)
- [`RelationshipArchiveView.swift`](../../../apps/ios/Sources/Features/RelationshipArchiveView.swift)
- [`RelationshipArchiveModels.swift`](../../../apps/ios/Sources/Features/RelationshipArchiveModels.swift)
- [`CandidateSignalUITests.swift`](../../../apps/ios/UITests/CandidateSignalUITests.swift)
- [`RelationshipArchiveTests.swift`](../../../apps/ios/Tests/RelationshipArchiveTests.swift)
- [`01-today-entry.png`](screenshots/01-today-entry.png)
- [`Agent is a dedicated sparse destination`](ui-test-attachments/DE352783-4D08-41B3-B37C-F8B95C0AAA6B.png)
- [`Agent sources distinguish available and planned`](ui-test-attachments/E66EFB07-7D49-40B9-B3D5-82CBCAC367F1.png)
- [`Agent in Simplified Chinese at AX5 on compact width`](compact-ax5/BDE7DED5-D0F6-40AA-B87A-B7AB1099356E.png)
- [`Sources in Simplified Chinese at AX5 on compact width`](compact-ax5/D04A5A91-629D-419B-B837-0DCF25BFB628.png)
- UI test result: `testAgentStudioIsADedicatedSparseDestination` passed on
  iPhone 17 Pro Simulator in 27.381 seconds, including enter, clear, relaunch,
  and `Not added` recovery for the LinkedIn profile reference.
- UI test result: `testAgentStudioRemainsReachableInChineseAtAX5` passed on
  iPhone SE (3rd generation) Simulator in 14.042 seconds.
- Existing-settings regression result:
  `testWorkspaceMenuLeadsWithAccountSetupAndRealUtilities` passed in 19.228
  seconds after the entry changed from a menu to Agent Studio.
- Unit test result: `RelationshipArchiveTests` passed with 84 tests and
  0 failures on iPhone 17 Pro Simulator.
- Release Simulator build result: `BUILD SUCCEEDED` after the final source and
  localization changes.
- Repository proof: `pnpm docs:check` passed on 2026-09-03.

## Panel

- `recruiter-workflow-reviewer`: required for operational usefulness and
  interruption cost.
- `evidence-safety-reviewer`: required because the screen exposes Memory,
  sources, imports, and action authority.
- `mobile-ux-reviewer`: required for iOS hierarchy, reachability, accessibility,
  and narrow-screen behavior.

Candidate-experience, selection-science, sourcing, performance, motivation,
potential, and trend lenses are omitted because this slice neither communicates
with a candidate nor assesses, ranks, searches for, or recommends a person.

## Intentional limits

- This slice does not implement general personal Memory persistence or a
  LinkedIn/CSV/Contacts import pipeline. The UI says so.
- It does not prove the future import pipeline's duplicate, partial retry,
  deletion, or revocation behavior; those remain gates for that later slice.
- It proves local clear-and-relaunch behavior for the current LinkedIn profile
  preference, not backup, export, or future cross-device deletion semantics.
- It does not authorize external writes. Existing approval settings are reused,
  and the screen states the approval boundary.
