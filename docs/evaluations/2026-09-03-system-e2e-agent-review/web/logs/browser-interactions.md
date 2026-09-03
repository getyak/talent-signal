# Browser interaction log

Artifact: `TS-SYSTEM-E2E-2026-09-03-01`

## Public and authentication

- `/` rendered at 1440x1000 and 390x844 without horizontal overflow.
- The synthetic source selector changed from WeChat to WhatsApp and exposed
  the selected button with `aria-pressed=true`.
- The mobile menu exposed `aria-expanded=true`, locked body scrolling while
  open, and returned to a closed state.
- Theme toggle changed `data-theme` from `light` to `dark` and back.
- Protected `/workspace` in a fresh Chrome session landed at
  `/login?callbackUrl=%2Fworkspace`.
- Login/create-account tabs exposed the expected fields. The synthetic default
  account returned to the requested workspace route.
- A protected People request landed at
  `/login?callbackUrl=%2Fworkspace%2Fpeople`; default-account login returned to
  `/workspace/people` exactly.

## Deterministic demo

- Keyboard-clearing the conversation textbox and pressing `在本地分析`
  produced `请先添加对话笔记，再分析证据。` without generating proposals.
- Reset plus local analysis produced two evidence-linked proposal cards and
  kept private AI disabled as `尚未配置`.

## Frozen boundary flow

- `TS-CORE-01`: confirmed four facts one at a time; progress advanced 1/4,
  2/4, 3/4, then 4/4. The local handoff controls stayed disabled until all
  fact decisions were complete.
- Fact completion did not execute an action. `批准本地交接` first yielded a
  pending receipt: `提议已在本地批准，但尚未收到目标端观察结果。`
- Selecting `已在测试中验证` and applying the observation yielded:
  `已观察到本地测试交接。未更改消息、会议、联系人或 ATS 记录。`
- `TS-CORE-02` returned `无需行动是审阅结果`, with zero proposed facts and no
  action controls.
- `TS-ID-01` stopped with two explicit Alex Chen choices and no proposed facts.
  Selecting the Staff Product Designer context completed 1/1 identity decision
  without creating a fact or action.

## Failure and recovery

- Before the Lab timeout correction, `/workspace/lab` remained on
  `正在连接 Lab 控制面` after 3.5 seconds with no error or retry entry.
- After the correction, the same unavailable backend produced
  `Lab 控制面暂时不可用` with `重新连接` and `返回今日` within 4.5 seconds.
- Activating `重新连接` through the visible button caused a real document
  reload: the page re-entered `正在连接 Lab 控制面`, then returned to the same
  honest unavailable state. No session, run, comparison, or receipt control
  appeared.
- Today, People, and Evals refused to substitute fixtures or stale cache for
  account state and exposed recovery/frozen-boundary routes.
- Before the logout correction, the visible product logout control remained on
  Today after more than five seconds. After the backend logout deadline was
  added, the same path returned to `/` and removed the authenticated controls.

## Keyboard and responsive checks

- Baseline skip-link activation changed the hash but left focus on `BODY`.
- Post-change activation focused `MAIN#main-content` with `tabindex=-1` on both
  public and workspace pages.
- Workspace narrow navigation moved Today -> People and correctly updated
  `aria-current=page`.
- All measured narrow pages reported `scrollWidth === clientWidth === 390`.
