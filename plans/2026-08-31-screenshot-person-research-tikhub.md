# Screenshot-driven public person research with TikHub

Status: active — product slice implemented; live provider admission blocked
Owner: Codex
Started: 2026-08-31

## Outcome

A user can attach one screenshot to Relationship Ask and press Send, without
first selecting a relationship. The authenticated backend creates one
account-scoped task, verifies the process-only image, and a credential-isolated
Agent Host lets a pinned vision-capable model choose among bounded TikHub
public-profile tools. The response returns a cited, discardable research draft
without asking the user to choose a relationship, platform, tool, or candidate
first. The screenshot and provider output never become confirmed
identity, relationship evidence, a person score, or permission to write
anywhere.

## Boundary

In scope:

- store `TIKHUB_API_KEY` and `TIKHUB_BASE_URL` in environment-scoped
  `/agent-host` folders and expose them only to the Agent Host process;
- add a separate person-public-profile research definition instead of
  weakening the existing company/market research prohibition;
- accept one local PNG, JPEG, or WebP artifact, hash it, keep its bytes out of
  the durable Run journal, and require a vision-capable pinned model;
- let the model select bounded TikHub profile-search tools from visible text
  clues such as a display name, handle, profile URL, or platform chrome;
- normalize provider results into same-Run source handles and create only a
  draft with possible/ambiguous identity status, citations, limitations, and
  no publication authority;
- prove no-text/photo-only abstention, same-name ambiguity, hostile screenshot
  instructions, provider failure, budget enforcement, replay, and credential
  isolation.
- connect the existing iOS Ask image attachment to the Agent Host through a
  strict Unix-socket service contract and render unconfirmed public sources in
  the same response;
- route one unscoped PNG/JPEG/WebP directly through an authenticated
  `/v1/person-research/tasks` contract without creating a Person, relationship,
  Wiki, evidence record, or durable raw-image object;
- keep TikHub credentials exclusively in the Agent Host environment/sidecar
  while the API receives only the socket path and a disabled-by-default gate.

Out of scope:

- face recognition, reverse-face search, biometric templates, or matching a
  person from appearance alone;
- private-account access, cookies, login-session reuse, contact details,
  background checks, sensitive/protected-trait inference, candidate scoring,
  culture fit, or acceptance prediction;
- automatic binding to an existing Person, creation of confirmed relationship
  state, publication into the Wiki, outreach, calendar/contact/ATS writes, or
  any other external effect;
- generic remote control of an offline desktop Agent Host, arbitrary multi-file
  enrichment, or any browser/session automation beyond the bounded provider
  tools.

## Current evidence and important unknowns

- The repository already has a local Agent host, tool-calling model providers,
  bounded budgets, same-Run source handles, local `0600` journals, and cited
  company/market drafts.
- Company/market policy intentionally rejects person queries. That contract
  remains unchanged; person research needs a distinct definition and prompt.
- The current Agent provider input contract already supports images, but local
  public research does not pass an image manifest or image bytes to the model.
- The configured text model is not vision-capable. The same scoped Zhipu
  credential can use a separately pinned vision model; this does not admit the
  screenshot to canonical product evidence.
- TikHub exposes platform-specific public-profile search APIs. It does not
  provide a justified face-identity match for this product boundary.
- `dev:/agent-host` was documented but absent in Infisical. It has now been
  created and the two TikHub names were written without persistent `.env`
  export.
- TikHub liveness succeeds, but authenticated account readback returns HTTP
  `403` with the provider error `API token has expired`. The supplied token
  therefore cannot prove or serve live profile search and must be replaced.
- The current official TikHub docs confirm the implemented Douyin POST and
  TikTok, Weibo, and Threads GET profile-search paths and first-page parameters;
  the adapter allows the documented `.io` origin and the supplied healthy
  `.dev` origin while rejecting every other host.
- `glm-4.6v-flash` accepts the official image/tool-calling request shape, but
  the live synthetic probe currently returns HTTP `429` / model overloaded
  before the Agent can choose a tool. This is a retryable external capacity
  failure, not a successful end-to-end proof.
- A process-only OpenRouter vision fallback was also tested with the same
  synthetic fixture and unchanged zero-data-retention requirement. OpenRouter
  returned HTTP `404` because no endpoint matched that privacy policy. The
  implementation correctly recorded zero provider/tool calls and no external
  effects; the privacy requirement was not weakened to force a result.
- `TALENT_SIGNAL_ALLOW_SENSITIVE_AI_PROCESSING` remains false in Infisical.
  The synthetic probe used a process-only override; real candidate screenshots
  remain fail-closed until provider admission is explicitly approved.
- Relationship Ask's prior attachment path required a Person and relationship
  before upload, so an unknown screenshot could still stop at relationship
  recall. The product now routes exactly one unscoped PNG/JPEG/WebP directly to
  an account task before recall; no relationship, platform, tool, or candidate
  picker is involved.
- `dev` and `staging` now have separate `/agent-host` TikHub names. Both product
  feature flags remain false. The API and Agent Host share only a `0600` Unix
  socket volume, and the API environment does not contain the TikHub key.

## Chosen approach

```text
iOS Relationship Ask: one user-supplied screenshot + Send
        |
        v
authenticated API: account task + verified bytes/hash, raw image process-only
        |
        v
owner-only Unix socket (TikHub credential absent from API)
        |
        v
credential-isolated Agent Host; pinned vision Agent sees bounded tool manifest
        |
        +--> no visible identity clue -> structured no_action
        |
        +--> chooses TikHub platform profile search tool(s)
                         |
                         v
              normalized same-Run source handles
                         |
                         v
      possible/ambiguous cited Ask block + public links, authority=none
```

