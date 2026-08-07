# Multichannel person compilation

Status: in progress
Owner: Codex
Started: 2026-08-06

## Outcome

A recruiter can intentionally submit relevant information through Chat, Web
upload, mobile share, or browser capture; bind every source to one stable person
and one purpose-scoped relationship context; review material identity and fact
changes; and receive a compact, source-linked, temporally correct person Wiki
and pre-contact brief that can be recompiled after correction, expiry,
permission change, or deletion.

The complete loop must create less reconstruction and reconciliation work than
the recruiter's current fallback. It must not claim comprehensive psychological
understanding, silently merge identities, flatten contexts, or treat generated
Wiki prose as truth.

## User-visible completion evidence

The same person can receive, at minimum:

- a recruiter-authored Chat note;
- a conversation screenshot;
- a resume or document;
- one explicitly supplied public URL;
- one browser or mobile share capture.

The user can then:

1. see why each input was matched to the person;
2. correct a wrong or ambiguous match before active state changes;
3. choose or create the applicable relationship context;
4. inspect exact evidence for every material proposed update;
5. confirm, edit, dismiss, or leave each proposal unresolved;
6. see conflicts, expiry, and supersession rather than a silent overwrite;
7. open one compiled person page with addressable Wiki blocks;
8. ask Chat a pre-contact question and receive a task-scoped brief with
   citations;
9. delete one source and observe every dependent Wiki block, search entry,
   cached brief, and Agent snapshot retract or recompile;
10. resume the review after interruption without reconstructing prior work.

External writes remain independently previewed, approved, executed, and
observed. This plan does not grant autonomous messaging, calendar, contact,
ATS, or CRM writes.

## Current evidence

The repository already proves a narrow screenshot-to-context slice:

- the contract represents bound, ambiguous, and unbound capture identity;
- screenshot text becomes evidence and proposed assertions rather than active
  state;
- confirmed states are temporal and source linked;
- internal action approval and effect observation are separate;
- retention receipts and deletion lineage exist;
- Web walkthrough evidence covers review, confirmation, simulated action,
  reload continuity, and deletion.

The current implementation now proves a broader local vertical slice:

- note, screenshot, resume/document, explicit URL, browser-share, mobile-share,
  and contact-record envelopes converge on one governed person and relationship
  context; typed fragments retain message, page, region, URL, note-revision,
  and contact-field locations;
- Web supports intentional note, file, link, and screenshot intake, while
  browser/mobile envelopes and identity hints are accepted by the shared
  intake contract; recruiter-confirmed email, phone, WeChat, and profile clues
  are normalized for matching, stored as a hash plus masked source-linked hint,
  and never returned as raw directory data;
- reviewed resume, document, contact-record, and public-page fragments now
  produce conservative atomic fact proposals for explicit recruiter-relevant
  fields rather than a source-level summary only;
- each resource claim retains the exact evidence fragment, quote, producer,
  review status, temporal relation, and possible supersession target;
- the Web source ledger exposes pending and conflicting claim counts, while the
  detail surface shows `before → proposed`, exact evidence, an editable final
  value, and separate confirm, dismiss, and leave-unresolved decisions;
- Wiki compiler `0.4.0` emits confirmed temporal facts, ordinary open
  questions, explicit conflicts, professional history, governed source
  projections, bounded research, and one `no_action` or supported action;
- Wiki quality is derived from observable identity, provenance, authorization,
  temporal-state, review-coverage, deletion-lineage, bounded-content, and
  prohibited-inference checks; the compiler abstains instead of publishing
  when a required gate fails;
- Chat emits fact-review and conflict-review blocks pinned to an immutable Wiki
  and Context Manifest;
- the Web workspace now keeps a relationship-scoped Agent beside the living
  person page; the Agent can create a person from an explicit context and first
  governed source, open source intake, navigate to staged page changes, and
  compile cited briefs without becoming the record or bypassing review;
- Agent contact intake now narrows possible people by account-scoped name
  before creation, fails closed when lookup is unavailable, requires an
  explicit different-person decision for an exact name match, and can attach
  the source to an existing relationship or add a separate relationship to the
  same stable person;
