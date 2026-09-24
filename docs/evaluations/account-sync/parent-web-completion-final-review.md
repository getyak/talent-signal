# Final frozen Web boundary review

Result: no confirmed unresolved P0/P1 in the reviewed Web scope. The prior
Settings projection P2 and the concrete completion-consumer/blank-password
test gaps are closed at the frozen source snapshot. This does not cover native
implementation or the separately owned backend no-op email-reservation P2.

Only parent-owned harness/evidence files were changed. Pi product source was
read-only. No provider credentials, mail, production writes or database calls
were used.

## Closures

- **Current authority projection:** Settings now checks the operation against
  authoritative settings account/user IDs, both revisions, and current session
  bearer fingerprint before exposing its proof/ref. Proofs also retain the
  role/provider/challenge/age checks and the earlier of proof/flow expiration.
  Source: [settings/page.tsx:51–94](../../../apps/web/app/workspace/settings/page.tsx#L51).
- **Provider-only form:** the actual React form submits without current or
  duplicate password fields when both role proofs are projected. The submitted
  FormData retains the exact operationRef. The repository test now dispatches
  submit and observes the real component's action call, not just expansion.
  Source: [account-conflict-recovery.test.tsx:106–156](../../../apps/web/components/account-conflict-recovery.test.tsx#L106).
- **Real completion consumers:** repository tests now invoke production
  `link-complete` GET for password-first completion and the current-to-target
  transition, and invoke the real continue action. They no longer substitute a
  direct backend mock call or manual `clearAuthRound` for those consumers.
  Source: [account-recovery-flow.test.ts:556](../../../apps/web/lib/account-recovery-flow.test.ts#L556)
  and [the transition test:692](../../../apps/web/lib/account-recovery-flow.test.ts#L692).
- **Cancel and delayed errors:** production cancel GET clears only an exact
  nonempty current flow ref; missing/old refs preserve a newer operation. The
  real LoginPage delayed AccessDenied path preserves the waiting target flow
  after current completion, and the next real continue/target completion works.
  Source: [link-cancel/route.ts:13](../../../apps/web/app/workspace/settings/link-cancel/route.ts#L13).

## Verification performed

1. Repository focused tests: **4 files / 29 tests passed**, exit 0. Includes the
   actual React blank-password submit and changed completion consumers.
   [Result](parent-web-completion-final-repo-tests.json).
   React `act` environment warnings were emitted; there were no failing tests.
2. Independent parent harness: **16/16 passed**, exit 0. All original 10
   start/JWT/LoginPage/completion/recovery cases passed again. Added five
   SettingsPage authority-projection cases and one production cancel-route
   case. [Result](parent-web-completion-final-vitest-result.json)
   / [source-bound receipt](parent-web-completion-final-receipt.json).

The original ten cases execute password-first Google/Apple; provider-first
Google→Apple and Apple→Google including the delayed error; and recovery
Google/Google, Google/Apple, Apple/Google in both current-first and
duplicate-first orders. They execute real production actions, encrypted-cookie
helpers, nonce binding, JWT callback, LoginPage, completion GET, backend-claim
decoding, contracts client, and recovery prepare.

The new projection cases first stage a real current-role proof and check the
positive rendered status. They then independently replace the encrypted primary
session cookie/bearer, alter the synthetic backend settings account ID/user ID,
or increment one settings revision. The actual SettingsPage returns no verified
role/ref in every stale case. These are controlled request/backend-boundary
inputs, not a live multi-account browser test. The session-change case
intentionally replaces its synthetic original cookie; the receipt's false
`originalSessionCookiePreserved` for that case is expected, not a failed gate.

Apple tests simulate a cross-site POST by filtering sent cookies using the
production cookie options: Lax session/proofs are absent, None operation/round/
nonce survive. Returning to a same-origin request makes the original session
and other role's proof available; all ten credential/recovery flows preserve
the original session cookie.

## Source binding and limits

The final parent receipt contains exact before/after SHA256 values for all 18
tracked implementation/test/client files and reports `sourceStable: true`.
Key values:

```text
apps/web/app/workspace/settings/page.tsx
0899154639f735cb542e379789d85e503a375508b6b9efad3cedd73691e38e1c
apps/web/auth.ts
88627f13fa6deee3e42efa4148205cbb8f490b48225d5809a1281d88524354fd
apps/web/app/login/page.tsx
10ea12bb400bb221b285fdd367df01888cb9146a0302fcd1ac8797d7b70d469d
apps/web/app/workspace/settings/link-complete/route.ts
1190f44f1eedfe5efa1031a7952f52db83e3d29e9cce4d559cd858c6e074902e
apps/web/app/workspace/settings/login-methods/actions.ts
4e6c52acc1ab6e848381a43d1011c474af7e46d8eccfe84e90990f1639474f27
apps/web/lib/server/stagedAuth.ts
4996a8be43e402880f3ea0a72ae5a2d83ee9bbeb817d0363935c4abc9b3bbbf8
```

This proves the local production-consumer choreography with controlled Next/
Auth.js request and external redirect transport and synthetic HTTP responses.
It does **not** prove live Auth.js callback-route/error/cookie transport,
provider authorization/signatures/state/PKCE, real browser SameSite behavior,
backend/database transaction semantics, or cross-device runtime delivery.
The repository React test mocks its final server-action boundary; the parent
production-consumer harness exercises that server path separately. None of
these results should be called live OAuth or full end-to-end account sync.
