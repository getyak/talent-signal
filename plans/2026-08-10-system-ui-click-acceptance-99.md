# System UI click acceptance at 99

## Outcome

Determine whether the current Web product is usable enough to charge for, then
raise the system through evidence-backed interaction fixes. The requested
`>99/100` is an atomic browser acceptance gate, not an average of specialist
opinions or a claim about design taste.

Completion requires at least 99 of 100 current-build atoms to pass, every
safety-critical atom to pass, no active panel veto, and direct evidence for the
authenticated production loop. Unrun checks count as zero for the release
claim.

## Boundary

In scope:

- public Web navigation, product proof, Demo, access and login states;
- authenticated workspace capture, evidence review, relationship state, Wiki,
  People, failure, retry, stale, deletion, and responsive behavior;
- current local and deployed runtime evidence;
- code-fixable interaction defects and focused regression tests.

Out of scope without separate authority:

- deploying credentials, restarting externally managed OrbStack, or enabling a
  provider account;
- processing real candidate conversations;
- sending messages or writing Calendar, Contacts, or ATS state;
- substituting synthetic checks for recruiter field evidence, provider
  lifecycle inspection, or assistive-technology user evidence.

## Frozen baseline

- Commit: `149182a55d96f337d5e2d0ca80ffc90d4189bd15`.
- Worktree: clean before this plan.
- Live Demo: reachable at `https://gettalentsignal.com/demo`; its seeded
  relative deadline and availability were both confirmable without a source
  date or timezone.
- Live login: reachable, but Google, Apple, and email were all disabled, so the
  workspace had no usable production entry.
- Local Web and backend: both returned `502`; OrbStack's Docker socket was
  absent.
- Historical proof: 26 of 26 browser checks and 136 of 136 synthetic extractor
  checks passed on earlier frozen builds. They remain useful regression
  evidence but do not prove the current deployed runtime.

## Design decision

This pass inherits the prior Evidence desk winner and its Relationship dossier
challenger from `plans/2026-08-09-workspace-relationship-loop-redesign.md`.
No new visual direction is justified. The primary surface is the desktop
knowledge workspace, with public Demo and access states as entry surfaces. The
user question is: "Can I see what changed, what is unresolved, and what I may
safely do next?"

Design read: targeted evolution for independent recruiters, quiet editorial,
trust-first, and content-led. Dials are variance 4, motion 3, density 5. Preserve
the existing warm-neutral, vermilion, Phosphor, and native CSS system.

## The 100-point atomic gate

Each atom is worth exactly one point. A pass needs an observable current-build
result. `not_run`, historical-only evidence, or supported inference earns zero.
Safety-critical atoms are marked `critical`; any critical failure blocks paid
release regardless of total.

1. `PUBLIC-01..10`: home load, five-second promise, product CTA, relationships
   route, method route, trust route, research route, privacy route, theme, and
   keyboard navigation.
2. `DEMO-01..10`: local-only disclosure, source context, empty input error,
   loading feedback, exact evidence, relative-date clarification, no meeting
   from availability, edit, dismiss/restore, and no-action.
3. `ACCESS-01..10`: workspace entry, configured method visibility, no dead
   controls, honest unavailable state, request access, Demo fallback, safe
   callback, auth error, sign out, and production authenticated reachability.
4. `CAPTURE-01..10`: intentional entry, source-owner review, crop, redaction,
   replace, cancel, retry, duplicate prevention, no persistence before commit,
   and mobile modal escape.
5. `IDENTITY-01..10`: explicit person/context, same-name ambiguity, speaker
   review, forwarded-source authority, current/historical owner order, no
   preselection, unresolved outcome, new-person block, attach operation, and
   correction history.
6. `REVIEW-01..10`: exact quote, proposed label, ambiguity behavior, edit,
   dismiss, confirm, before/after, conflict, supersession, and stale expiry.