- Agent contact intake now also accepts one optional identity clue, explains
  name-only versus confirmed-handle match reasons, ranks confirmed-handle
  owners first, and blocks a second identity even when the entered name is
  unrelated; the recruiter must explicitly confirm before a clue becomes a
  governed contact-record source;
- when two account-scoped people remain plausible, the Agent can now save the
  governed source as a durable unresolved identity case without adding it to
  either person's Wiki; the review restores after reload with the exact source
  excerpt, candidate relationship and source counts, prior decision rationale,
  and explicit person plus relationship selection;
- a real same-name collision replay preserves `leave_unresolved` and later
  `bind_existing` decisions with optimistic case versions, binds the source
  only after the recruiter's rationale, and publishes a gold Wiki snapshot
  containing source and relationship dependencies while the unselected person
  retains zero dependencies on that source; the proof is recorded in
  `docs/evaluations/2026-08-07-ambiguous-identity-review-runtime-proof.json`;
- the relationship-scoped Agent now exposes a quiet, reloadable operation
  history projected from canonical audit, correction, deletion, resource, and
  Wiki records; a real same-name replay moves the governed source, recompiles
  both affected relationships, preserves scope-specific rationale, deletes the
  source lineage, and publishes a replacement gold Wiki with zero dependencies
  on deleted sources; the proof is recorded in
  `docs/evaluations/2026-08-07-durable-agent-history-correction-deletion-runtime-proof.json`;
- source authorization is now independent from raw-asset retention; a
  recruiter can revoke one source from relationship memory without deleting
  it, which retracts dependent confirmed state, claims, actions, approvals,
  Wiki snapshots, and Chat manifests before recompiling from authorized
  sources that remain;
- restoring source authorization returns fragments and claims to review while
  confirmed state, approvals, and actions remain withdrawn; legacy
  message-backed and exact fragment-backed claims share the same transition,
  and the Web source detail redacts evidence while revoked;
- a real API, browser, and database replay proves surviving-source
  recompilation, zero revoked-source dependencies, redacted resource detail,
  confirmed-state and approved-action retraction, stale-version rejection,
  idempotent retry, durable Agent history, and review-only restore; the proof
  is recorded in
  `docs/evaluations/2026-08-07-source-authorization-runtime-proof.json`;
- evidence authorization now has its own optional deadline, independent from
  raw-source retention; use-time gates make elapsed evidence unavailable to
  resources, Wiki, Chat, research, claim decisions, proposal creation,
  identity matching, and derived-source intake before the periodic transition
  runs;
- the idempotent system transition records no recruiter actor, retracts
  dependent state and future authority, invalidates Wiki and Chat context, and
  automatically recompiles from surviving authorized evidence; renewal can
  set a new deadline but returns fragments and claims to review without
  reviving facts, approvals, or actions;
- a real two-account runtime replay proves use-time blocking before the
  sweep, system-attributed expiration, confirmed-state retraction, zero
  expired-source dependencies in the replacement Wiki, review-only renewal,
  direct renewal from an effective expired UI state, and cross-account denial;
  the proof is recorded in
  `docs/evaluations/2026-08-07-source-authorization-expiry-runtime-proof.json`;
- a completed, independently observed simulated effect now survives source
  expiry as an immutable outcome while future authority is removed; the
  expiry response and relationship Agent history expose one recruiter
  follow-up without claiming the external effect was reversed; the proof is
  recorded in
  `docs/evaluations/2026-08-07-source-authorization-completed-effect-runtime-proof.json`;
- the relationship Agent now keeps preserved-effect history compact and links
  to one structured living-page review that distinguishes unresolved and
  verified results, ranks the unresolved result first, exposes exact
  destination and observation evidence, and offers no retry or external-write
  control; direct desktop, 390-pixel, light, and dark browser review found and
  corrected a mobile expanded-history overflow while preserving the Chat
  composer, with the panel recorded in
  `docs/evaluations/2026-08-07-source-authorization-mixed-effect-responsive-review.json`;
