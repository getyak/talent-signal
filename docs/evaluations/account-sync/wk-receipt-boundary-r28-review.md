# Independent review: WK response receipts and operation recovery

Reviewed the supplied frozen experiment artifacts and the parent's proposed protocol, without running the probe, a database, or product code. No product source was edited.

## Decision

**Supported for the measured transport boundary.** A real WKWebView can inspect a correlated 200 HTML response in `WKNavigationResponse`, cancel rendering, and send a subsequent POST whose same cookie store automatically includes the first response's HttpOnly cookie. The proposed response-header channel is a reasonable narrow transport for non-secret protocol receipts. It is not evidence that the current product's authentication, cookie isolation, native lifecycle or full recovery flow works.

Two conditions are essential before integration: rejecting an old navigation does not undo its Set-Cookie effects, and a pending-continuation acknowledgment must not discard the only material needed to recover the later credential mutation. Both are protocol/lifecycle requirements, not reasons to add a JS bridge, copy cookies, use URLSession authentication, or create a parallel result-authority API.

## What the experiment proves

- `Probe.swift:20–24` creates a fresh nonpersistent WK store for each case. Within each positive case the same view/store sends consume and ack. Native code does not read, copy, or set cookies. `server.py:25` sends a synthetic HttpOnly, SameSite=Lax cookie on consume; the HTTP trace records it on the following ack.
- `Probe.swift:47–51` checks main frame, HTTP 200, parsed MIME, origin tuple, path, and request echo/query correlation. The cancel-render case dispatches ack after cancelling the response policy (`:69–70`); the allow-render control waits for didFinish (`:65–77`). Both record a cookie-bearing ack.
- The stale echo and HTTP 500 cases record invalid receipt and no ack. The six-request HTTP trace independently agrees with the four-case receipt: two consume/ack pairs, then two consume-only requests.
- The captured first-run receipt is supported with `timedOut: false`. The saved cleanup record explicitly states that the accessory CLI wrapper did not promptly exit after `NSApplication.stop`; task-owned processes were terminated afterward. This does not establish production window/process lifecycle correctness, and the report does not claim it does.

## Limits of the probe

The server is a synthetic loopback HTTP fixture, not an authentication server. Its ack outcome is generated from the URL and cookie presence, not a verified backend acknowledgment. The experiment demonstrates cookie transport, not authorization. It does not test Secure cookies over HTTPS, the product's persistent data store, system-browser/ASWebAuthenticationSession cookie separation, real Auth.js sealing, or live OAuth.

The request body contains only `{"synthetic":true}` (`Probe.swift:33`), and the server discards it (`server.py:16`). Thus strict query/body requestRef equality is a proposed requirement, not an experimentally verified result. Duplicate query/header values, missing headers, wrong MIME/origin/phase, redirect chains, concurrent/late responses, account changes and final mutation recovery were not exercised. The sequential probe uses shared mutable expected fields and does not map navigation failures to a generation. Its logged error contains numeric code 102 only (`Probe.swift:80–81`), without domain/navigation identity. Do not copy its failure handler as production cancellation policy.

## Required protocol constraints

1. **Correlated receipts, not authority.** Each native POST gets a new bounded opaque requestRef. The fixed same-origin route must reject missing, duplicate or disagreeing query/body refs before any transition and echo that exact ref. Native must match view identity, owning generation, route/phase, current requestRef, attempt, flow/round, purpose/intent and allowed outcome before advancing. Do not accept first-match duplicate fields or arbitrary redirects. Require status 200, main-frame HTML and the complete canonical receipt header set; reject malformed/combined values, unsupported version and noncanonical identifiers. An exact prior deadline may remain unchanged or shorten; a response cannot renew it.
2. **Receipts follow real server work.** The success headers may be emitted only after backend success and the Web handler has staged the correct attempt/flow-specific HttpOnly continuation. ACK must itself read that cookie, validate its exact grant/flow plus the live original actor/session and backend pairing/verifier, and receive the backend acknowledgment. Neither echoed requestRef nor any receipt metadata substitutes for PKCE/state, cookies, fresh proof, or the backend's immutable account/user/session/revision checks. New target admission still requires the server-sealed flow, exact existing grant/challenge and acknowledged current round. A native `acknowledged` flag never authorizes a new target by itself.
3. **Cancel-render is not cookie rollback.** This experiment proves cookie application can survive rendering cancellation; the fixture even sets the cookie on stale and 500 responses. Therefore native requestRef/generation rejection cannot prevent a late A response from changing the WK store. Use attempt/flow-specific continuation and pairing cookies, owner-specific reads/cleanup, and preserve frozen-scope checks. A late response must never replace the primary login or overwrite/delete B's shared operation/credential cookie. Any compatibility cookie shared with ordinary Web forms needs an explicit safe ownership design; rejecting its response after arrival is insufficient. Error responses should not stage success cookies.
4. **One narrowly owned policy cancellation.** Record the exact navigation handle/request generation being intentionally cancelled. Ignore only its matching expected policy-interruption failure; check the appropriate error domain/type as well as its navigation owner. Do not globally ignore 102, all cancelled navigations, didFail, or didFinish. Old consume/result/ack completions and cleanup must be inert toward a newer request or flow. A timeout or lost/invalid response remains unconfirmed and retains eligible recovery material.

