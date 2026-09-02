# Unscoped Agent conversation and remote capability redeploy

Status: complete
Owner: Codex
Started: 2026-09-02

## Outcome

An authenticated iOS user can enter Agent without choosing a person, send a
low-risk conversational message such as `你好`, and receive an account-scoped,
zero-evidence, zero-effect reply. Questions that clearly need relationship
history continue through relationship recall. The existing remote Relationship
Ask and recruiter dictation paths are rebuilt and verified on the owner-only
Tailscale TestFlight backend.

Completion requires a directly observed mobile conversation, a scoped remote
Ask provider probe, a remote voice provider probe, healthy loopback and tailnet
readiness, and proof that no unscoped turn can read candidate evidence or gain
external-write authority.

## Boundary

In scope:

- an authenticated, idempotent, unscoped Chat task containing only the submitted
  message and no Person, relationship, Wiki, citation, attachment, or Tool context;
- direct routing for any message that does not explicitly ask for relationship
  work;
- an explicit `continue without a relationship` recovery from unresolved recall;
- protected iOS Session persistence and same-key retry for an unknown result;
- remote Zhipu text Chat and Doubao recruiter dictation deployment verification;
- preserving existing exact-effect approval for Contacts, Calendar, messages,
  notifications, ATS, CRM, and every other consequential external write.

Out of scope:

- general autonomous recruiting or account-wide candidate retrieval;
- silently choosing a person, confirming a fact, or executing an external action;
- enabling screenshot person research while its staging TikHub credential returns
  `403 TIKHUB_AUTH_FAILED`;
- public App Store promotion or distribution outside the existing internal
  TestFlight group.

## Current evidence and important unknowns

- The iOS sender currently routes every unscoped text turn into relationship
  recall before any backend Chat request, so `你好` never reaches a model.
- The TestFlight API at `127.0.0.1:4317` already runs with remote Chat admitted
  through pinned `zhipu/glm-5.3` and recruiter voice admitted through Doubao.
- Tailscale Serve owns `https://smile-m4-minimac-mini.tail25e61f.ts.net` and
  forwards its root handler to `127.0.0.1:4317`; the backend audit passes.
- PostgreSQL is internal-only in the TestFlight Compose topology.
- Staging contains every declared person-research secret name, but TikHub health
  is only `ok`; authenticated credential readback returns HTTP 403. That feature
  must remain disabled until a valid credential and a non-person synthetic Run
  prove the provider path.
- The shared working tree contains substantial unrelated edits. This plan owns
  only the unscoped Chat contract/module, narrow iOS routing/session additions,
  focused tests, and the resulting deployment evidence.

## Chosen approach

1. Add a separate unscoped Chat contract and authenticated endpoint rather than
   weakening the relationship-bound `/v1/chat/tasks` manifest contract.
2. Send only the user's submitted text to the pinned Chat provider under a
   separate no-evidence prompt. Require an empty citation set and an empty
   external-effect set; persist only the idempotent task response and metadata-only
   audit receipt.
3. Route messages directly unless they explicitly ask for relationship work. Keep
   existing local identity recall for relationship-dependent questions, and
   expose a user-owned bypass when recall cannot find a relationship.
4. Persist one unscoped idempotency key on device so network loss or relaunch can
   reconcile the same task instead of billing a duplicate model call.
5. Rebuild and redeploy the existing TestFlight backend through transient Infisical
   injection. Reuse the existing Tailscale root handler and do not alter the 8443
   handler or database volume.

## Milestones

1. **Complete — Contract and behavior.** Implemented the zero-context backend
   task, default direct iOS routing, protected recovery, and focused
   contract/unit/UI tests.
2. **Complete — Remote runtime.** Backend, documentation, secret, Zhipu Chat,
   Doubao voice, loopback, Tailscale Serve, Apple challenge, and PostgreSQL
   isolation checks passed after rebuilding the TestFlight backend.
3. **Complete — Real surface.** The Debug client received a live remote `你好`
   reply without opening relationship choices; the response carried no citations
   or external effects. Scoped Ask and synthetic voice provider probes also
   passed.
4. **Complete — Review.** `REVIEW.md` and evidence-safety vetoes passed for the
   zero-context boundary, retry identity, metadata-only audit, and unchanged
   exact-effect approval. TikHub remains disabled after authenticated HTTP 403.
5. **Complete — Internal iOS release.** PR #100 passed required CI and merged to
   `main` as `d87ffba401b9822a7cba6c4cd8866307219b361c`. Release workflow
   `33550760121` processed TestFlight version `0.1.29`, build
   `20260901194020`, then published tag `v0.1.29`, the attested IPA, and its
   machine-readable release receipt.

## Replanning signals

- Re-plan if an unscoped response requires candidate context or citations; that
  intent must return to relationship recall instead.
- Re-plan if the existing TestFlight origin or API contract requires a new signed
  archive rather than a backend-compatible Debug verification.
- Stop screenshot activation if TikHub credential readback, vision capacity, raw
  image zero-retention, or provider admission cannot be proved.