7. `STATE-01..10`: confirmed state readback, Wiki provenance, People readback,
   source ledger, timeline, no-action, refresh continuity, cross-day return,
   deletion propagation, and restoration to review.
8. `ACTION-01..10`: one next move, independent approval, exact target/effect,
   permission-at-execution, idempotency, destination result, unknown timeout,
   safe retry, reconciliation, and audit/reversal.
9. `MOBILE-01..10`: 390-pixel first task, 375-pixel small phone, large phone,
   landscape, zero overflow, 44-pixel targets, bottom inset, mobile focus order,
   virtual keyboard, and background/relaunch.
10. `A11Y-01..10`: skip link, headings, form labels, visible focus, color
    independence, reduced motion, dark mode, 200-percent text, screen-reader
    order, and keyboard-only critical path.

## Milestones

1. Record the current 100-atom baseline and distinguish failure from missing
   proof.
2. Fix the public Demo's temporal authority, replace dead login controls with
   an honest access path, and put the mobile first-source task before the idle
   Agent explanation.
3. Run focused tests, typecheck, lint, build, and browser checks on desktop and
   mobile.
4. Restore a current authenticated runtime when the existing external daemon is
   available, then execute the remaining workspace atoms.
5. Retest recruiter workflow, evidence safety, and mobile UX on one frozen
   artifact and adjudicate without averaging their rubrics.

## Completion evidence

- a versioned 100-atom JSON result with exact artifact/build and locators;
- before/after browser screenshots for every changed visible state;
- zero console errors and no horizontal overflow in tested viewports;
- focused tests plus repository lint, typecheck, build, and docs checks;
- valid reviewer and panel packets tied to the same frozen artifact;
- a paid-readiness verdict that names every remaining external or human proof.

## Baseline checkpoint — 2026-08-11 00:30 +08:00

- Frozen candidate: base
  `149182a55d96f337d5e2d0ca80ffc90d4189bd15`, code-diff SHA-256
  `5191d025e0deeca590ea06f5dc5ba83c0d1646184efc55f4f37fb0681ee567b4`,
  Web build `Swt0F-ErUhpBeURLBEOQ_`.
- Atomic result:
  `docs/evaluations/2026-08-11-system-ui-click-acceptance-001.json`;
  64 pass, 1 fail, and 35 not run.
- Candidate fixes now fail closed on relative time, show unresolved evidence
  separately, remove dead no-provider login controls, expose an honest access
  and Demo path, reveal the first mobile source task above the dock, and add an
  explicit sign-out action.
- The paid gate remains blocked. Production has no usable sign-in method and
  still runs the stale four-action Demo without temporal clarification. The
  current account-scoped backend is unavailable, so identity, durable state,
  deletion, action execution, and cross-day atoms remain unproved.
- Panel:
  `docs/evaluations/2026-08-11-system-ui-click-final-panel-001.json`;
  recruiter workflow 1/4, evidence safety 1/4 with an active deployment veto,
  mobile UX 2/4, final release gate `block`.
- Next completion slice: deploy the frozen candidate, restore one authenticated
  backend account, then execute the remaining critical atoms before field,
  provider-lifecycle, VoiceOver, real-device, and paid-pilot evidence.

## Checkpoint v2 — 2026-08-11 02:12 +08:00

- Frozen candidate: the same base commit, owned code-diff SHA-256
  `19023ae6a6550bdf978623e1b2b4b16cf61ea1d6fff3ffeefee218c17c2b5cbd`,
  and final Web build `iYG2qQembthgw63Z6k9qu`.
- Atomic result:
  `docs/evaluations/2026-08-11-system-ui-click-acceptance-002.json`;
  85 pass, 1 fail, and 14 not run. The score improved by 21 directly observed
  current-build atoms; no historical-only evidence was promoted.
- The local production build now completes same-name context separation,
  governed attachment, before/after conflict and supersession review, current
  state, Wiki, People, source ledger, timeline, durable no-action, refresh,
  deletion, independent approval, permission-at-use, idempotency, verified
  local destination, unknown result, safe revision/retry, and reconciliation.
