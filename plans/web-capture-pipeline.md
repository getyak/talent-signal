# Web capture pipeline

## Outcome and boundary

An intentional browser selection, page excerpt, visible-tab capture, or chosen
screen capture reaches the signed-in user's durable backend task. AI extracts
attributable source material, resolves or creates a reversible internal Person,
and exposes progress, ambiguity, failure, source and the actual result in the
Web workspace. No inferred field becomes a confirmed fact or external action.

## Evidence and approach

- Baseline: `e9bbaa5b`, isolated branch `codex/web-capture-pipeline`.
- Before deployment, preserve the currently deployed `cd402c98` account-scope and
  product-feedback integration through a merge. Keep its scoped fetches, account
  controls, feedback component and governed run lifecycle.
- Existing browser handoff only admits one synthetic text fixture. Image upload
  is disabled in the extension despite the backend's newer governed image store.
- Reuse the account/owner-scoped contact task runner, image lifecycle, canonical
  resource intake and People. Extend admission for exact reviewed text and source
  metadata instead of creating a second CRM, database, or AI runner.
- Use same-origin requests inside the chosen Web tab so browser-managed login
  works without exposing credentials or weakening cookie/CSRF settings.
- Web surface: desktop capture inbox for recruiters, quiet neutral typography,
  compact recent-source list, one selected processing/result panel, minimal motion.
- Keep screenshot/iOS contracts backward compatible; add text admission separately.

## Milestones

1. Complete: extend durable task admission, source provenance and text extraction.
2. Complete: connect extension capture and receipt reconciliation to real authenticated tasks.
3. Complete: integrate the capture inbox with workspace navigation and complete UI states.
4. Complete: verify focused tests, browser surfaces, database readback, and local deployment.

## Completion evidence

Use synthetic sources only for testing. Exercise text/image admission, duplicate
retry, changed payload, account isolation, no person, ambiguous person, restart,
deletion and stale session. Render desktop/mobile and both themes. Run affected
typechecks/tests/build, extension packaging and `pnpm docs:check`. Rebuild and
redeploy the local TestFlight backend as required by backend AGENTS.md. Record
actual evidence and remaining limitations here before handoff.

## Implementation sources

- Next.js 16.3.4 bundled guide: `next/dist/docs/01-app/01-getting-started/15-route-handlers.md`.
- https://developer.chrome.com/docs/extensions/reference/api/scripting
- https://developer.chrome.com/docs/extensions/develop/concepts/activeTab
- https://developer.chrome.com/docs/extensions/reference/api/desktopCapture

## Progress

Implemented the shared text/image pipeline, exact-task handoff, capture inbox,
source/person views and governed deletion. Backend integration: 11/11 passed;
extension contracts: 36/36 passed; initial BFF tests: 3/3 passed. Live browser
proof uses an isolated PostgreSQL container on 55640, backend 4348 and Web 3048.
No production account or private source is used in proof artifacts.

Live AI exposed GLM-5.3 rejecting disabled thinking (provider code 1210). Text
extraction now uses enabled thinking with low effort. Text extraction has a
separate versioned product prompt and exact-substring validation. Successful live
AI and extension/browser verification completed on 2026-09-10. The real extension
submitted page text twice with the same request and received the same durable
task. Real AI created a Person. A subsequent reviewed screenshot reused that
Person, including recovery of the same task after a backend restart and provider
429. Original image readback returned HTTP 200. Screenshots are in
`output/web-capture-pipeline/` (synthetic sources only). See the
[evaluation record](../docs/evaluations/2026-09-10-web-capture/README.md).

## Deployment and handoff

- `./scripts/deploy/testflight-local.sh` completed successfully on 2026-09-10.
  Deployed backend revision: `c8d775ecae2b02aef175b8af1631aed46c08e1e7`.
  Subsequent commits only refine Web labels and record evidence.
- Repository-configured, host-ready, runtime-ready and tailnet-ready: verified.
  API remains on `127.0.0.1:4317`; its PostgreSQL has no host-published port.
  Existing `/ops-health` and HTTPS 8443 handlers were preserved.
- Exact tailnet origin: `https://smile-m4-minimac-mini.tail25e61f.ts.net`.
  Readiness, Apple authentication challenge, synthetic voice and Relationship Ask
  provider probes passed. The new browser receipt endpoint rejects anonymous
  requests with 401. No physical-device or new CI release proof is claimed;
  backward-compatible backend admission needs no new iOS archive.
- Web production build is running at `http://127.0.0.1:3049/workspace/captures`,
  against the deployed backend. Existing Web 3000 was preserved. Start from this
  worktree with:

  ```sh
  ./scripts/infisical/run.sh dev /shared /web -- env \
    TALENT_SIGNAL_BACKEND_URL=http://127.0.0.1:4317 \
    AUTH_URL=http://127.0.0.1:3049 AUTH_TRUST_HOST=true \
    TALENT_SIGNAL_INTEGRATION_MODE=false \
    pnpm --filter @talent-signal/web exec next start --hostname 127.0.0.1 --port 3049
  ```

- A separate production-mode Web proof on 3050 used the isolated synthetic
  backend: real password login, browser-managed secure session, original image
  GET 200 and the correct Person heading all passed after the merge.
- Load `apps/chrome-extension/dist` as an unpacked Chrome extension and connect
  to `http://127.0.0.1:3049`. The distributable ZIP is
  `output/web-capture-pipeline/talent-signal-capture-0.2.0.zip`.
- Remaining manual surface check: the native screen/window selection dialog.
  Text and reviewed image upload were verified through the actual extension.
