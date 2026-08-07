# Web screenshot-to-context loop

Status: completed; rotated Ark credential still required for live extraction
Owner: Codex
Started: 2026-08-06

## Outcome

An authenticated recruiter can submit a WeChat conversation screenshot in the
Web workspace, review a model-produced transcription and evidence proposal,
bind it to a contact and assignment context, confirm or dismiss each proposed
fact, approve one internal `prepare_question` action, verify the resulting local
attention item, and delete the governed source lineage.

The raw image is processed in memory and is not stored by Talent Signal. The
reviewed extracted text is the governed source retained by the local backend.

## Boundaries

- Web first. Voice capture is configuration-only in this slice.
- Ark/Doubao multimodal understanding analyzes screenshots.
- Seedream 5.0 Lite is the default image-generation model, but private
  conversation screenshots are never routed to image generation.
- No candidate contact, calendar event, CRM record, or other external write.
- No candidate scoring, personality inference, protected-trait inference,
  culture-fit inference, or acceptance-probability claim.
- Preserve the existing fixture evaluation journey and unrelated documentation
  changes.

## Observable completion evidence

- A screenshot upload route validates authentication, origin, media type, size,
  and provider configuration.
- Provider output is parsed into exact source messages, reviewable assertions,
  visible ambiguities, and at most one internal action.
- A non-fixture capture can be persisted and loaded by capture ID through the
  existing account-scoped backend.
- The redesigned workspace shows capture, review, contact context, next move,
  result, retention, failure, empty, ambiguous, and deletion states.
- Contract, backend, Web unit tests, type checks, builds, docs checks, and a
  browser walkthrough pass.

## Work plan

1. Generalize the backend workspace read model from fixture ID to capture ID,
   without breaking frozen evaluations.
2. Add a governed extracted-text retention scope for screenshot-derived
   evidence while keeping the raw image out of storage.
3. Add Ark provider configuration and strict screenshot proposal parsing.
4. Add authenticated Web routes for screenshot analysis and capture commit.
5. Replace the integration-only fixture shell with the contact-context
   workspace while preserving boundary-case access.
6. Exercise no-signal, ambiguity, provider failure, stale state, retry,
   deletion, and responsive behavior.
7. Run the project review lenses and route durable documentation.

## Decision notes

- The product entity is a person within an assignment/relationship context,
  not a generic document page.
- The living page is compiled from confirmed state. Model output remains a
  proposal until a recruiter decides.
- Raw screenshot deletion and extracted-text retention are separate facts and
  must be described separately in the UI.
- A screenshot chat avatar is source context, not a verified portrait. The
  living contact page uses a neutral monogram until the recruiter adds a
  confirmed photo and keeps the source-to-contact lineage visible.
- Seedream generation and Doubao screenshot understanding are separate
  capabilities with separate model identifiers.

## Completion evidence

- A real browser walkthrough at desktop and 390 px mobile widths covered the
  empty state, import review, honest provider-unavailable state, living contact
  page, two independent fact confirmations, exact action approval, simulated
  internal execution, observed readback, reload continuity, and deletion.
- The final isolated synthetic walkthrough deleted 16 registered derivatives
  and retained 17 audit-safe lineage entries without conversation content.
- Web lint passed, 52 Web tests passed, 17 backend tests passed, backend CI
  passed, and the Web production build generated all routes successfully.
- Documentation, compiled wiki, architecture diagrams, and all eight frozen
  core recruiting evaluations passed.
- No credential supplied in chat was written to source or local configuration.
  A live Ark call remains intentionally unclaimed until that exposed credential
  is revoked and a replacement is injected through the ignored server
  environment.