- The fresh backend evaluator passed all 8 fixtures, 13 failure-boundary checks,
  and 7 recovery scenarios with tenant isolation and zero direct external
  writes. The final responsive smoke has zero console errors, zero horizontal
  overflow, and no visible target below 44 pixels at the tested viewports.
- The paid and `>99` gates remain blocked. Production still has no usable
  sign-in method and its stale Demo converts unresolved relative time into
  confirmable deadline and meeting authority. Fourteen atoms remain unrun,
  including Web capture retry/duplicate, identity edge cases, stale and
  cross-day state, action reversal, real virtual-keyboard/lifecycle, and
  screen-reader order.
- Panel:
  `docs/evaluations/2026-08-11-system-ui-click-final-panel-002.json`;
  recruiter workflow 3/4, evidence safety 2/4 with the production veto active,
  mobile UX 3/4, final release gate `block`.
- Next completion slice: establish production parity and authenticated entry;
  then run the remaining critical identity, state, capture, and reversal atoms
  on that frozen build before provider, physical-device, assistive, and paid
  field validation.

## Latest checkpoint — 2026-08-11 03:01 +08:00

- Frozen candidate: the same base commit, owned current-content manifest
  SHA-256
  `7e573de1f09668e79154284ebf045ba6b3fec5b7f2102d2d1d5f54bf74f20639`,
  and final Web build `23c08O5Bcl76jCvPWAq41`.
- Atomic result:
  `docs/evaluations/2026-08-11-system-ui-click-acceptance-003.json`;
  94 pass, 1 fail, and 5 not run. Nine atoms were promoted only after direct
  final-build evidence.
- Explicit speaker review, forwarded-source limits, current-versus-historical
  owner ordering, durable unresolved identity, wrong-person correction
  history, stale approval and reapproval, and source revoke/restore are now
  directly covered. Revoking a source immediately removes its quote,
  proposals, action authority, and derived current state while leaving facts
  from other authorized sources intact; restoring it returns one claim to
  `0/1` review and revives no prior conclusion or action.
- A timeout-after-commit fault was injected into the first-source Web path.
  The browser saw `503` after the backend returned `201`; retry reused the same
  request ID, observation time, and resource receipt. Readback showed exactly
  one person, one relationship context, and one source.
- `pnpm check` passed: documentation and architecture checks, lint, Web
  typecheck, Web 178 passed / 1 skipped, Backend 106 passed, backend CI, and
  the final production Web build. A fresh final-build smoke had zero console
  errors and zero horizontal overflow.
- The paid and `>99` gates remain blocked. `ACCESS-10` fails because production
  has no usable sign-in method. `STATE-08` and `ACTION-10` remain critical
  `not_run` because a real elapsed cross-day return and an approved provider
  effect reversal have not occurred. `MOBILE-09`, `MOBILE-10`, and `A11Y-09`
  still require physical-device or assistive-technology evidence. The deployed
  Demo's temporal-authority safety veto remains active.
- Panel:
  `docs/evaluations/2026-08-11-system-ui-click-final-panel-003.json`;
  recruiter workflow 3/4, evidence safety 2/4 with the production veto active,
  mobile UX 3/4, final release gate `block`.
- Next completion slice: deploy the guarded build behind one usable pilot
  account, run a real next-day return, then separately authorize a provider
  sandbox lifecycle with truthful reversal semantics before physical-device,
  assistive, and paid field validation.

## Re-plan signals

- the authenticated production workspace remains unreachable;
- a safety-critical atom fails after a code change;
- backend state cannot represent the required ambiguity or recovery;
- production credentials, provider lifecycle, or external-effect proof requires
  new user authority.

## Checkpoint v4 — local reversal delta, 2026-08-11 03:45 +08:00