- bounded public-link research now persists the approved request and task
  before retrieval, leases recoverable work, reclaims interrupted work after
  process loss, and reuses a page source already committed before the
  interruption instead of creating duplicate evidence;
- visible prompt-like instructions remain inert proposed page evidence,
  executable and cross-domain links are excluded, a failed same-domain page
  preserves useful partial results with page-level warnings, and stale page
  text is excluded from Wiki and Chat in favor of an explicit refresh state;
- reopening the seed source restores the latest durable task, distinguishes
  running, completed, partial, and failed states, and labels retrieval warnings
  as operational evidence rather than claims about the person; direct desktop
  and 390-pixel light/dark review found no horizontal overflow, with the
  restart replay recorded in
  `docs/evaluations/2026-08-07-bounded-research-recovery-runtime-proof.json`
  and the panel in
  `docs/evaluations/2026-08-07-bounded-research-recovery-retest.json`;
- explicit person-merge contracts now require a source person, retained target
  person, current versioned preview digest, visible label/handle/fact review
  items, and a recruiter reason; pending identity cases and executing or
  unknown external effects block the operation;
- a local runtime replay preserves two relationship-context IDs rather than
  flattening them, rebinds three sources, hides the merged alias from the active
  directory, recompiles both moved relationships to gold, rejects a stale
  preview, denies a second account, and reverses context, capture, fact,
  handle, and research ownership; the proof is recorded in
  `docs/evaluations/2026-08-07-reversible-person-merge-runtime-proof.json`;
- the relationship Agent can now open a real duplicate-person review from Chat;
  the Web names the page to fold in and the page to retain, searches the full
  account-scoped directory, exposes contexts, governed-source counts, masked
  handle and label differences, blockers, reason, and explicit confirmation,
  then returns a reversible operation receipt rather than an opaque success;
- merge and reversal now invalidate and recompile every active relationship
  Wiki on both affected people, project durable audit history, and redirect an
  old merged-person bookmark to the retained person without losing the moved
  relationship-context ID; one real browser and database replay merged three
  sources across two relationships, compiled three of three Wikis, redirected
  the old URL, reversed ownership, compiled three of three Wikis again, and
  restored both active people; the runtime proof and skill panel are recorded
  in `docs/evaluations/2026-08-07-person-merge-web-runtime-proof.json` and
  `docs/evaluations/2026-08-07-person-merge-web-final-panel.json`;
- an applied merge is now actionable after reload from durable relationship
  Agent history, but history opens a fresh eligibility review rather than
  replaying an old undo; current identity, context ownership, and post-merge
  dependencies are recomputed, a new governed source blocks both Web and API
  reversal, dependency removal restores eligibility, and a successful reversal
  navigates the open relationship to its restored person while refreshing
  history; the API and authenticated browser proof is recorded in
  `docs/evaluations/2026-08-07-person-merge-day-later-reversal-runtime-proof.json`;
- a real browser and database replay preserves one synthetic person across
  three relationship contexts and six governed sources, with distinct
  completed receipts for relationship reuse versus relationship creation and
  a confirmed email clue that survives reload without exposing the raw value;
  the proof is recorded in
  `docs/evaluations/2026-08-07-confirmed-handle-convergence-runtime-proof.json`;
- identity handles now have independent freshness deadlines and durable
  confirmed, expired, and reconfirmed lifecycle events; an authorized but
  expired clue remains a masked historical match only, cannot auto-bind a new
  source, and requires a fresh governed source plus explicit recruiter binding
  before it becomes current again;
- a real Web-to-iOS-share runtime replay proves confirmed-before-expiry search,
  review-only matching after expiry, zero automatic binding, explicit
  same-person reconfirmation, cross-account isolation, raw-value minimization,
  durable Agent history, one stable person and relationship, and a Gold Wiki;
  the Web proof also changes the selected-existing operation from creating a
  contact to attaching a source. The runtime and independent recruiter/safety
  adjudication are recorded in
  `docs/evaluations/2026-08-07-identity-handle-freshness-runtime-proof.json`
  and
  `docs/evaluations/2026-08-07-identity-handle-freshness-final-panel.json`;