The ingress itself is the user's authorization for this one read-only Run. It
does not authorize a person binding or downstream write. A photo-only image
must abstain because appearance is not an authorized identity clue.

Rejected alternatives:

- relaxing `PUBLIC_RESEARCH_PERSON_QUERY_PROHIBITED`, because it would silently
  broaden a company/market capability and its existing authorizations;
- placing TikHub credentials or execution in the shared backend, Web bundle,
  or mobile client;
- returning one model-selected identity as confirmed;
- persisting the raw screenshot in the Agent journal for replay.

## Milestones

1. **Blocked externally — Secret and provider admission.** The manifest
   contract, strict TikHub base-URL/auth/timeout/response handling, secret-name
   injection check, and liveness probe are complete. Authenticated readback is
   blocked by the expired TikHub token; real-image processing also remains
   disabled by the sensitive-processing admission gate.
2. **Complete — Governed person research definition.** Added person-specific
   schemas, tool catalog entries, policy, runner, image manifest validation,
   same-Run citations, abstention, and draft-only semantics.
3. **Complete — Local host execution.** Added an image-first command, a
   vision-model selector, TikHub gateway, owner-only store, replay protection,
   and concise terminal output.
4. **Complete with external proof gaps — Proof and durable knowledge.** Agent
   and host typechecks/builds pass with deterministic focused tests; Infisical
   name injection and secret-contract checks pass.
   Deterministic end-to-end fixtures prove autonomous TikTok/Douyin tool
   selection, ambiguity, abstention, policy denial, replay, and credential/raw
   image isolation. Canonical integration/secret/Agent docs are updated. Live
   health succeeds, while authenticated TikHub and vision capacity checks fail
   closed as recorded above.
5. **Complete in code — Product ingress and return path.** Added a strict
   `person-research-service.v1` Unix-socket contract, process-only byte entry,
   owner-only service, API client, automatic single-image Ask invocation,
   public-source response references, iOS disclosure/rendering, a sidecar in
   development and TestFlight Compose, staging Infisical isolation, and
   deterministic socket/client/response tests. The container image builds and
   a real sidecar smoke test observes a `0600` socket. Full verification passes:
   48 Agent tests, 23 Agent Host tests, 210 backend tests, iOS Release build and
   focused decoder test, 18 secret tests, both Infisical contracts, Compose
   credential-isolation checks, and documentation/architecture gates. Live
   activation remains intentionally disabled pending milestone 1.
6. **Complete in code — Unknown-screenshot no-selection path.** Added the
   account-scoped `POST /v1/person-research/tasks` contract with strict base64,
   size and SHA-256 coherence, body/log redaction, stable Run identity,
   idempotent replay, metadata-only audit, and a `persisted:false`/zero-effect
   receipt. iOS routes one unscoped supported image directly to it before
   relationship recall, protects the unknown-outcome idempotency key, retains
   the raw image only on the current screen for retry, and stores only the
   normalized unconfirmed public result in the protected thirty-day Session.
   Backend typecheck and all 214 tests pass; the Debug simulator build and the
   three focused no-selection/receipt/recovery tests pass.

## Evidence-safety review

Reviewer: `evidence-safety-reviewer`

Verdict: `pass_with_changes` for the local implementation; do not enable real
candidate screenshots yet.

- Evidence integrity: screenshot artifact ID and hash, exact unreviewed search
  clue, provider request identity, normalized content hash, and same-Run source
  refs remain distinct. A result can only be `possible_match` or `ambiguous`,
  never confirmed identity.
- Privacy and purpose: raw image bytes remain process-local; local files are
  owner-only; no face recognition, reverse-face search, contact lookup,
  protected-trait inference, assessment, ranking, or private-session access is
  available to the tool manifest.
- Action safety: the Run has read-only provider authority. Artifacts declare
  `identityAuthority=unconfirmed`, `publicationAuthority=none`, and
  `externalEffectAuthority=none`; identity binding or downstream writes still
  require a separate human decision.
- Product ingress: an unscoped screenshot creates no candidate/relationship
  binding and its backend request body is redacted. Only its hash, size,
  media type, zero-retention receipt, and normalized public result can persist;
  protected Session deletion removes the device copy.
- Required changes before real use: replace the expired TikHub token, complete
  provider admission before setting the sensitive-processing gate to true,
  rerun a non-person synthetic end-to-end probe, and expose deletion/review of
  the local draft when a product ingress is added.

## Completion evidence

- `pnpm agent:person-research -- --image <synthetic screenshot>` requires no
  platform or candidate choice and produces either a cited draft or explicit
  `no_action`;
- a deterministic vision provider proves autonomous selection of at least two
  different TikHub platform tools from two screenshot fixtures;
- every draft claim cites a same-Run normalized provider observation and every
  possible identity stays unconfirmed;
- photo-only, same-name, hostile instruction, invalid MIME, oversized input,
  out-of-scope tool, provider error, over-budget, and replay-drift cases fail
  safely;
- the local state tree contains manifests, fingerprints, receipts, and drafts
  at mode `0600`, but no raw screenshot bytes or provider credential;
- the API, Web, and iOS process environments do not contain
  `TIKHUB_API_KEY`;
- one unscoped Relationship Ask image automatically crosses the authenticated
  API and typed socket boundaries and returns either unconfirmed clickable
  public sources, `no_action`, or a visible fail-closed recovery block without
  a relationship/platform/tool/candidate selection;
- `pnpm agent:check`, secret-contract tests, and `pnpm docs:check` pass.

## Reconsider when

- a provider can demonstrate a lawful, accurate, proportionate image-search
  capability that does not cross the face-recognition or sensitive-inference
  boundary;
- an accepted draft needs explicit publication into a Person/Pursuit, at which
  point identity review and a separate human confirmation remain mandatory.