- Frozen delta: the same base commit, owned 33-file current-content manifest
  SHA-256
  `07f48e261a420f3aa23b94ab663a00fbc7f9b1b0c39efbed26d24cb8b825f574`,
  contract `2026-08-11.1`, migration `019_effect_reversals`, and final Web build
  `vVRho5vtVOd_fVetR8dh1`. The subsequent passing `pnpm check` rebuilt the same
  source manifest as `zyRgaOQ1zhdayQlpHXeTs`.
- Runtime proof:
  `docs/evaluations/2026-08-11-local-effect-reversal-runtime-proof.json`.
  The final production build now exposes review, reason, exact approval,
  separate execution, absence readback, durable receipt, and preserved original
  history for one labeled local simulated Today item.
- Before execution, browser-triggered approval left the destination at version
  1 and created no reversal attempt. Execution then removed exactly that item,
  produced one `matched_absent` observation, consumed the approval, retained
  the original verified effect and outcome, and survived reload.
- The fresh backend evaluator passed all 8 fixtures, 15 failure-boundary checks,
  and 10 recovery scenarios. Reversal-specific negatives cover cross-account
  hiding, revoked approval, destination drift without deletion, idempotent
  replay, and durable readback.
- At 390x844 the reversal path has no horizontal overflow; the textarea,
  checkbox label, and both decision buttons are keyboard reachable, the label
  target and buttons meet the 44-pixel floor, and the focused approval control
  has a visible 2-pixel outline with 4-pixel offset.
- `pnpm check` passed: brand, documentation, Wiki, architecture, lint,
  typecheck, Web 182 passed / 1 skipped, Backend 107 passed, backend CI, and
  the production Web build.
- No score atom was promoted. The latest full 100-atom result remains 94/100:
  `ACTION-10` explicitly requires a separately authorized real-provider
  reversal, not a local simulation. Production entry and the deployed temporal
  safety veto also remain unresolved, so the paid and `>99` gates stay blocked.

## Checkpoint v5 — iOS Safari software-keyboard delta, 2026-08-11 04:05 +08:00

- Frozen delta: the same base commit, owned 33-file current-content manifest
  SHA-256
  `25432391bad913db8eb4103fc1713d6a83fe96b34312440824a94a8625d79e04`,
  browser-observed Web build `1nPqSP9ejsQQ9vECB8YXg`, and post-check Web
  build `PGom8ASK1p-IxywiJh6de` from the same source manifest.
- Direct proof:
  `docs/evaluations/2026-08-11-ios-safari-keyboard-runtime-proof.json`.
  Mobile Safari on the iOS 26.1 `QA-iPhone17` Simulator exposed the full
  software keyboard, preserved the visible draft, dismissed cleanly, kept the
  local-analysis control reachable, showed a truthful loading state, and
  exposed the complete result by normal touch scrolling.
- The interaction found a real copy-and-authority defect: after the user added
  an explicit timezone, the initial result still claimed that the timezone was
  missing. The analyzer now acknowledges the stated timezone, requests only
  the unresolved calendar date, retains the timezone on both ambiguity
  explanations, and creates no deadline or meeting action.
- `MOBILE-09` moves from `not_run` to `pass`. The composed current score is
  95/100: 95 pass, 1 fail, and 4 not run. No other atom was promoted.
- `pnpm check` passed: brand, documentation, Wiki, architecture, lint,
  typecheck, Web 183 passed / 1 skipped, Backend 107 passed, backend CI, and
  the production Web build.
- The iOS Simulator is valid direct evidence for the virtual-keyboard atom but
  not for `MOBILE-10`; no physical background/relaunch was run. `A11Y-09`
  remains `not_run` because no actual VoiceOver or screen-reader session was
  performed. Accessibility trees and UI snapshots are support, not substitutes.
- The pre-existing Talent Signal iOS screen and recruiter-context value were
  preserved, and the app was restored to the foreground after Safari testing.
- The paid and `>99` gates remain blocked by `ACCESS-10`, `STATE-08`,
  `ACTION-10`, `MOBILE-10`, and `A11Y-09`, plus the deployed Demo safety-parity
  veto and missing paid-field evidence.