- a two-owner recycled-phone replay now preserves expired historical owner A
  and fresh current owner B, orders B before A with visible temporal reasons,
  blocks a fresh-source binding to A while B is current, and proves that
  correction and deletion retract only source-supported authority without
  silently restoring A; both distinct relationship Wikis remain Gold, the raw
  phone is absent from identity and audit projections, and cross-account search
  returns zero results;
- that pressure test detected a real candidate-order regression: evidence rank
  correctly selected the current owner first, but a later UUID sort had erased
  the order. The sort was removed, a regression assertion was added, and the
  runtime proof plus independent recruiter/safety adjudication are frozen in
  `docs/evaluations/2026-08-07-recycled-identity-handle-runtime-proof.json`
  and
  `docs/evaluations/2026-08-07-recycled-identity-handle-final-panel.json`;
- native iOS Photos intake and an App Shortcut adapter now converge on one
  recoverable capture review; on-device recognition remains editable, speaker
  attribution remains unknown, the original image stays device-owned, and
  only recruiter-reviewed text plus governed source metadata reaches the local
  backend;
- direct Simulator and backend proof now covers the same two-owner temporal
  decision on iOS: no preselection, current owner enabled, historical owner
  visible but protected, explicit current binding, one published Gold Wiki,
  zero duplicate contact, and zero external writes; unit evidence also covers
  reviewed-draft restore, unresolved completion, and compilation retry without
  repeating identity authority, while AX5 dark-mode inspection preserves the
  decision order. The proof and adjudication are recorded in
  `docs/evaluations/2026-08-07-ios-share-identity-wiki-runtime-proof.json` and
  `docs/evaluations/2026-08-07-ios-share-identity-wiki-final-panel.json`;
- identity review intervals now come from a dated, versioned policy rather than
  unversioned code constants; each handle and lifecycle event snapshots the
  policy, exact deadline, default or human-override basis, and override reason;
  unexplained overrides fail closed, while Agent history explains accepted
  overrides without exposing the raw identifier;
- a real database replay applies v1 defaults and an explained override, then
  activates a synthetic v2 inside a rolled-back transaction: only the new clue
  receives v2, both v1 deadlines remain byte-for-byte unchanged, published
  policy content and deletion are blocked, and effective intervals cannot
  overlap. Runtime proof and independent recruiter/safety adjudication are in
  `docs/evaluations/2026-08-07-identity-freshness-policy-runtime-proof.json`
  and
  `docs/evaluations/2026-08-07-identity-freshness-policy-final-panel.json`;
- source deletion retracts the superseding fact and every dependent Wiki/Chat
  artifact; a still-supported prior value becomes `contested` for review
  instead of being silently restored as current;
- a real runtime replay is recorded in
  `docs/evaluations/2026-08-06-atomic-resource-claim-runtime-proof.json`;
- desktop, 390-pixel mobile, light, and dark browser walkthroughs prove the
  conflict card, exact evidence, decision controls, labeled missing-photo
  fallback, and no mobile horizontal overflow.
- direct Web route tests prove cross-origin, malformed identifier/body,
  content-type, stale-version, and repeated-idempotency-key handling for the
  atomic fact decision boundary.

The target remains incomplete because field calibration of v1 freshness
intervals, simultaneous identity confirmation, physical-device Shortcuts and
assistive-technology proof, multi-item mobile intake, and recruiter field
comparison are not yet proven. Current evidence remains local and synthetic,
not adoption or commercial evidence from working recruiters.

The earlier complete-target baseline remains recorded in
`docs/evaluations/2026-08-06-multichannel-person-compilation-recruiter-review.json`.
The now-executable atomic compilation slice is adjudicated separately in
`docs/evaluations/2026-08-06-atomic-resource-claim-final-panel.json`: both the
recruiter-workflow and evidence-safety lenses score it 3/4 with no veto. That
does not raise the unfinished production multichannel target to a pass.

