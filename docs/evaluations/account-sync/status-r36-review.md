# r36 primary-status readback review

**Confirmed P1: the ADR 0021 primary-session status route can report a secondary workspace actor instead of the primary actor.** The parent-executed Web→HTTP→PostgreSQL counterexample is valid for the routing boundary it claims. It does not establish real Lab creation/UI behavior or an attacker’s ability to mint a sealed workspace cookie.

Only frozen source and existing artifacts were read. No database, app, test or provider was run, and no product file or original receipt was changed.

## Source binding

Snapshot: `/Users/cubxxw/.codex/worktrees/account-sync-ready-r36/talent-signal`, clean commit `3aa05014f1b1d1d65d261e3df4a735c6d87a88ad`. All thirteen runtime files in `r36-status.json` match their before/after hashes and the snapshot.

| Source | SHA256 |
| --- | --- |
| `apps/web/app/api/desktop-auth/status/route.ts` | `2327b9af2d0082a193c2ab1294d14055c4852aeae9907074e36d7916fb0c65fe` |
| `apps/web/lib/server/backendAuth.ts` | `571eba8cd8eb178e909db82c091ba9dc958a257bdc7f76b3973a3da7aceb3a86` |
| `apps/web/lib/server/testWorkspaceSession.ts` | `60891d39503180b929c9c66088e3a08cc226b6b41822cd6563e4961ed4c6947b` |
| `docs/decisions/0021-primary-login-store-ownership.md` | `d9807d1507fffcca8c3923c0069aa519305e81e576ee2f79e70c85ddb4486735` |

## P1 — primary readback switches credentials before live validation

ADR 0021 (`85–96`) requires same-store authenticated readback of the installed canonical account/user. A read must not settle installation from another selected workspace or refresh authentication cookies.

The implementation reads primary claims at `status/route.ts:16`, but only checks that they exist (`18`). It then calls `authenticatedBackendClient()` (`19`) and returns that client's account settings actor (`22–30`). The helper calls `readBackendSessionClaims` (`backendAuth.ts:175–185`), which deliberately selects `test?.claims ?? primary` (`160–172`, especially `169–170`). Thus the initial primary read does not bind the subsequently validated bearer or returned actor.

With a valid primary-bound secondary cookie, the real backend request authenticates B's token and returns B. This contradicts the endpoint's primary-installation purpose even if B is a legitimately accessible secondary workspace. It can misidentify the observed primary login or leave recovery blocked by an actor mismatch. The test demonstrates neither a primary-cookie replacement nor privilege escalation; it demonstrates incorrect identity readback at a security-sensitive ownership boundary.

The same source path would validate B rather than a revoked A if A's sealed primary claims remain structurally readable and B stays live. That combined case was **not run**: the existing revoked-primary positive rejection has no secondary cookie. Also, malformed or wrong-parent secondary state throws from `testWorkspaceSession` (`17–20`) during `authenticatedBackendClient()`, outside this route's try block (`19` versus `21`); that can fail the status handler rather than observe A. This is a source-only recovery gap, not a claim about a reproduced HTTP status.

## Why the supplied fixture is sufficient—and what it does not prove

The fixture obtains A and B through production desktop login routes using controlled external provider verification and real isolated PostgreSQL. The primary cookie is encoded from A's actual backend session. It creates the secondary cookie with the production `setTestWorkspaceSession` function, not a mocked decoder or hand-authored plaintext payload. That function seals the data with the actual cookie salt/secret and binds the primary token hash plus backend endpoint (`testWorkspaceSession.ts:22–25`), satisfying the production reader's binding checks (`15–18`).

B is a synthetic **ordinary account**, not a Lab account produced by the Lab UI or its authorization flow. Calling a server-side sealing helper in a test does not prove that any user can cause an arbitrary B cookie in production. It does prove that this route incorrectly honors a production-valid secondary-cookie envelope. The selector itself does not branch on B being Lab versus ordinary; how real Lab sessions are issued and whether all their backend guards admit settings remains outside this review.

The actual tested sequence is:

| Case | Observed result |
| --- | --- |
| Live primary A, no secondary | PASS: backend settings `200`, exact A account/user, status `authenticated:true` |
| Revoked primary A, no secondary | PASS: backend settings `401`, status `authenticated:false`, `actor:null` |
| Live primary A + correctly A-bound live secondary B | FAIL: backend settings `200`, status `authenticated:true`, **B account/user returned** |

In the failing case A is `c2316ba4-94c9-4566-88de-e7602df1913c`; returned B is `0b4249e7-a193-4550-a52d-f44297e54672`. All three preserve the adapter's cookie jar and return no `Set-Cookie` header with `cache-control: private, no-store`. The failure is the exact actor assertion, not a timeout or arbitrary non-200 response. The three-test log reports two passes and one failure.

## Minimal fix and acceptance

Construct this route's backend client directly from **`readPrimaryBackendSessionClaims().backendAccessToken`** and the fixed backend origin. Perform live backend validation with that same token; do not call the workspace-aware `authenticatedBackendClient` or inspect `testWorkspaceSession` at all. Handle absent/unreadable/expired primary scope without authenticating a secondary session. Reject a live readback whose account/user disagrees with the bound primary claims rather than substituting secondary data or trusting JWT display metadata. Preserve no-store and zero cookie writes.

This is a route-specific primary observation, not a fallback around Lab isolation. Do not weaken the ordinary workspace-aware helper, clear the secondary selection during a status read, reuse Auth.js `/api/auth/session`, or refresh any cookie here.

Retest the current three cases and add: revoked/expired A with live B; missing or malformed primary with a surviving secondary cookie; live A with missing, malformed, wrong-parent or wrong-endpoint secondary cookies. The latter secondary variants should not affect a primary-only observer. Require exact actor/false response, primary-token backend selection, no secondary-token request and no cookie writes. Preserve a separate real Lab-session acceptance boundary if product reachability is later claimed. These checks still do not establish WK same-store correlation, pending-writer settlement or durable native journal behavior.

## Evidence binding

All artifacts are under `/private/tmp/ai-test-account-sync.umqxBi/parent-macos-manual/web-pg-chain`:

| Artifact | SHA256 |
| --- | --- |
| `status-r36.test.ts` | `9fe26ba8df84491f0290a9350c8382b7519973e6d4a32571c12edcb23324bbe4` |
| `status-r36.config.mjs` | `69f51459f84a79faf23dd5e59dae82b8224166fd40c3d2c61578cf4b2e83115b` |
| `r36-status.json` | `c06a1b720135ccf3692247bd19f1b21c8daaa97a9b49608123e826c0da7a783f` |
| `r36-status.log` | `71196aba36e85f578f8e1b3fb2fa2ad651c7962d09e62ded2b5bcf18d58ed6af` |

The actual status GET handler, JWT crypto, contract client and loopback backend/PG execute; Next request-cookie/header transport is adapted in Vitest. The fixture imports other credential helpers and contains unused copied functions, but these three cases do not invoke them. No browser rendering, real request-cookie propagation, WK store readback, ASWebAuthenticationSession or live OAuth is established. `sourceStable:true` binds this conclusion to r36, not Pi repair9 or a later candidate.
