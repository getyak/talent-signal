# Web real E2E baseline and retest

## Frozen target

- Artifact: `TS-SYSTEM-E2E-2026-09-03-01`
- Repository commit: `5ba505ae45e3df51b3339427da79c96fde42c137`
- Product server: shared Next development server on canonical
  `http://localhost:3100` (the initial public sweep also used
  `http://127.0.0.1:3100`)
- Data: repository synthetic default account and frozen boundary cases only
- Browsers: Codex in-app browser plus a separate Chrome session for a clean
  authentication boundary
- Viewports: 1440x1000 desktop and 390x844 narrow
- External writes: none; the approved boundary action was explicitly local and
  its receipt states that no message, meeting, contact, or ATS record changed

The shared backend accepted a TCP connection but did not return health or
product responses during this phase. Therefore the account-backed Today,
People, Evals, and Lab failure surfaces are real, while an account-backed
Pursuit room and live recovery remain pending. The complete deterministic
capture-to-result loop was exercised through `/workspace/boundaries` rather
than being misrepresented as a live backend result.

## Route and interaction coverage

| Route | Desktop | 390px | Result |
| --- | --- | --- | --- |
| `/` | pass | pass | Source selector, theme, menu, responsive flow; no horizontal overflow. |
| `/login` | pass | pass | Clean protected redirect, mode switch, synthetic login, exact callback recovery. |
| `/demo` | pass | pass | Empty input stop, reset, local analysis, proposal rendering. |
| `/privacy` | pass | pass | Complete content and no overflow. |
| `/relationships` | pass | pass | Desktop/iPhone switch on wide view; responsive mobile concept on narrow view. |
| `/concepts/relationships` | pass | pass | HTTP 307 to canonical `/relationships`. |
| `/briefs/project-health` | pass | pass | 11,592px desktop and 19,406px narrow document rendered without horizontal overflow; narrow proof uses top/middle/bottom captures because one 19k screenshot exceeded the browser capture limit. |
| `/blog` | pass | pass | Index and article links render; post-change LCP warning retest is clean. |
| `/workspace` | pass | pass | Authenticated canonical entry redirects to Today; `/workspace?surface=desk` exposes the relationship Agent failure-safe surface. |
| `/workspace/today` | failure-safe pass | failure-safe pass | No stale/synthetic account state substituted; retry and frozen-boundary recovery exposed. |
| `/workspace/people` | failure-safe pass | failure-safe pass | Search query is retained; backend error remains explicit. |
| `/workspace/evals` | failure-safe pass | failure-safe pass | Collector unavailable state does not invent traces. |
| `/workspace/lab` | baseline fail, retest pass | baseline fail | Baseline hung in loading; corrected desktop retest exposes error and retry. |
| `/workspace/boundaries` | pass | inspected | Full fact -> independent action -> pending -> observed receipt loop, `no_action`, and identity stop/resolution. |
| unknown public route | pass | not repeated | Real HTTP 404 with a visible return-home recovery. |
| `/workspace/pursuits/[id]` | blocked | blocked | No healthy unified backend or inspectable Pursuit id was available; must be rerun, not inferred. |

## Reproducible findings

### WEB-E2E-01 — P1 — logout could not complete while the backend was degraded — fixed and retested

Pages: all authenticated workspace pages.

Steps:

1. On canonical `localhost:3100`, sign in with the synthetic default account.
2. Keep the configured local backend in the observed state: TCP accepts but no
   response arrives.
3. From Today, activate `退出登录`.
4. Observe the page for five seconds.

Expected: local Auth.js session termination completes even when remote/backend
logout cannot be confirmed.

Baseline: Today remained visible after more than five seconds and the logout
control stayed present.

Post-change: after adding a 1.5 second backend-logout deadline, the visible
logout control returned to `/` and authenticated controls disappeared inside
the 2.6 second observation window. Evidence:
`screenshots/45-logout-post-change-home.png`.

### WEB-E2E-02 — P2 — Lab had an indefinite loading state when the backend did not respond — fixed and retested

Page: `/workspace/lab`.

Steps: open Lab while the configured loopback backend accepts the connection
but does not return a response; wait at least 3.5 seconds.

