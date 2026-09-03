# Agent CRM first-slice summary

## Verified on the frozen artifact

- Today remains the primary attention surface; the Agent opens from the
  existing top-left orb rather than replacing the Today screen.
- The dedicated Agent destination presents only four first-level controls:
  Memory, About you, Sources & imports, and Action permissions.
- The Agent has a visible identity and editable alias, but no theatrical
  chat CTA, activity score, or unsupported autonomy claim.
- LinkedIn is framed as a profile reference URL only. The UI states that it
  does not grant account access or background synchronization.
- The same governed source surface exposes a clear action, explains that the
  value is an app preference rather than account authorization, and a UI test
  proves the cleared value stays absent after relaunch.
- Action Button and Apple Calendar projection remain reachable from the Agent
  source settings and are described as reviewable capabilities.
- Planned imports for LinkedIn archive and Contacts/vCard/CSV are visibly
  marked as planned and non-live, reducing the chance that a recruiter
  mistakes roadmap affordances for connected data.
- The action boundary remains explicit: consequential writes still require
  human approval.

## Evidence

- Build artifact: `apps/ios/Sources/Features/RelationshipAgentStudioView.swift`
- Entry wiring: `apps/ios/Sources/Features/RelationshipArchiveView.swift`
- Sheet identity: `apps/ios/Sources/Features/RelationshipArchiveModels.swift`
- UI test coverage: `apps/ios/UITests/CandidateSignalUITests.swift`
- Today screenshot: `screenshots/01-today-entry.png`
- Agent screen screenshot:
  `ui-test-attachments/DE352783-4D08-41B3-B37C-F8B95C0AAA6B.png`
- Sources screen screenshot:
  `ui-test-attachments/E66EFB07-7D49-40B9-B3D5-82CBCAC367F1.png`
- Compact Simplified Chinese AX5 screenshots:
  `compact-ax5/BDE7DED5-D0F6-40AA-B87A-B7AB1099356E.png` and
  `compact-ax5/D04A5A91-629D-419B-B837-0DCF25BFB628.png`
- Focused Agent UI test passed in 27.381 seconds, including clear-and-relaunch
  recovery. Compact Simplified Chinese AX5 coverage passed in 14.042 seconds.
- The existing settings path regression passed in 19.228 seconds.
- `RelationshipArchiveTests` passed with 84 tests and 0 failures.
- Documentation verification: `pnpm docs:check` passed on 2026-09-03.
- Build verification: the final Release Simulator build succeeded on
  2026-09-03 after the source and localization changes.

## Residual risk and intentional limits

- The current slice does not implement personal memory persistence, LinkedIn
  archive import, or Contacts/vCard/CSV import execution. The UI correctly
  labels those as unavailable or planned.
- The current slice does not prove import duplicate handling, partial retry,
  revocation, deletion, or import receipts. Those remain acceptance gates for
  the future import pipeline slice.
- The changed surface has no focused VoiceOver traversal proof yet. Compact
  width, Simplified Chinese, AX5 text size, and target sizing are directly
  exercised, but spoken order and announcement quality remain a release-hardening
  check.
- The top-left orb is semantically labeled and tested, but first-run field
  evidence is still needed to know whether a lightweight coach mark is required.
