# Quiet Workspace v1 reconstruction

## Outcome and boundary

Apply the Open Design local handoff at `8e4a4b0` to the current Web and macOS
surfaces from `e183586b`. Keep real domain controllers, account boundaries,
source review, approval and native capability checks. Reference repository:
[design handoff](https://github.com/getyak/talent-signal-design-handoff)
(updated locally with fast-forward).
The main checkout has unrelated uncommitted backend/contracts work and is 73
commits behind; implementation is isolated in `codex/quiet-workspace-v1`.

## Route and capability reconciliation

| Surface | Treatment |
| --- | --- |
| Workspace / unscoped input / scoped person | Retain controllers; quiet reading hierarchy and composer |
| Today / Pursuits / review | Retain canonical attention and decisions; shared typography |
| Sessions / session detail | Retain durable drafts, retries and account binding; compact list |
| People / person / captures | Retain identity, source and editable records; refine directory |
| Meetings | Retain calendar, agenda and scoped draft handoff |
| Plugs | Retain honest provider/capability states |
| Account / preferences / testing | Retain real settings; compact sections |
| Monitor / evals / Lab / boundaries | Keep existing settings/deep links; do not promote to primary navigation |
| macOS Hybrid | Refine local-asset host; retain Keychain, IPC allowlist and capability gates |
| Native SwiftUI companion | Align chrome, neutral palette and reading hierarchy; retain native workflows |
| Prototype Groups / fake replies / reviewer tools | Omit; no canonical implementation or ordinary-user purpose |

## Architecture

Shared workspace theme owns semantic colors, sizing and focus. Web maps those
variables to existing feature styles only inside authenticated chrome, leaving
marketing unchanged. Feature CSS stays with the feature. Navigation metadata
is separated from rendering. Native host owns connection lifecycle; presentation
must not claim full CRM parity while its scope is native capture capabilities.
Keep the existing Next/React + Tauri + Swift adapters; no new store or API.

## Milestones

1. Completed: refreshed reference and production baseline; inspected HTML/CSS/TSX,
   assets, contracts and existing host boundaries.
2. Completed: shared theme, Web chrome, recent Session projection, compact directory,
   existing object/meeting/settings typography; native host presentation extraction.
3. Completed: lint, typecheck, regression, builds, native unit tests and bounded
   rendered checks described below.
4. Completed: independent review; menu clipping, short-window reachability and
   local Session expiration findings fixed and re-reviewed without open findings.

## Proof

Check real feature controllers with their existing tests. Capture rendered light,
dark, narrow and enlarged-text states using synthetic isolated fixtures only.
Verify keyboard focus and collapse without hiding recovery paths. Run docs check.
Native permissions, real account binding and signed distribution require actual
runtime evidence; static markup or a browser preview cannot establish them.

## Verification record

- Web full suite: 638 passed, 1 skipped before the final expiration-boundary
  counterexample; final focused navigation, shell and expiration checks: 27 passed.
- Shared workspace UI: 18 passed. Hybrid: 14 passed, typecheck and Vite build passed.
- SwiftUI macOS: Xcode build and tests passed, 119 passed and 5 skipped. Native
  skipped tests remain unverified, not implicitly successful.
- Web typecheck, ESLint, production build and documentation checks passed.
  Production build used a synthetic build-only AUTH_SECRET, no production secret.
- Reference prototype model tests: 14 passed; these are reference-only evidence.
- Actual Next.js components rendered against an isolated synthetic loopback
  backend: People long-name/missing-profile rows, sidebar collapse, account menu
  opened by keyboard, theme switching and Escape dismissal inspected.
- Web widths 1440, 1024 and 390: no horizontal document overflow. At 1024x540,
  the account control bottom was 526px; it stayed in the viewport.
- Hybrid browser rendering: 1440 desktop, 56px collapsed rail and 390px narrow
  surface checked. No horizontal overflow; missing native bridge stayed a visible
  unavailable state and did not fake a verified connection.
- Session projection rejects another binding, malformed IDs, expired/deleted
  entries and duplicates; local expiration removes known-expired rows without
  waiting for the network. Remote deletions refresh on visibility/navigation and
  a bounded 60-second visible-page poll; canonical detail reads remain authoritative.

## Acceptance limits

The browser backend above was synthetic. This run does not establish production
account/provider writes, real native capture/OCR/Keychain permission prompts,
200-percent text scaling, or signed/notarized distribution. Existing backend and
IPC contracts were retained. The Hybrid host still provides native capability
workflows; full Web CRM packaging into that host was not implemented by this
layout refactor. No fake People, calendar, OAuth or conversation controls were
added to imply parity. Production deployment and final human visual acceptance
remain separate from source/test completion.

Review fixes live in scoped CSS and expiration tests, not new global AGENTS rules.
Temporary preview servers are stopped; registered Xcode artifacts are removed
only after this test-count readback is retained. The isolated worktree remains the
reviewable implementation; unrelated main-checkout changes are preserved.