## Product thesis

Chat is the primary intent and task surface. It is not the source of truth.

The product core is a governed relationship-resource system:

```text
intent and source
→ resource receipt
→ evidence reconstruction
→ identity and context resolution
→ proposed assertions and conflicts
→ recruiter decisions
→ temporal relationship state
→ versioned Wiki compilation
→ task-scoped Chat brief
→ approved action or no_action
→ observed outcome
```

The stable entity is `Person`. The working entity is
`Person × RelationshipContext`. Imported sources, facts, Wiki pages, cards,
lists, timelines, Chat answers, and research briefs are resources or
projections around that entity.

## Value model

### User value

- reduce time spent reconstructing the last meaningful conversation;
- reduce missed commitments, constraints, deadlines, and client dependencies;
- reduce duplicate note taking across chat, files, ATS, and memory;
- preserve relationship context across interruptions and long gaps;
- provide one smaller, better-supported next action or an intentional
  `no_action`.

### Product value

- one governed person memory works across Chat, mobile, Web, browser capture,
  and future connectors;
- user corrections and observed outcomes improve compilation and retrieval
  evaluation without converting people into scores;
- longitudinal, source-linked state is harder to replace than one-off
  summarization;
- the same resource and authority model supports recruiter, candidate, client,
  referrer, founder, and buyer contexts without building separate CRMs.

### Commercial value

Commercial proof must come from repeated workflow use, not the number of
generated profiles.

Candidate pricing hypotheses:

- individual subscription for governed capture, recall, and pre-contact briefs;
- boutique-team subscription for shared contexts, permissions, audit, and
  handoff;
- metered research allowance for costly public-source investigation;
- later workflow connectors only after the core loop reduces measurable
  reconstruction or missed timing.

Do not charge or optimize by inferred person quality, outreach volume, or
number of automated messages.

### Technical value

- one provider-neutral evidence and identity contract isolates surfaces and
  model vendors;
- immutable source, fact, and Wiki snapshots make runs replayable and
  debuggable;
- registered derivation edges make deletion and correction testable;
- task-scoped context assembly reduces token cost and cross-context leakage;
- structured evaluation cases become a reusable quality moat for identity,
  provenance, conflict, freshness, and action usefulness.

## Architecture

### 1. Surface and intake layer

Supported intake adapters converge on one `CaptureIntent`:

- Chat text or personal note;
- Web screenshot upload;
- resume or document upload;
- explicit URL submission;
- browser extension capture;
- iOS share extension;
- later authorized email, calendar, ATS, or CRM import.

Each adapter supplies:

- actor and account;
- purpose and relationship context, when known;
- source kind and channel;
- capture time and timezone;
- retention request;
- client-generated idempotency key;
- optional candidate identity hints;
- one or more resource descriptors.

No adapter confirms identity or facts.

### 2. Resource and evidence layer

Add a general resource envelope rather than overloading message-shaped
evidence:

```text
source_resource
  id, account_id, capture_id, kind, media_type, display_name
  content_hash, source_locator, observed_at, retention_scope
  processing_state, sensitivity, created_by

evidence_fragment
  id, resource_id, sequence, fragment_kind
  text, content_hash, locator_json
  attributed_actor, attribution_status
  parser_name, parser_version, created_at
```

`locator_json` is typed by source:

- screenshot: bounding box, image dimensions, message side;
- transcript: message and speaker;
- resume/document: page, paragraph, table cell, bounding box;
- URL: canonical URL, retrieval snapshot, selector or text range;
- personal note: note revision and author;
- contact import: source field and source record version.

Raw private assets remain separate from normalized evidence. General job queues
carry identifiers rather than private payloads.

### 3. Stable person identity

Treat the existing `subjects` table as the stable person record during
migration. Do not derive its external reference from an assignment.

Add:

