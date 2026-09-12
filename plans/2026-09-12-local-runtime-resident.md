# Resident local product runtime

## Outcome
Keep the deployed backend current and healthy, run a stable production Web server, and verify browser login through the Mac's LAN address. Preserve Opik capture and existing databases.

## Boundary
Owner-authorized local testing. Backend remains loopback-only; Web listens on LAN port 3000 with actual account authentication. Do not stop parallel GET-9 fixture servers on 3344–3347, unrelated containers, or alter TestFlight/public endpoints. Credentials stay in Infisical. No simulated login or public tunnel.

## Current evidence
- Backend on 4317 is healthy but runs the earlier Opik image at 0dd66071; remote main is 97aca735 with newer harness dependencies.
- Existing backend LaunchAgent checks health every 300 seconds but does not update code.
- Web 3344 belongs to the active GET-9 worktree and listens only on loopback. A distinct resident server will use 3000.
- LAN interface en0 is currently 192.168.1.6. Secure production cookies need explicit trusted-LAN HTTP compatibility before login can work there.

## Milestones
1. [complete] Prepare isolated main baseline, update backend and preserve secrets/data.
2. [active] Review scoped Pi cookie compatibility, build Web and install resident LaunchAgent.
3. [pending] Prove LAN HTTP login/session/protected request plus health and restart recovery.
4. [pending] Record operating/update contracts, independent review and repository delivery; configure requested future update policy.

## Verification
Exact deployed code/image, backend readiness and Opik probe; Web production build, LAN listener, real browser login persistence, authentication on protected route, launchd ownership/restart. Report local-LAN-address validation separately from another physical device.

## Implementation evidence
- Backend image `talent-signal-backend-local:main-97aca735` is deployed; migration 065, Apple challenge, silent-WAV ASR, real Claude provider and Opik deployment probes passed. Infisical image/revision metadata was updated only after success.
- Web production build passed; full Web suite: 474 passed, 1 skipped. Cookie policy: 63 passed. Lint, docs and Infisical manifest checks passed.
- Independent review identified build provenance and listener ownership gaps; both were fixed and independently closed with no remaining P0/P1/P2.
- Browser connector inventory was unavailable, so native Chrome is used for the real LAN login proof.
