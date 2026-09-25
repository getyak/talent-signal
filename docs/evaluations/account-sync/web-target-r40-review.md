# Parent r40 actual Web/HTTP/PostgreSQL verification

Candidate `cff4946a04df816cbdf0fe1bc52464395baba6c3`, frozen root `/Users/cubxxw/.codex/worktrees/account-sync-ready-r40/talent-signal`. Real backend routes on loopback44359, isolated `account_sync_web_pg_chain`, controlled Apple/Google proof verifier. Actual Web Actions, cookie crypto, relay producers and contracts client; cookie transport adapter, no rendered UI/WK/live OAuth. Each JSON records before/after hashes and `sourceStable=true`.

- `web-pg-chain/r40/password-chain.json`: 2/2 pass, normal password continuation and lost committed response recovery.
- `web-pg-chain/r40/status-extended.json`: 7/7 pass, primary versus Lab secondary actor boundary. Preserve exact r37 correction.
- `web-pg-chain/r40/target-complete.json`: 0/2, both real password-first and provider-first target chains prepare successfully but consume returns303 after backend409 `DESKTOP_AUTH_ATTEMPT_INVALID`.
- `web-pg-chain/r40/target-metadata.json`: 0/2, diagnostic variant explicitly adds role=target,purpose=credential_round to target consume. Password-first commits once with the original actor, 1 audit and revision+1; consume omits intent, result reports role=current and omits flow/grant/intent. Final ACK is200. Provider-first still fails consume303/409 even with this extra display metadata.

## Confirmed producer/consumer mismatch

Native `DesktopAuthRequests.consumeRequest` sends only attempt_id/code/verifier/request_ref. Web consume resolves the sealed target grant secret only when the incoming body claims target role or credential purpose. Therefore its real native caller never enters the resolver and target consumption cannot complete. The diagnostic variant is NOT a successful native test: it intentionally adds fields the native caller does not send, exposing additional stage/recovery defects.

The provider-first prepare now resolves its continuation first, but consume must resolve the same captured sealed grant, not lose the continuation pointer or fall back to the password-only operation shape. Correlation metadata is never authority; derive role/intent/flow/grant from the sealed authoritative round and cross-check supplied comparators. Do not accept a client grant secret.

`desktopReceiptResponse` has no intent contract. The successful diagnostic password-target result emits role=current and loses flow/grant/deadline. A strict native target policy will reject it, even though the backend committed. All prepared/consume/result/ACK/cancel producers must share the semantic stage contract with the real controller, including retained recovery after the mutable current attempt is gone. Never invent a grant at current prepare.

Fixes must pass the original actual-call-shape test, full provider-first and password-first target completion, dropped-response/result/finalACK and exact same-actor/audit/revision assertions. Preserve the two passing password-chain and seven primary-status cases. Independent native review is `native-r40-review.md`, with an exact-controller probe that currently rejects fresh prepared receipts.