All receipt pages should be minimal inert HTML with no secret, executable script or external resources, and private/no-store caching. Provider tokens, PKCE verifier, grant secret, session tokens and cookie values stay out of response metadata, URLs, DOM and logs. The requestRef is only correlation metadata and must not become a bearer capability.

## Smallest complete password/target recovery lifecycle

The proposed rule “clear the original verifier after ACK” is too broad. For current set/change-password, the first ACK proves only that the grant is now available in WK; the password form runs afterward. If its response is lost after the write, clearing the current verifier or pairing makes the paired result API unusable even though direct backend tests retaining that verifier pass.

Use the existing paired result/ack API and keep a **flow recovery context distinct from the active provider-round context**:

| Stage | Native/UI behavior | Material retained |
| --- | --- | --- |
| Current consume/result returns pending continuation | Validate its correlated receipt, then send current ACK. No claim that a credential changed. | Current attempt/flow, verifier, original deadline and owning WK pairing/continuation. |
| ACK returns pending continuation acknowledged | Close/release provider-round presentation; show nonblocking waiting-for-password or ready-for-target state. | Keep the flow recovery context and its cookie authority. Pending ACK must not delete them. |
| Ordinary password form succeeds or has an unknown response | Preserve the exact operation mapping. Use a navigation/UI hint only to schedule a read-only paired result; offer an explicit “Check result” action. The hint is not proof of completion. | Retain context on unknown. `clearStagedAuth` must not destroy the only sealed grant/flow mapping after response loss. |
| Result returns this exact grant's committed effect | Verify correlated committed receipt, original scope and intent, then send committed ACK. Never repeat the mutation to discover its outcome. | Retain until committed ACK is itself validated. |
| ACK returns committed acknowledged | Present confirmed result and clean only this flow's retained context/cookies. | No further mutation authority retained for this completed flow. |
| Original deadline, account/scope change, explicit interruption or missing recovery material | End the pending interaction truthfully; do not infer successful cancellation or mutation, and do not modify another flow. | Release/invalidate only the affected context according to the defined terminal policy. |

The receipt contract must distinguish pending acknowledgment from committed acknowledgment through a fixed enum (for example, acknowledgment phase plus `pending_continuation` versus `committed`). A generic `outcome=acknowledged` cannot drive both cleanup decisions safely. Keep WK pairing and the native verifier together through this lifetime; retaining only one does not preserve recovery. Existing backend `acknowledged_at` can continue to mean current continuation admission for target start, while the returned committed receipt determines final native cleanup.

For target linking, the narrowest safe default is to retain the original current flow's recovery context until final committed ACK/deadline, while the target receives a separate round context and fresh state/verifier/request refs. This avoids an additional authority-transfer handshake and costs only bounded ephemeral state. If the implementation later transfers recovery to the target, retire current context only after the new target's exact same-grant server binding and usable original-WK pairing are confirmed; merely dispatching prepare or receiving a pending URL is not proof of takeover. Old current callbacks must not advance or clear the target.

The current and target result paths must resolve the same immutable grant/audit completion history, as specified in the reviewed r26 repair protocol. This maintains one authorization path. It does not relax original actor/session validation or let native metadata authorize a credential write.

## Integration acceptance still required

Run the actual Web handlers and product controller through current consume → pending ACK → ordinary password submit → intentionally lost response → paired result → committed ACK, verifying original session, one audit/revision change and eventual cleanup. Also exercise a delayed A response carrying Set-Cookie after B starts, target handoff, invalid/missing/duplicate receipt fields, account switch, ACK loss and scoped policy-cancel failures. Validate same-jar Secure/HttpOnly cookie delivery on the actual HTTPS origin. The small transport probe should remain a separate receipt, not be relabelled as this acceptance.

## Evidence hashes

All supplied file hashes match `binding.json`; no experiment file was modified by this review.

| File | SHA-256 |
| --- | --- |
| decision.md | 8c4462efbf582a07036b4dcc3feb319cb955759dbd3515f9812d7f52e42968b3 |
| Probe.swift | e064f0dff8aae52c3d3e319d673ca686b3fb393be2b6bca7f733d271166e7551 |
| server.py | 9670b7f8aa370fa52cb2967ea7cf603c66726ce7a1d2fbc94b7d2635f4ee54f3 |
| receipt-supported-first-run.json | a0145f9ddf2b569e71b74a33e814d9212a2eae09d17dc5d81ae9ab08f1cfe511 |
| http-trace.jsonl | bd53cc300dda1b2e982c79d5b7f66ae7956856bb06c685a31daf0ff484d06c56 |
| binding.json | 081541bbecdf82903b895065a882b9de0de1da531e6d683797bbaddb1375bb8c |

The supplied supported receipt ran at `2026-09-25T03:32:49Z`; the binding record was written at `03:33:40.725210Z`. It contains six actual loopback requests and the explicit task-process cleanup limitation.
