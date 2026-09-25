# r40 Web primary-login recovery review

## Decision and scope

**Three P1 findings are confirmed: two have supplied execution evidence, and the third is a directly connected source-level bypass of the same entry gate.** No P0 was identified in this bounded review. The smallest fix is a single entry-owned client submission controller connected to the existing native immutable lease. Do not add a new process-global server login authority or ask for another architecture decision.

Frozen source: `/Users/cubxxw/.codex/worktrees/account-sync-ready-r40/talent-signal`, commit `cff4946a04df816cbdf0fe1bc52464395baba6c3`. All 1,253 manifest files match the r40 manifest and git status is clean; the temporary Next configuration edits have been restored. Manifest SHA256: `1a29769a639ff13b924a1e0309551d41485c529ea6dddc6f96eb98c7059f0353`.

This reviewer read the exact Actions, form controls, both gates, the parent test/fixture and receipts, and viewed the supplied PNG with `view_image`. No tests were rerun and no product source, Pi worktree, app/WK, provider, email, database or service was modified. The parent's two evidence groups remain separate:

- **Real Actions/Next control-flow probe:** 4 passing controls and 1 failing independent-entry recovery case. Actual installed Next redirect/error helpers and the real Actions/gate run; auth/provider behavior and cookie effects are controlled. There is no HTTP/browser/backend mutation in this group.
- **Real Next/IAB registration recovery:** actual page, form, Server Action and HTTP against a failure-only loopback service. First submit produces one HTTP POST and explicit 503 delivery failure; a second click is enabled but causes no new request; full document reload and submit produces POST number two. No real email, account or database write occurs.

## P1 findings

### LR1 — Registration never releases its submission gate, including known failures and resend

**Source:** `apps/web/components/account-access-form.tsx:29–43,70–85`; `apps/web/lib/loginSubmitGate.ts:12–23`; `apps/web/app/login/actions.ts:157–218`.

Submit synchronously acquires the constant `register` key. The only completion effect depends on `signInState`; the separate `registrationState` never calls `endLoginSubmission`. React pending state returns to false and re-enables the submit button, while the module-level blocked set still rejects every subsequent registration submit before the Action runs.

**Executed evidence:** the parent receipt and HTTP log confirm one `/v1/auth/password/register` request, an explicit `EMAIL_DELIVERY_UNAVAILABLE` 503 result, an enabled second button with no additional request, and a second HTTP request only after full reload. The screenshot visibly shows the failure message and normal-looking enabled primary button; it is consistent with the receipt, but the screenshot alone does not establish request counts. Source hashes and screenshot/log hashes in that receipt match the reviewed files exactly.

**Other same-cause paths, source-confirmed but not separately executed here:**

- Server-side registration validation, account-exists and rate-limit failures all return a registration result but cannot release the key. Native browser constraint validation that prevents `onSubmit` is not affected.
- Successful delivery returns `sent: true`; “Resend verification email” only sets `showSent(false)` at line 75. Its next submit remains blocked, even though the UI explicitly offers resend.
- Changing the registration email, switching modes and back, or remounting through client navigation does not clear the module-level `register` set. The server process gate is not involved in this particular failure.

**Minimum fix:** complete the exact captured registration submission token on every authoritative Action result. A known rejected registration or confirmed delivery can release its client submission gate; subsequent explicit resend must make one new request and still obey server rate limits. An unknown result needs explicit truthful recovery, not an unconditional unlock or automatic resend. Do not key completion off the current selected tab/mode: complete the captured operation so a delayed result cannot release a newer submission.

### LR2 — Unknown password outcome poisons an identity-wide process key rather than one login entry

**Source:** `apps/web/lib/server/loginSingleFlight.ts:11–12,24–52`; `apps/web/app/login/actions.ts:95–114,251–282`; `apps/web/components/account-access-form.tsx:30–42,105–108`.

The server's module-global sets are keyed by `login-password:<raw identifier>`, and for providers by `login-<provider>:<redirectTo>`. These keys have no entry, browser, session, host, store or operation identity. An unexpected non-AuthError escaping password sign-in is placed in `uncertain`; no production caller clears it and it has no expiry. A new document, separate browser or new native store using that identifier still reaches the same blocked key in that worker. The client is told the failure is retryable and to restart login, but that restart cannot repair server memory.

**Executed evidence:** the parent probe makes the real gated Action return `unconfirmed: true` for a controlled escaping TypeError. A second independent invocation with valid success behavior never calls auth: total auth calls remain one; it returns “Signing in, please wait” instead of propagating the prepared valid Next redirect. The test correctly uses the actual installed Next redirect implementation and AuthError class, so the earlier invented-redirect-fixture issue is not present. The controlled TypeError proves this Action-level unknown branch; it does **not** prove that every real network error in Auth.js escapes as a TypeError, nor does it establish actual cookie commitment.

The block is permanent for that module instance/worker lifetime, not globally across restarts or all deployment workers. That distinction makes this an unsuitable authority in both directions: independent entries can be locked out on one worker while another worker does not share the guard.

