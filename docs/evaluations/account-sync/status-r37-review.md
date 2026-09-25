# r37 primary-status repair: independent closure

**The r36 primary/secondary identity-selection P1 is closed in this two-file candidate. No remaining P0/P1 was identified in the bounded repair.** Parent-executed evidence is 7/7 real HTTP/PostgreSQL cases and a separate 7/7 repository suite using controlled network responses. This is source-bound Web-route acceptance, not live/WK/native acceptance or proof that the patch has been integrated elsewhere.

## Reviewed source

- Candidate: `/Users/cubxxw/.codex/worktrees/account-sync-primary-status-r37/talent-signal`.
- Clean commit: `e765d3bf872d79e1212de0f0c948dbc3ee764087` (`fix: validate primary desktop identity independently of workspace selection`).
- Base: r36 `3aa05014f1b1d1d65d261e3df4a735c6d87a88ad`.
- Exactly two changed files: `apps/web/app/api/desktop-auth/status/route.ts` and new adjacent `route.test.ts`. The workspace selection helpers, Lab guards, cookies and backend remain unchanged.

| Source | SHA256 |
| --- | --- |
| `status/route.ts` | `2d03eed730b4041d62f8eadfc0dcb3f0591c1c15697fc02b1aedc8fccb6008aa` |
| `status/route.test.ts` | `291d0341529e590aeb611da58e6bf26d8f8f1094beaaa182ffd0ad9f034646d2` |

The reviewer only read source and parent artifacts and wrote this report. It did not run tests, a database or app, edit product files, or modify `status-r36-review.md`.

## Why the repair closes the finding

The route now constructs `TalentSignalClient(backendAuthBaseUrl(), claims.backendAccessToken)` directly from `readPrimaryBackendSessionClaims()` (`route.ts:16–23`). It no longer calls the workspace-aware helper and never reads the secondary selection. Live account settings consequently validate the same primary bearer observed from the primary cookie; a live B session cannot validate a revoked A.

No selection/authorization behavior is changed for ordinary workspace or Lab consumers. Ignoring secondary state in this dedicated primary observer does not introduce an isolation fallback: it reports only A under A's real backend token. Missing or malformed primary cookies still report unauthenticated without contacting the backend; backend rejection or network failure cannot report an authenticated actor. The actual backend session check remains authoritative rather than trusting JWT display fields.

The route retains `private, no-store`, does not call Auth.js session refresh, and has no cookie setter/clearer. A corrupt secondary cookie is now irrelevant instead of throwing before the backend call. Repository tests inspect exact bearer selection and cookie-jar preservation; the parent HTTP/PG cases independently exercise the returned actor and backend revocation behavior.

## Independent verification of parent evidence

The same extended harness was applied to r36 and r37, with source-specific before/after hashes and fresh random synthetic actors. Both sets of all thirteen recorded runtime hashes match their respective source. Only the status route hash changes among those runtime files; the live backend remains the frozen r36 server at loopback port 44349 and the same dedicated synthetic PostgreSQL database.

| HTTP/PG case | r36 | r37 |
| --- | --- | --- |
| Live primary, no secondary | PASS: exact A | PASS: exact A |
| Revoked primary, no secondary | PASS: false/null after backend 401 | PASS: false/null after backend 401 |
| Live A plus valid A-bound secondary B | FAIL: B returned | PASS: exact A; B not returned |
| Revoked A plus live B | FAIL: authenticated B | PASS: false/null after backend 401 |
| Live A plus corrupt secondary | FAIL: `BackendSessionExpiredError` | PASS: exact A, no throw |
| Missing primary plus valid secondary | PASS: false/null, no request | PASS: false/null, no request |
| Malformed primary plus valid secondary | PASS: false/null, no request | PASS: false/null, no request |

Every r37 case checks unchanged cookies and no `Set-Cookie` with no-store response headers. The original three-case r36 report was a subset: the seven-case extension includes those first three plus four new cases. Do not count it as ten independent HTTP/PG scenarios. The extended log records **7 passed (7)**; the old extended r36 receipt records **4 pass / 3 fail**.

The new repository suite executes the production route, primary-claim reader, JWT crypto and contract client. Only request-cookie transport and network responses are controlled. It adds exact bearer assertions for live/secondary/revoked cases and zero backend calls for missing/malformed primary, plus a controlled network-loss case. Its seven cases are a separate evidence layer, not seven additional live-provider/PG scenarios. The repository log records **7 passed (7)**. Parent reports Web typecheck exit 0; the inspected typecheck log contains the expected build/typecheck commands with no diagnostics, but is not itself a structured process-exit receipt.

## Evidence hashes

Artifacts are under `/private/tmp/ai-test-account-sync.umqxBi/parent-macos-manual/web-pg-chain`:

| Artifact | SHA256 |
| --- | --- |
| `status-extended.test.ts` | `2ccc308953c23a4395680db69ee5ce130c62f81910cd3b91bdc80fde7c5d4d7e` |
| `status-extended.config.mjs` | `eaa46b83e517779d313b234df523b5d9ce1ee2bfe097a27491209381c72ecf8e` |
| `r36-status-extended.json` | `3ad2635613422f9a60adae888833d3e8591b1ed30f9a846899cb9f9e191cde34` |
| `r37-status-extended.json` | `73d96220ab06d029975981b882de2309a681df0d4f7a54dcc6e67cc585160dad` |
| `r37-status-extended.log` | `164fc42a9b56bca9694a2aed0e8389615d2f546a5b3e8cc8021522df8c5961d2` |
| `r37-status-unit.log` | `79452a7aaa943da56ff6767ed90c715528bd53ddecc3f8bfaf63f341afc58039` |
| `r37-status-typecheck.log` | `0ec50c276c0d59d6b4f67afb0493b725044d6766e70ac6a04c5f9bd117971611` |

## Remaining acceptance boundaries

B is an ordinary synthetic account with a production-sealed secondary cookie correctly bound to A, not a Lab account created through real Lab UI/permission flows. This closes the selector bug without claiming Lab-product coverage. Missing, malformed and revoked primary cases were executed; natural expiry, a wrong-parent/wrong-endpoint secondary cookie and actual WK store readback were not separate dynamic cases. The repaired route has no secondary-cookie read path, which supports those latter secondary variants statically.

These tests do not prove native request correlation, persistent-store ownership, late Set-Cookie isolation, response transport in WK, pending-writer settlement, ASWebAuthenticationSession, live OAuth or integration into the parent/Pi candidate. Other r36 target/clock findings remain outside this repair and are not closed by these results. Carry this closure forward only when the integrated status source matches the reviewed hash.
