# Contact imports and multi-platform references

## Outcome

Make the Agent's `Sources & imports` page useful without turning it into a
connector marketplace. A user can keep several account-scoped profile
references, select a contacts CSV, LinkedIn `Connections.csv`, or vCard,
inspect what was parsed on device, resolve one person's identity, and make one
explicit canonical contact decision through the existing governed resource
intake.

This matters because a generic CRM needs a trustworthy way to bring existing
relationships in. A platform logo, URL, file selection, and live account grant
must not share the same ambiguous “connected” state.

## Boundaries

In scope:

- a quiet second-level Sources page; the Agent first level stays at four rows;
- account profile references for LinkedIn, GitHub, X, Instagram, Telegram,
  WhatsApp, WeChat, and a website, always labeled as references rather than
  authenticated connections;
- on-device parsing for CSV, LinkedIn connections CSV, and vCard;
- visible row validation, exact-within-file duplicates, unmapped field notice,
  source hash, raw-file discard semantics, and per-person review;
- exact Person create, source attach, or unresolved-identity decisions through
  the existing idempotent `resource-captures` contract;
- compact and accessibility-size iOS verification.

Out of scope:

- OAuth, background sync, address-book bulk read, LinkedIn scraping, ZIP
  extraction, or claiming any platform account is connected;
- silent batch creation or merge-on-name;
- importing arbitrary notes as confirmed Memory;
- new backend authority or an external Contacts/CRM write.

## Current evidence and unknowns

- `RelationshipAgentStudioView` already owns the correct four-row first level.
- Sources currently stores one local LinkedIn URL and labels file imports as
  planned.
- `PursuitWorkspaceStore` already exposes canonical handle search and an
  idempotent reviewed contact-source save with create, attach, and unresolved
  outcomes.
- The current API stores a reviewed contact source and one selected identity
  handle. Organization and title can remain visible source fields, but this
  slice must not present them as confirmed Person profile fields.
- The original checkout contains unrelated, uncommitted navigation and composer
  work. This plan is implemented in the isolated
  `codex/contact-import-sources` worktree.

## Chosen approach

Parse only after an intentional file choice and keep the raw bytes in memory
only for parsing. Read at most the parser limit plus one byte, then build a
bounded draft with a content hash, mapped fields,
row-level issues, and unmapped-column names. Each valid row opens the existing
identity semantics: current handles are selectable, historical handles are
comparison-only when a current owner exists, name-only matches require an
explicit decision, and no person is preselected.

A confirmed row uses a stable key derived from source hash and row number. The
backend remains the authority for the Person, relationship context, resource,
identity case, and receipt. The UI verifies that returned identity state matches
the chosen operation before it reports success.

Profile references use typed platform/value records in an account-scoped local
preference. They are editable and removable and never carry read, sync, or
write capability.

Rejected alternatives:

- a broad logo grid, because it hides capability differences and implies
  integrations that do not exist;
- immediate bulk import, because the existing API has no atomic batch manifest
  or durable partial-retry receipt;
- device Contacts permission first, because a selected vCard proves the import
  loop with less ambient access;
- local-only success, because parsing is not evidence that canonical CRM state
  changed.

## Milestones

1. **Complete — Domain contract and parsing**
   Add typed source references, bounded CSV/vCard parsing, deterministic row
   identity, validation, duplicate detection, and unit tests.
2. **Complete — Sources and import review UI**
   Replace the single LinkedIn field and planned rows with focused import and
   reference flows while preserving the four-row Agent home.
3. **Complete — Governed contact decision**
   Reuse canonical identity lookup and resource intake for one reviewed row,
   including create, attach, unresolved, retry, and truthful receipt states.
4. **Active — Verification and delivery**
   Run focused unit/UI/build checks, capture compact and accessibility renders,
   review safety and UX against `REVIEW.md`, run docs checks, then commit, open
   and merge a PR, release to TestFlight, and verify processed build provenance.

## Completion evidence

- parser tests cover quoted rows, LinkedIn headers, vCard, missing names,
  duplicate rows, alternate encodings, empty input, and size/row limits;
- UI tests prove references remain `Link only`, file selection does not imply a
  write, identity review has no default target, and preview mode cannot commit;
- a canonical fixture proves create/attach/unresolved outcomes return matching
  source receipts under stable idempotency;
- compact English and AX5 Chinese Simulator screenshots remain legible;
- `pnpm docs:check`, iOS localization, focused iOS tests, and an iOS build pass;
- merged commit and processed TestFlight build resolve to the same source.

## Verification log

- `AgentSourceImportTests`: 16 passed, covering scoped reference storage,
  platform URL validation, LinkedIn/Google/Outlook/Chinese/vCard parsing,
  quote handling, duplicate precision, invalid fields, unsafe encoding, and
  byte/field/column/row limits.
- `AgentSourceImportUITests`: the import summary, unmapped-column disclosure,
  blocked rows, raw-file non-retention state, no-default identity decision, and
  preview write boundary passed on an iPhone 17 Pro Max Simulator.
- Existing compact Agent navigation and Chinese AX5 Sources tests passed in the
  preceding focused run. Rendered English import/review states and Chinese AX5
  Sources remained legible under direct screenshot inspection.
- `pnpm docs:check`, `pnpm ios:localization:check`, JSON parsing, and
  `git diff --check` pass before branch synchronization.

## Decisions that would change direction

- A supported server-side batch manifest/commit contract would allow selected
  rows to be approved and reconciled as one import without weakening identity
  review.
- A product-justified Google or Microsoft grant with revocation and last-read
  semantics would add an actual `connected_read` source; it would not reuse a
  profile-reference state.
- Licensed LinkedIn member/network access would require a new official adapter;
  it would not authorize scraping or retroactively turn exported files into
  live sync.