**Other same-cause paths:** provider `inFlight` keys collide for unrelated browsers using the usual shared `/workspace` callback. A concurrent second Google/Apple Action returns `undefined` on `blocked` without a user-visible outcome (`actions.ts:259,282`). This is source-confirmed; no multi-browser provider execution was performed. The current provider helpers turn their usual errors into a Next redirect, so this review does not claim all provider failures permanently populate `uncertain`.

**Minimum fix:** remove the identity/callback-wide process gate from the primary-login Actions. Keep ordinary server validation, backend authorization and existing mutation/idempotency contracts; preserve valid Next redirects unchanged. Return a typed unknown result to the initiating entry's client controller for actual unexpected failures. A new explicit entry gets a new local entry identity; it must not need a server-global `clear(email)` operation. Normalizing the identifier, adding a timer to the global set, or clearing it whenever any page mounts would not establish entry ownership and is not an acceptable fix.

### LR3 — Alternate login methods bypass the supposed shared gate, especially after an unknown password result

**Source:** `account-access-form.tsx:46–48,68,79–85`; `oauth-submit.tsx:6–13`; `desktop-auth-handoff-links.tsx:40–55`; `app/login/page.tsx:100–124,144–150`; `lib/loginSubmitGate.ts:12–32`.

Only the password/registration form calls `beginLoginSubmission`. The provider form and `OAuthSubmit` only use render-time pending/disabled state; native-capable provider controls are ordinary anchors with no submission handler. Placing those anchors inside a disabled fieldset does not provide an anchor gate. The imported `loginSubmissionBlocked` is never used to derive the UI state.

After an unknown password result, React pending becomes false while `primary-login` remains uncertain. The provider controls become available again because they never check or acquire that entry gate. The user can therefore choose another method in the same uncertain primary entry, exactly the sequence ADR0021 forbids. Rapid password/provider events before pending rerender are also not synchronously serialized. Separate server keys for password/Google/Apple do not repair this gap.

The email-only login surface, when enabled instead of password accounts (`page.tsx:144–150`), places `EmailSignInForm` next to providers without a shared entry owner; that form only checks render-time pending (`email-sign-in-form.tsx:70–75`). Include it in the same primary-entry boundary if the configuration remains supported. This is a bounded same-cause finding, not a request to redesign unrelated credential-setting flows.

**Evidence level:** these are connected source-level paths, not a claimed executed provider race or live login. The supplied 503 registration test had providers unavailable and does not prove provider exclusion.

**Minimum fix:** all enabled primary-entry controls must synchronously acquire the same entry-owned controller before any request/navigation: password click/Enter, ordinary Google/Apple form submissions, native handoff anchors, the supported email-only form, and registration/resend lifecycle. Read pending/unknown state from that controller to present truthful disabled and recovery controls; retain the synchronous guard because rendering alone is not exclusion. Native interception also validates its captured current entry lease and existing operation state. No page identifier or metadata becomes backend authority.

## Minimal implementation boundary already decided by ADR0021

1. **One local entry controller, one owner.** Create the gate in a client provider at the real primary-login entry root, covering provider controls and account/email/registration forms. Do not use process-global/module-global string sets for entry lifetime. Acquisition returns an immutable `{entryGeneration, submissionID, method}` token synchronously. All results, pending callbacks and teardown compare that token before changing the entry. Retired A cannot unlock, hide uncertainty or alter B.
2. **Use explicit outcomes.** Known validation/rejection and confirmed non-login registration delivery finish that submission and make the appropriate retry/resend usable. A possibly committing login or genuinely unknown result keeps that entry's methods blocked and displays a usable status/new-entry action. Preserve `NEXT_REDIRECT` as normal framework control flow; do not translate it into unknown. Do not infer completion solely because React pending became false or the route changed.
3. **Implement recovery without weakening native isolation.** An explicit native new-entry action uses the already accepted fixed first-party route: the coordinator checks the immutable lease, persists a fresh store/epoch and reconstructs the host before loading the new GET. Do not simply clear the old gate or replay a password POST/OAuth artifact into the new store. Read-only status may update observed identity; it cannot prove all older cookie writers have settled. A native password response unavailable to the host keeps the conservative uncertainty/rotation rule. Ordinary Web gets its own explicit entry lifecycle and truthful recovery without claiming WK-store isolation.
4. **Remove the server-global blocker, not server safety.** The backend remains the account/credential authority. These changes need no new cross-request server map, session issuance API, generic native bridge or identity merge authority. The client gate is an interaction constraint; the native full lease/store isolation protects native stale-writer boundaries. Settings current/target credential proof stays outside primary-entry rotation.

The present UI offers no working action to clear an unknown sign-in: the special inline action is only for registration-result-unknown/account-exists (`account-access-form.tsx:107–108`). Copy saying “check status or restart” must be backed by actual entry recovery controls, not an inert enabled submit button.

## Required bounded acceptance