```text
identity_handle
  person_id, handle_type, normalized_value_hash
  masked_display_hint, status, source_resource_id
  valid_from, valid_until, confirmed_by, version

identity_handle_lifecycle_event
  identity_handle_id, person_id, source_resource_id
  event_type, prior_status, status, actor_kind
  valid_from, valid_until, reason

identity_resolution_case
  capture_id, status, candidate_person_ids
  match_reasons, ambiguity_reasons, decision_id
```

Hard rules:

- deterministic exact handles narrow candidates before model comparison;
- a current confirmed handle may narrow identity, while an expired handle can
  only suggest a review candidate;
- source authorization and identity-handle freshness are enforced as separate
  use-time conditions;
- reconfirmation requires a fresh governed source and explicit human binding;
- name alone never silently merges two people;
- assignment or role never creates a new person when an existing identity is
  confirmed;
- a person can own many relationship contexts;
- identity sharing does not widen context evidence access;
- merge and split are reversible, versioned operations with derivative
  recompilation.

### 4. Relationship and temporal state

Evolve `assignments` into the relationship-context boundary while preserving
existing APIs during migration.

Every confirmed fact remains:

- person scoped;
- relationship-context scoped when material;
- purpose and authorization scoped;
- valid-time and system-time aware;
- supported by one or more evidence fragments;
- correctable, contestable, expirable, supersedable, and deletable.

No model output writes `confirmed_states` directly.

### 5. Public-link research

Resume and document parsing may discover URLs, but discovery does not authorize
research.

The user or policy must approve a bounded `ResearchTask` containing:

- person and relationship context;
- purpose;
- explicit seed URLs;
- allowed domains;
- maximum link depth and page budget;
- public-only and authentication restrictions;
- freshness horizon;
- data and retention scope;
- completion and stop conditions.

Research content is untrusted. It cannot change policy, follow embedded
instructions, access authenticated pages, or broaden scope.

Research produces immutable `ResearchSnapshot` resources and proposed
assertions with exact URL, retrieved time, excerpt, and content identity.
Capability or personality judgments are prohibited.

### 6. Wiki compilation

The Agent Wiki is a versioned semantic compilation, not a generated biography.

Add:

```text
knowledge_snapshot
  id, person_id, context_id, source_state_cursor
  compiler_version, policy_version, status, compiled_at

knowledge_block
  id, snapshot_id, block_key, block_type, status
  structured_content, valid_from, valid_until
  sensitivity, freshness_until, semantic_hash

knowledge_dependency
  block_id, dependency_type, dependency_id
  inclusion_reason, authorization_scope

context_manifest
  task_id, knowledge_snapshot_id, included_block_ids
  evidence_fragment_ids, inclusion_reasons, policy_version
```

Compilation stages:

1. authorize one person, context, purpose, and task;
2. load current confirmed state and explicitly labeled unresolved conflicts;
3. select fresh research and relevant history;
4. produce typed block candidates with exact dependency references;
5. validate identity, context, time, sensitivity, source support, and
   prohibited inference;
6. compare against the prior snapshot and make changes visible;
7. publish a new immutable snapshot or abstain with a partial review draft;
8. register every derivative for invalidation and deletion.

Canonical block families:

- identity and active context;
- current dependency;
- confirmed decision drivers and constraints;
- commitments and deadlines;
- recent meaningful changes;
- unresolved questions and conflicts;
- professional history;
- sourced research with freshness;
- relationship history and observed outcomes;
- one action proposal or `no_action`.

### 7. Chat context assembly

Chat requests compile context progressively:

```text
workspace/person map
→ active relationship context
→ compact Wiki summary
→ task-relevant blocks
→ supporting fact versions
→ exact evidence only when needed
```

Every Chat turn records:

- immutable user objective;
- selected person and context;
- authorization and retention scope;
- knowledge snapshot;
- included blocks and evidence;
- model, prompt, policy, and tool versions;
- generated answer blocks and citations.

Chat returns a typed union rather than unstructured prose only:

- direct answer;
- person brief;
- source receipt;
- identity-review request;
- fact-review request;
- conflict or clarification request;
- research progress and artifact;
- action proposal;
- no-action result;
- failure or recovery state.

### 8. Effect boundary