Expected: a bounded failure state with a retry and a safe way back.

Baseline: `正在连接 Lab 控制面` remained indefinitely and exposed only
`返回今日`. Evidence: `screenshots/16-workspace-lab-backend-unavailable-desktop.png`
and `screenshots/17-workspace-lab-failure-settled-desktop.png`.

Post-change: `Lab 控制面暂时不可用` appears with `重新连接` and `返回今日`.
Activating `重新连接` performs a real document reload, shows
`正在连接 Lab 控制面` again, then returns to the honest unavailable state with
no Lab session, run, comparison, or receipt created. Evidence:
`screenshots/43-workspace-lab-post-change-retest-desktop.png` and
`screenshots/46-lab-reload-retry-settled.png`.

### WEB-E2E-03 — P2 — resolved identity kept an unresolved header — fixed and retested

Page: `/workspace/boundaries`, case `TS-ID-01`.

Steps: open the identity-ambiguous case and choose
`Alex Chen, Staff Product Designer`.

Expected: the completed 1/1 decision, selected context, title, and subtitle
agree.

Baseline: the page showed `已完成 1/1 项决定` and `背景已选择`, but retained
`身份未解决` / `项目未解决`. Evidence:
`screenshots/39-boundary-identity-resolved-review.png`.

Post-change: the header reads `Alex Chen` / `Staff Product Designer`.
Evidence: `screenshots/44-boundary-identity-post-change-retest.png`.

### WEB-E2E-04 — P2 — skip link scrolled without moving focus — fixed and retested

Pages: public layout and workspace layout.

Steps: focus `跳到主要内容`, press Enter, inspect the active element.

Expected: keyboard focus moves to the main content target.

Baseline: the hash changed to `#main-content`, but active element remained
`BODY`.

Post-change: both public and workspace checks report
`MAIN#main-content`, `tabindex=-1`.

### WEB-E2E-05 — P3 — above-the-fold images emitted LCP loading warnings — fixed and retested

Pages: `/` and `/blog`.

The browser initially reported that the rotating WeChat/WhatsApp synthetic hero
images and the featured blog image were detected as Largest Contentful Paint
images without eager loading. The current image in each above-the-fold slot is
now loaded eagerly; a fresh in-app browser run waited through the home rotation,
then loaded `/blog` and `/blog/candidate-momentum-vs-pipeline-stage` without a
new LCP loading warning. Baseline messages remain in `logs/browser-console.md`.

## Strong passes

- Fact confirmation and action authorization are genuinely separate. All four
  facts can be reviewed atomically before the local handoff becomes available.
- Approval produces a truthful pending state first; it does not claim success
  until a test observation is explicitly applied.
- The final receipt clearly states that no message, meeting, contact, or ATS
  record changed.
- `no_action` is a complete result, not an empty or error state.
- Identity ambiguity stops fact/action generation until the recruiter makes an
  explicit context decision.
- Today, People, and Evals fail closed without substituting stale or frozen
  account state.
- The mobile public menu, mobile workspace navigation, active-route semantics,
  and all measured horizontal-overflow checks passed.

## Remaining proof required

When the shared synthetic backend is healthy, rerun these exact checks:

1. Today returns non-empty account-backed attention and links to a real Pursuit
   id.
2. Open that `/workspace/pursuits/[id]`, inspect evidence/proposals, and verify
   navigation back to Today and People.
3. Exercise People search and one relationship recovery against canonical
   backend state.
4. Capture an Eval trace and verify its detail readback.
5. Open Lab live state, then interrupt and restore the backend to prove the new
   retry path rather than only its failure surface.

Until those checks pass, the Web run is a strong public/auth/frozen-flow and
failure-safety baseline, not a complete live account-backed system E2E.

## Evidence index

- Public desktop: `01`–`10`
- Workspace backend-unavailable desktop: `11`–`17`
- Public/workspace narrow: `20`–`32`, `41`
- Frozen decision flow: `33`–`39`
- 404: `40`
- Post-change retests: `43`–`46`
- Raw route status: `logs/http-route-status.json`
- Console evidence: `logs/browser-console.md`
- Interaction facts: `logs/browser-interactions.md`
