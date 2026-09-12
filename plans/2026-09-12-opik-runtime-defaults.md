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
2. [done] Pi implementation reviewed; local Claude context/message/tool capture added. 48 agent checks and 4 projection checks pass, including restart retry and source-generation revocation.
3. [active] Deploy preserving data; dedicated synthetic account/session prepared through real authenticated endpoints; model invocation and destination readback pending.
4. [pending] Encode operational default, checks and exact remaining coverage limitations.

## Proof
Latest image identity, API health, captured product run/spans, retained outbox receipt, exact Opik trace readback. Synthetic probe data is labeled and distinct from historical user data. Documentation checks and focused source tests must pass.

Configuration evidence: the previous Docker host gateway failed DNS resolution. Fixed `opik-frontend:5173` alias is confined to the existing private Opik network. Source-bound projection carries the exact product run generation. A discovered policy key-order mismatch was corrected by normalizing the outbox policy with its schema.