Fact confirmation, action approval, and outcome verification remain separate.
Compilation and Chat answers never acquire execution authority.

## Compilation quality contract

“Perfect” is not a model self-rating. It is a release gate over observable
properties.

Every compiled block is evaluated on:

- identity correctness;
- source support and exact provenance;
- relationship-context authorization;
- temporal correctness and freshness;
- contradiction and supersession handling;
- task relevance;
- compression without material omission;
- uncertainty and abstention behavior;
- deletion and recompilation correctness;
- recruiter correction burden.

Identity, provenance, authorization, prohibited-inference, and deletion gates
are pass/fail. A high average cannot override one failure.

Gold compilation requires:

- all material claims trace to authorized evidence or confirmed state;
- no unresolved identity, context, speaker, or temporal ambiguity is presented
  as confirmed;
- conflicts and expired facts remain visible;
- no prohibited person judgment appears;
- the brief exposes one current dependency and one action or `no_action`;
- a recruiter can correct a seeded material error;
- deleting a source retracts every dependent claim;
- a task-scoped answer uses the intended immutable snapshot.

## Evaluation suite

### Identity cases

- one known person, same phone/email, new assignment;
- same name, two different people;
- changed employer and changed title;
- forwarded resume with third-party contact details;
- screenshot nickname that matches more than one person;
- incorrect prior merge followed by split and recompile.

### Source cases

- screenshot with speaker-side inversion;
- resume with tables, two columns, and conflicting dates;
- document with one relevant and four irrelevant links;
- URL containing prompt-injection instructions;
- stale public profile contradicting a recent confirmed conversation;
- personal note that must remain attributed to the recruiter;
- duplicate upload with the same content hash;
- source deletion after Wiki and Chat use.

### Workflow cases

- no actionable signal;
- explicit deadline and one client-controlled dependency;
- contradictory or retracted statement;
- interrupted review resumed after a day;
- research failure with a useful partial artifact;
- stale recommendation after external state changes;
- duplicate action and failed write retry.

## Success measures

Product and commercial claims remain hypotheses until measured.

Activation:

- time from first intentional input to first reviewed person brief;
- percentage of first inputs correctly bound without a harmful silent merge;
- percentage of users who return to the same person after a later interaction.

Ongoing value:

- median pre-contact reconstruction time versus the recruiter's fallback;
- missed or stale commitment rate;
- percentage of briefs that change the user's next real action;
- confirmed `no_action` rate;
- correction, dismissal, and conflict-resolution burden;
- weekly reuse of prior confirmed context.

Trust and technical quality:

- seeded identity and evidence error detection;
- unsupported-claim and cross-context leakage rate;
- stale research surfaced as stale;
- deletion propagation completion and latency;
- retry and duplicate-write safety;
- cost and latency per reviewed useful state change, not per model call.

Commercial:

- retained weekly users who recover context before a real conversation;
- willingness to pay after a concierge comparison;
- gross margin after extraction and research costs;
- team expansion driven by handoff and continuity, not seat pressure alone.

## Recruiter workflow review gate

Freeze this reference scenario:

- independent recruiter with 8 active searches on desktop Web;
- five minutes before a candidate call;
- the candidate has one screenshot, one updated resume, a personal note, and
  two public links;
- one resume date conflicts with prior confirmed state;
- the recruiter needs the smallest safe preparation brief;
- success means resolving the conflict or abstaining, remembering the current
  dependency, and proposing one useful question in less work than searching
  chat, files, and notes manually.

Walk:

`capture → identify → inspect evidence → correct → confirm state → compile
→ ask Chat → choose action → preview write → execute → verify → recover`

The release cannot score above 2 while the flow is only a mockup or local
synthetic path. It cannot pass until all material rubric dimensions are at
least 3 with executable evidence.

## Milestones

### M0 — Baseline and contract

- [x] Record current implementation evidence and gaps.
- [x] Freeze multichannel source, identity, Wiki, and Chat contracts.
- [x] Add deterministic contract and compilation-publication tests.
- [x] Preserve the existing screenshot vertical slice.

