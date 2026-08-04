# Browser extension craft round 2 results

## Decision

The extension is materially better and directly proven as a bounded synthetic
load-unpacked review surface. The integrated release gate remains **blocked**.

`XS-CAPTURE-01` is still active. Playwright Chromium loaded and exercised the
exact unpacked package, but that is not the user's Google Chrome
`chrome://extensions` installation, toolbar or shortcut invocation, or positive
temporary `activeTab` grant.

No real candidate data, real localhost capture write, external write, policy
bypass, Computer Use, alternate browser, push, PR, or deployment occurred.

## Frozen artifact

- Source commit: `e8c6af2aaab873abcd72ce429552662bd521a78c`
- Build aggregate SHA-256:
  `4491ed23a7d236cb055987432a19309534594170b019f89dfb3f5e3aa2d8c416`
- Manifest: MV3 `0.1.0`; `activeTab`, `scripting`, `sidePanel`; loopback hosts
  only; incognito not allowed.
- Review object: [`review-object.json`](review-object.json)
- Verification: [`verification-summary.json`](verification-summary.json)
- Loaded-package evidence:
  [`loaded-package-evidence.json`](loaded-package-evidence.json)

## What changed

The primary surface remains **Evidence review**. The user question is:

> Is this the exact evidence and localhost handoff I intend to submit, and what
> remains safe if it fails?

The canonical object is the future governed backend episode. The extension
draft is temporary and non-canonical. Its meaning order is:

```text
observed source
→ exact reviewed asset
→ proposed / ambiguous / superseded fixture interpretation
→ explicit Submit authority
→ pending / received / failed / unknown receipt
→ local deletion with backend deletion still unverified
```

The implementation now provides:

- a visible three-step evidence → session → Submit order;
- keyboard focus on every consequential control with a 3px outline;
- exact-message focus links for each proposed fact and action;
- explicit before → proposed-after treatment for superseded state;
- a long Latin, Chinese, and Arabic synthetic text asset;
- adaptive 390, 320, and 195 CSS-pixel layouts;
- actual Chromium tab zoom `2.0` from 390 to 195 CSS pixels;
- ARIA-live state announcements and a Chromium AX transcript;
- reduced-motion, increased-contrast, dark, and grayscale evidence;
- direct loading, no-action empty, ambiguity, blocked inference,
  permission-denied, offline, retry, unknown, reconciliation, stale,
  recovered, received, and local-deleted states.

## Direct verification

- Browser-extension deterministic tests: **31 passed**
- Integrated unpacked-package tests: **31 passed**
- Package validation: **passed**, 10 required files and 7 local scripts
- Build: **passed**
- `pnpm eval:core`: **passed**
- `pnpm docs:check`: **passed**
- Persistent Chromium load-unpacked: **passed**
- Direct loaded states: **16**
- axe audits: **3**, with **0 violations** and **0 incomplete**
- Keyboard-only review and Submit: **completed**
- Recorded keyboard focus with visible outline: **all controls**
- Capture API requests before Submit in the synthetic path: **0**
- Horizontal-overflow states: **0**
- 200% zoom clipped-element audit: **0**

The generated transcript is
[`screen-reader-transcript.txt`](screen-reader-transcript.txt). It is an
accessibility-tree and ARIA-live transcript, not a human screen-reader
usability session.

## Twelve craft dimensions

| Dimension | Score | Exact evidence or remaining gap |
| --- | ---: | --- |
| Product specificity | 98 | Direct core, no-action, ambiguity, blocked, failure, and deleted states |
| Narrative clarity | 95 | Direct ordered path; no uncoached recruiter or day-later comprehension evidence |
| Attention hierarchy | 98 | Evidence first, one Submit decision, stable at 390/320/195 CSS px |
| Evidence proximity | 98 | Fact/action link directly focuses and highlights exact message `m1` |
| Typography | 98 | Long mixed script at 320/390 plus actual zoom 2.0 and 195px reflow |
| Spacing and rhythm | 98 | Direct cross-state and narrow-width comparison |
| Restrained color and state semantics | 98 | Light, dark, grayscale, increased contrast, failed, blocked, and deleted states |
| Materiality | 98 | Containers and borders correspond to evidence, focus, approval, transient status, or deletion |
| Interaction and motion | 95 | Submit/loading/retry/reconciliation/reduced motion direct; user Google Chrome positive capture and in-flight cancellation unproven |
| Responsive composition | 98 | No horizontal overflow; no clipped elements at 200% zoom layout |
| Keyboard, focus, and accessibility | 98 | Full keyboard path, AX/ARIA transcript, visible focus, three zero-finding axe audits |
| Loading, empty, error, and recovery | 98 | Direct loading/no-action/permission/offline/unknown/retry/stale/deleted matrix |

These scores are not averaged. The craft packet is
[`craft-review.json`](craft-review.json).

## Independent reviewers

| Reviewer | Verdict | Score | Boundary |
| --- | --- | ---: | --- |
| Mobile UX | pass with changes | 3 | Direct accessibility and reflow; no human screen-reader or browser-owned side-panel session |
| Candidate experience | pass with changes | 3 | Respectful, restrained, no scoring or external effect; live-data notice and positive capture proof remain |
| Recruiter workflow | pass with changes | 3 | Executable low-friction review and recovery; no uncoached value/time comparison |
| Evidence safety | fail | 2 | `XS-CAPTURE-01` remains active |

The validated adjudication is [`panel.json`](panel.json). Evidence safety owns
the active capture gate; the other scores cannot average it away.

## Remaining issues

1. **User Google Chrome positive capture.** Record the exact build digest from
   `chrome://extensions` through toolbar or shortcut, temporary source-only
   `activeTab`, exact preview, pre-Submit capture-network silence, Submit, and
   one scoped synthetic receipt.
2. **Human comprehension.** Run one uncoached recruiter and one supported
   screen-reader traversal; both must explain evidence, proposal, approval,
   pending or unknown, receipt, and deletion limits correctly.
3. **Backend destination and lifecycle.** Prove one real scoped localhost
   receipt, duplicate reconciliation, selected retention, and raw plus derived
   deletion from the owning backend.