## Checkpoint v6 — accessibility and production-parity recheck, 2026-08-11 04:30 +08:00

- Frozen local candidate: the same base commit, owned 34-file current-content
  manifest SHA-256
  `5c4bcfe8167ff85f960892a7b9c71ed072e6be72d9d5a18b65e0b549d9364e0d`,
  and browser-observed Web build `4WR_FxUpcfKqSo8d5TYKd`.
- Accessibility runtime proof:
  `docs/evaluations/2026-08-11-web-accessibility-runtime-proof.json`.
  Direct Safari/macOS Accessibility API and Chromium interaction found that
  the whole Action review was one polite live region, risking a replay of the
  entire result after every edit or decision, while Edit did not hand focus to
  its newly inserted field.
- The final local build now uses one narrow, atomic status node for loading,
  completion, error, editing, confirmation, dismissal, restoration, reset, and
  route changes. The result region is no longer live. Browser readback showed
  `role=status`, `aria-live=polite`, `aria-atomic=true`; selecting Edit made the
  proposed-update input active with its full 59-character value selected.
- This strengthens screen-reader readiness but does not promote `A11Y-09`.
  Apple explicitly states that VoiceOver is unavailable on iOS Simulator; no
  physical iPhone is connected, and macOS VoiceOver was not enabled without
  approval to change that system setting. Accessibility API trees and Inspector
  output remain support, not actual assistive-technology proof.
- Production parity proof:
  `docs/evaluations/2026-08-11-production-parity-recheck-proof.json`. A fresh
  read-only browser run found that production still exposes only disabled
  Google, Apple, and email controls. Its seeded Demo still produces four
  confirmable changes, including a deadline from `by Wednesday` and a meeting
  proposal from `Tuesday afternoon`, without a source date or timezone.
- GitHub deployment readback ties production to base commit
  `149182a55d96f337d5e2d0ca80ffc90d4189bd15`. No deployment, credential,
  provider, or other external state was changed.
- `pnpm check` passed: brand, documentation, Wiki, architecture, lint,
  typecheck, Web 185 passed / 1 skipped, Backend 107 passed, backend CI, and
  the production Web build. The post-check build ID is
  `W1LVlibh2hdv7L42IY5OM` from the same source manifest.
- The score remains 95/100. `ACCESS-10` still fails; `STATE-08`, `ACTION-10`,
  `MOBILE-10`, and `A11Y-09` remain `not_run`. The paid and `>99` gates remain
  blocked.

## Checkpoint v7 — external-condition blocker audit, 2026-08-11 04:36 +08:00

- Blocker packet:
  `docs/evaluations/2026-08-11-system-ui-click-blocker-audit-001.json`.
  The 95/100 composition and all five remaining atom requirements were
  re-read against current files and external state.
- `ACCESS-10`: production remains on commit
  `149182a55d96f337d5e2d0ca80ffc90d4189bd15` with no usable sign-in method.
  The corrected candidate is local only; no production deployment or
  credential authority was supplied.
- `STATE-08`: all current checkpoints remain on the same local calendar day.
  A clock override or rewritten timestamp is not accepted as elapsed evidence.
- `ACTION-10`: the contract and contract test admit only
  `local_deterministic`; no authorized Calendar, Contacts, ATS, CRM, messaging,
  or other real-effect sandbox exists.
- `MOBILE-10`: `devicectl` reports no physical devices, and `xctrace` lists
  only the Mac and simulators.
- `A11Y-09`: macOS VoiceOver is not running, iOS Simulator cannot supply it,
  and no permission to toggle the macOS system setting was provided. AX and DOM
  evidence remain supporting proof only.
- This is the third consecutive goal turn with the same external condition.
  Further local code work cannot truthfully promote any remaining atom. Resume
  when deployment/auth authority, elapsed next-day state, a provider sandbox,
  a connected iPhone, or explicit temporary VoiceOver permission is available.