### M1 — Stable identity across contexts

- [x] Stop deriving Web screenshot person identity from assignment.
- [x] Add identity-handle and resolution-case contracts, persistence schema,
      and deterministic candidate resolution.
- [x] Connect identity handles and resolution cases to repository services and
      intake routes.
- [x] Prove source-linked confirmed-handle lookup, raw-value minimization,
      wrong-name convergence, duplicate prevention, and reload persistence in
      the Agent contact flow.
- [x] Bind two sources from different channels to one person and two contexts.
- [x] Prove ambiguous review, wrong-person source correction, relationship
      split, and recompilation.
- [x] Prove an explicit identity merge with conflict review, day-later
      eligibility recomputation, blocked recovery, and reversal.
- [x] Prove independent handle expiry, review-only historical matching,
      fresh-source reconfirmation, privacy-safe lifecycle history, account
      isolation, and Gold Wiki convergence.

### M2 — General resource intake

- [x] Add personal note, resume/document, URL, browser share, and mobile share
      source-envelope contracts and persistence.
- [x] Add typed evidence-locator contracts and persistence for message, page,
      region, URL, note revision, and contact field.
- [x] Implement Web intake adapters and parsers for note, screenshot,
      resume/document, and explicit URL sources.
- [x] Add deduplication, retention, retry, deletion, and persisted review
      recovery for the local resource loop.

### M3 — Governed research

- [x] Discover links without automatically visiting them.
- [x] Add bounded research task approval and public-source snapshots.
- [x] Test prompt injection, irrelevant links, stale pages, and partial failure.

### M4 — Wiki compiler

- [x] Add immutable snapshot, block, dependency, and manifest contracts and
      persistence.
- [x] Implement bounded screenshot/transcript compiler, publication, read, and
      source-deletion retraction services.
- [x] Generalize compilation and invalidation across manual source
      authorization changes.
- [x] Generalize compilation and invalidation across authorization expiry.
- [x] Generalize compilation and invalidation across running recovery,
      successful or partial completion, and stale research projection.
- [x] Compile confirmed state, conflict, research, history, and `no_action`.
- [x] Prove identity correction and source-deletion recompilation.
- [x] Prove manual permission-change recompilation and review-only restore.
- [x] Prove authorization expiry; keep raw-asset retention expiry as a
      separate lifecycle that does not silently revoke reviewed evidence.
- [x] Persist authorization recompilation jobs transactionally, reclaim
      expired worker leases after restart, and prove idempotent recovery.
- [x] Project exact preserved external effects by action, destination,
      attempt, observation, and outcome; prove completed and unknown states
      remain distinct after authorization expiry.
- [x] Keep preserved-effect history compact in Chat and directly review the
      unresolved-first structured projection at desktop and narrow responsive
      widths, including long destination keys and dark mode.

### M5 — Chat-first Web

- [x] Make Chat the default intent surface.
- [x] Keep active person and relationship context visibly scoped.
- [x] Add task-scoped Chat context assembly and typed person-brief,
      action-proposal, conflict-review, and no-action response contracts.
- [x] Render typed review, research, brief, action, and recovery blocks in Web.
- [ ] Add the secondary people library without CRM dashboard sprawl.

### M6 — Outcome and commercial proof

- [x] Connect one exact approved effect and independently observe it.
- [ ] Run the frozen recruiter workflow and ambiguity matrix.
- [ ] Conduct field comparison with independent recruiters.
- [ ] Measure preparation time, correction burden, changed-next-action rate,
      retention, model cost, and willingness to pay.

## Completion standard

This plan is complete only when:

- all five required source types converge on one stable person resource;
- cross-context evidence isolation and same-person reuse are both executable;
- the Wiki compiler passes the gold quality gates and deletion replay;
- Chat answers pin and expose the correct knowledge snapshot;
- the recruiter workflow review passes with direct evidence and no veto;
- a field comparison supports the claimed user and commercial value;
- current repository tests, type checks, builds, documentation checks, and
  relevant multi-surface walkthroughs pass.