- Repeat the existing real Next/IAB 503 registration case: second explicit click must produce exactly POST number two without reload; duplicate clicks/Enter during one pending submit still produce one request. Add real successful-delivery → visible resend → one additional explicit request, with delivery controlled and no real mail.
- Exercise real Actions with known AuthError, actual Next redirects, and the controlled escaping unknown. A new independent entry with the same identifier must reach its own auth call; the original uncertain entry must remain blocked. Keep the parent probe's 4 positive controls separate from its one negative case.
- Render the actual entry root with provider/password children. Hold a password request, then invoke provider and Enter before rerender: only the first submission dispatches. Return unknown, verify all methods remain unavailable and the recovery action works. Include native anchors, which fieldset disabling alone does not cover.
- Deliver a delayed A result after explicit B entry creation; A must not clear B. On native, bind B to the new full immutable lease/store/epoch and assert that no old POST or proof is replayed. A client rerender/remount alone is not an authorized native new entry.
- Follow native composition acceptance separately with actual WK/app UI under the parent's isolated configuration. Neither the controlled Actions probe nor the ordinary-browser 503 test proves native host ownership, same-store status, provider authentication or release readiness.

The existing helper test at `apps/web/lib/desktop-auth.test.ts:161–177` uses arbitrary different strings as “flows” and manually calls `clearLoginUncertainty`. Production uses identifiers/callbacks and never calls that clear function. That test cannot establish the claimed recovery behavior. Test the actual caller/root rather than making another unused helper pass.

## Evidence and source binding

All source paths below are relative to the frozen root above. Artifact paths are relative to `/private/tmp/ai-test-account-sync.umqxBi/parent-macos-manual`. Both supplied browser receipt source hashes and its screenshot/log hashes were independently verified. The PNG was actually inspected. The HTTP log contains two POST records separated by the documented full reload; the intermediate no-new-request observation comes from the parent browser receipt, not from inventing a third log event.

| Frozen source | SHA256 |
| --- | --- |
| `apps/web/components/account-access-form.tsx` | `dd08cc1ebe58e7a967826e6c87a4f323daf523c48aea17b69d898873def1e019` |
| `apps/web/components/oauth-submit.tsx` | `b13c3c14a373cd4c05c9e53e0b8c33fa394cae6348bae4d765f5453829d86877` |
| `apps/web/components/desktop-auth-handoff-links.tsx` | `7ef61b0392d93d7145d315f23bad771d4674f465fb5488c5ba71a5ee7aa87782` |
| `apps/web/components/email-sign-in-form.tsx` | `d0bc1776c2e14b78c08b42d0365979a446b75c454c65676d0d7378437cd664dd` |
| `apps/web/lib/loginSubmitGate.ts` | `07c6e4206929c6ff922d13d48984ca95ace5071c9b9aaa878b39a2f529e3b783` |
| `apps/web/lib/server/loginSingleFlight.ts` | `7226e39e07d7e5ff7a0f261b3acfff5759d6a3f87f14b1d4324de93d5553b4d9` |
| `apps/web/app/login/actions.ts` | `057f54f2713b5549ce68e3f15048e47029b2db22e277c1355148134cc65d87aa` |
| `apps/web/app/login/page.tsx` | `c1a7d01c49b28a9812543fa869ba24f33cdb72873caf7299db91af78ee3f6a0f` |
| `apps/web/lib/desktop-auth.test.ts` | `dca111e5a9b0be965ef1e9989f28e6b7b64b3e8587264c32ff69160ac51d35c0` |
| `docs/decisions/0021-primary-login-store-ownership.md` | `18fb3096d2cec90dd61a2833d01a1a19d5bf35ae7fd6ca9eba6f82f34d394bb3` |

| Parent evidence artifact | SHA256 |
| --- | --- |
| `r40-primary-login/primary-login.test.ts` | `e268b03778e1168021f0e0ed367fd37af7d52a34786f6f4872817d00e8dc7860` |
| `r40-primary-login/primary-login.config.mjs` | `182b7154ba730586473f3c61e6df5700b78240695be93bfbe1baa020ad929038` |
| `r40-primary-login/primary-login-receipt.json` | `ad7e46578eb9304a01fc34fdc94d4d123e46891fb94ba562c0760ac1b85b1be1` |
| `r40-login-browser/receipt.json` | `b62029aa3e2122109dbe350c515de2cbeef7dba0f701a4d069810dccdd9d4324` |
| `r40-login-browser/registration-retry-stuck.png` | `1cc6eb7218cb60ee3a75cf7e718efbc1c48576380d7d41a45a25f7df13c25dca` |
| `r40-login-browser/http-counts.jsonl` | `ab0b23c774a8cc3ae9c3f5b545f0f7c01e0b75cd776f11f704b05689d5ae529c` |
| `r40-login-browser/controlled-email-server.mjs` | `3a7369a9ec6fd0d1ce5087c8ef61047ab23cfae91d84341c5e7af5dbe746cad8` |

Final verification: 2026-09-25T06:53:41.987487+00:00; 1,253/1,253 manifest matches; clean git status. Source and old evidence unchanged by this review.
