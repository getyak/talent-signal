# Product observation deployment default

## Outcome
Configure the owner-authorized private product runtime to persist runs and export source-bound content to the existing Opik instance. Verify a real product request at the destination. Future internal deployments must not silently omit observation.

## Boundary
Current staging product accounts only; private Opik, seven-day maximum and existing source deletion rules; no public exposure, historical fabrication, provider change, or external business action. Preserve existing databases and unrelated worktrees.

## Evidence and unknowns
- Live API has no runtime policy; durable outbox is empty. Opik service is healthy after recovery.
- Product database retains ten runs, nine with input/output; six have spans. Claude harness lacks product-run capture.
- Need verify current Infisical configuration, container-to-Opik reachability, source scopes, real authenticated request and durable export readback.

## Milestones
1. [done] Staging owner policy stored in Infisical; fixed private Docker DNS verified HTTP 200; deployment requires policy and transport probe.
2. [done] Pi implementation reviewed; local Claude context/message/tool capture added. 167 agent checks and 5 projection checks pass, including restart retry and source-generation revocation.
3. [done] Deployed image `opik-20260912-v3` at source revision `0dd660715cab623be343d5d783ee899fcd3ba94d`; real authenticated model request and destination readback passed.
4. [done] Canonical operations docs require capture, durable retry and destination proof; limitations and verification are recorded below.

## Proof
Latest image identity, API health, captured product run/spans, retained outbox receipt, exact Opik trace readback. Synthetic probe data is labeled and distinct from historical user data. Documentation checks and focused source tests must pass.

Configuration evidence: the previous Docker host gateway failed DNS resolution. Fixed `opik-frontend:5173` alias is confined to the existing private Opik network. Source-bound projection carries the exact product run generation. A discovered policy key-order mismatch was corrected by normalizing the outbox policy with its schema.


## Verified deployment — 2026-09-12

- Image: `talent-signal-backend-local:opik-20260912-v3`, Docker manifest `sha256:28a36f6232b24efc6e98ddd9aec301375eb6692af4526aa9748cf6d2c715d5db`.
- Standard deployment exited 0. Isolated durable synthetic transport probe passed write, destination readback and deletion readback while real native records already existed. Apple authentication, silent-WAV voice and selected chat-provider checks passed. PostgreSQL remains private and API health reports healthy.
- Real authenticated synthetic product request: HTTP 201, run `c0519baf-28bc-7184-a61f-2e7b9d325c64`, completed. Local DB retains `harness.context.supplied` and `harness.sdk.assistant`. Opik projection trace `00bbc287-60d5-7e3f-aed7-c13b86b4de08` retained three spans with no receipt error. Host context is complete; unobserved SDK wire input is explicitly unavailable.
- Product projection project: `talent-signal-runtime-product-runs`, 11 traces at verification (nine previously captured historical runs and two labeled synthetic product requests). Native provider observations remain in `talent-signal-runtime` to preserve their own usage accounting.
- Focused checks: 167 agent tests passed, one optional live test skipped; six projection/probe tests passed; all ten product-run PostgreSQL integration tests passed in the newly created disposable `opik_capture_test` database. The first integration attempt used an older fixture schema and failed before run admission; current migrations in the isolated database resolved that fixture mismatch.
- Independent review closed the probe queue-isolation P1 and found no remaining P0/P1. A live missing-context span exposed cleanup deleting an in-flight metadata placeholder. A generation-guarded final upsert now restores only an admitted source; PostgreSQL tests cover recovery and revocation.

### Limits

No replayed model calls or invented historical detail. Three historical conversations had no detailed spans; only their already captured request/result is available. One failed historical run remains metadata-only. Original image bytes stay with their canonical source. Retention is at most seven days and may end earlier when the source expires or is revoked. New accounts require policy admission; current admitted owners' active Lab accounts inherit the projection scope. Tailscale access is private tailnet access; Opik itself has no account/password login. This does not configure unrelated old development stacks or imply public internet exposure.

The Docker VM has 6 GiB RAM and was near capacity during verification. Normal Docker compilation was aborted under memory pressure. The deployed image overlays locally compiled workspace code onto the prior runtime image; dependency manifests and lockfile were verified unchanged. No unrelated containers were stopped. Durable outboxes retain retries across temporary destination outages.
