# Web reconstruction and macOS Hybrid App

## Outcome

Talent Signal should become one quiet, resumable relationship workspace on the
Web, then prove that the same client experience can run inside a least-privilege
macOS shell without weakening the existing native safety boundaries.

The first production outcome is deliberately narrow:

> A recruiter can start without selecting a person, recover the exact canonical
> Session after interruption, explicitly move into the correct Person and
> Relationship Context, inspect message-level evidence, review a proposed
> change, and read back the real server receipt without losing the Session.

The fixed handoff at
`talent-signal-design-handoff@2d1af8983d23fb584d4086bfa894bcb9b5fa706a`
is input to this work, not an accepted product specification. Its human labels
remain exactly `12 revise / 2 agree / 16 pending`; all production results begin
as `not_run`.

## Execution status — 2026-09-16

- M0: comparable Direction A/B evidence delivered; Direction A is the
  implementation champion and human acceptance remains `not_reviewed`.
- M1: the primary real boundary is implemented and browser-verified for
  unscoped create, canonical draft recovery, conflict preservation, explicit
  Person selection, message-level evidence, stale-review rejection, current
  fact-decision receipt readback, and return to the exact Session. TS-006,
  TS-011, and TS-024 are `passed`; unpromoted exceptional cases remain
  `not_run` in the matrix even where unit or route tests exist.
- M2–M4: not yet delivered. Their implementation continues from this plan; the
  native SwiftUI app remains the rollback host.

## Boundaries

In scope:

- inventory and route migration map for the current Web workspace;
- a real Session directory and recovery flow backed by `/v1/agent-sessions`;
- explicit Person and Relationship Context handoff into the existing governed
  evidence and review surfaces;
- durable drafts, optimistic concurrency, expiry, retry, and tombstone states;
- remaining Web pages and failure states after the first vertical slice;
- an isolated Tauri feasibility shell that consumes real shared client UI;
- allowlisted native capabilities with typed payloads, cancellation, bounds,
  account checks, and receipt readback;
- executable tests and versioned synthetic evidence for every claimed result.

Out of scope without a later explicit decision:

- production deployment, live connector writes, or publication of private data;
- replacing PostgreSQL/backend canonical truth with browser or shell state;
- treating selected time as calendar approval or confirmed fact as external
  effect approval;
- remote privileged Web wrapping, arbitrary shell/filesystem/network IPC, or
  silent OCR cloud fallback;
- removing the current SwiftUI app before the Hybrid feasibility gates pass;
- calling the handoff design accepted before a human review.

## Verified baselines

- Implementation branch: `codex/web-macos-hybrid-handoff`.
- Implementation base: `origin/main@46c57e71153e301d8eee5942f3dec1ae6dbf6877`.
- Fixed design reference clone:
  `/Users/cubxxw/data/talent-signal-design-handoff-2d1af898`.
- The original checkout remains untouched with pre-existing Backend and
  Contracts edits; implementation is isolated in
  `/Users/cubxxw/data/talent-signal-web-macos-hybrid`.
- The backend already owns account-scoped, revisioned Agent Sessions with
  expiry, tombstones, and stale display authority. Web creates unscoped
  Sessions for chat but does not list, restore, or persist drafts in the UI.
- The current macOS app is native SwiftUI and already contains window selection,
  local Vision OCR, quick-panel, notification, clipboard, and recovery service
  boundaries. Hybrid work must reuse or adapt those boundaries, not bypass them.

## Product and architecture ownership

| Layer | Owns | Must not own |
| --- | --- | --- |
| Host shell | navigation frame, theme, account/session boundary, native capability availability | evidence truth, domain confirmation, effect authority |
| Shared UI primitives | typography, spacing, focus, redline, controls, loading/error patterns | backend calls or native APIs |
| Feature UI | Session, Person, Evidence, Review, Meeting, Plug projections and commands | canonical storage or hidden side effects |
| Domain contracts | identity, provenance, time, revisions, idempotency, approval and receipt distinctions | presentation state |
| Service adapters | authenticated backend reads/writes and explicit error mapping | UI styling or implicit fallback data |
| Native capabilities | user-selected capture, local OCR, keychain/deep links, notifications, quick panel | unrestricted shell/fs/network access or remote truth |

PostgreSQL/backend remains canonical. Browser, Tauri, and SwiftUI state are
projections or recoverable drafts. A Session owns intent, turns, drafts, and
participant references; it never becomes a Person fact or external authority.

## Route migration map

| Current route | Decision | Target responsibility |
| --- | --- | --- |
| `/workspace` | retain as rollback during M1, then redirect intentionally | New Session / resumable Session workbench |
| `/workspace/today` | retain and refine | bounded attention projection; no-action is valid |
| `/workspace/people` | retain and refine | canonical People directory and ambiguity entry |
| `/workspace/pursuits/[id]` | retain | governed Pursuit room and proposal receipts |
| `/workspace/captures` | move under Sources after parity | intentional source capture/review |
| `/workspace/preferences` | merge after behavior inventory | account preferences |
| `/workspace/settings/**` | retain | account, permissions, diagnostics; no product chrome duplication |
| `/workspace/monitor`, `/workspace/evals`, `/workspace/lab` | retain as internal-only | diagnostics/evaluation, never primary product navigation |
| `/contact-agent/**` | retain as rollback until acceptance | legacy relationship workspace |
| `/workspace/sessions` | add in M1 | canonical Session list, create, restore, delete |
| `/workspace/sessions/[id]` | add in M1 | recovered turns/draft/scope and guarded handoff |
| `/workspace/meetings` | add in M2 | meeting context, preparation draft, no implicit calendar write |
| `/workspace/plugs` | add in M2 | connectors, permissions, expiry, fail-closed recovery |
| Memory / Skills | defer as separate product pages | expose only when real canonical contracts exist; keep settings/source boundaries meanwhile |

## Design decision tree

Invariant question: after a real conversation and an interruption, can the
recruiter recover the correct relationship, source, proposed change, and safe
next decision with minimal reconstruction?

### Direction A — Relationship ledger

- A continuous editorial page inspired by the calm reading rhythm of Notion
  and Granola.
- Current dependency is the headline; source fragments sit one step away.
- A restrained vermilion redline marks only the exact reviewable change.
- Session history is a quiet left ledger, not a decorative dashboard.

Risk: the page can become elegant but too soft, hiding object boundaries and
revisions.

### Direction B — Evidence instrument

- A compact three-region workspace inspired by Linear and Attio object clarity:
  Session ledger, governed object, evidence/review inspector.
- Revision, provenance, and receipt states stay spatially stable.
- Density is reserved for the active object; navigation remains visually weak.

Risk: the workspace can feel like a generic operations console and overstate
machine authority.

Direction A is the implementation champion. It preserves the continuous reading
and decision path at both widths while keeping evidence one step away. Direction
B remains the challenger: its fixed inspector makes revision boundaries
spatially explicit on desktop, but turns Review into a second dominant page
segment on narrow screens. Stable revision/provenance/receipt semantics from B
remain component requirements inside A; the page-level compositions stay
mutually exclusive until human review. No fabricated taste score selects them.

## Milestones

### M0 — Inventory and comparable design evidence

- freeze the exact handoff, repository baseline, route map, and boundary map;
- render Direction A and B at 1440 px and 390 px with the same synthetic data;
- record observed hierarchy, keyboard, overflow, dark, and 200% text results;
- leave design acceptance `not_reviewed`.

### M1 — Real Web Session vertical slice

- server-render the account-scoped Session directory from the real backend;
- create and restore a canonical Session, including turns and draft;
- persist drafts with debounce plus explicit save status and revision;
- surface expiry, tombstone, transport error, stale display authority,
  idempotent retry, and concurrent-edit conflict without silent overwrite;
- allow explicit Person/context selection and return-to-Session recovery;
- continue into the existing evidence, change review, and canonical receipt
  path; do not duplicate their domain logic;
- preserve `/workspace?surface=desk` and `/contact-agent/**` as rollback.

Completion evidence: focused unit/contract tests, Web lint/typecheck/build, and
browser proof against an isolated seeded backend for create → recover → person
→ evidence → review/readback → return, plus non-writing failure paths.

### M2 — Remaining Web pages and exceptional states

- reconcile Today, People, Pursuits, Meetings, Plugs, Sources, settings, and
  internal-only routes under one calm shell;
- implement empty, ambiguous identity, source revoked, connector expired,
  insufficient permission, offline/timeout, stale, conflict, retry, deletion,
  and no-action states;
- remove duplicate titles/chrome and enforce list/card parity;
- test long names and titles, 0/1/3/12/100 people, 1440/1024/390 widths, light,
  dark, reduced motion, keyboard, focus, Chinese IME, and 200% text.

### M3 — Hybrid shell feasibility

- add an isolated Tauri shell without replacing `apps/macos`;
- consume a real shared client surface from Web and a local authenticated
  backend adapter; never load the privileged remote Web app;
- prove development and packaged UI, Chinese IME, Markdown/streaming, upload,
  copy/paste, dark mode, OAuth/deep link/keychain, sleep/wake, restart recovery,
  and local-port isolation;
- record size, memory, startup, signing/notarization/update, and rollback facts.

Failure boundary: if measured Hybrid gates fail, keep the native SwiftUI host
and document the exact failed constraint before considering Electron.

### M4 — Native capability bridge

- expose only typed, allowlisted commands for user-selected window capture,
  cancellation, local OCR, quick-panel continuation, and state-only
  notifications;
- validate payload sizes, identity/account scope, cancellation propagation,
  retry/idempotency, and receipts on both sides of IPC;
- prove cancel means zero capture/model work and OCR failure has no cloud
  fallback;
- preserve current Swift services as the reference behavior until parity is
  demonstrated.

### M5 — Acceptance and release readiness

- run every applicable TS-001…TS-030 case at its real boundary;
- record `passed / failed / blocked / not_run`, version, platform, fixture,
  observed result, and evidence path;
- independently review safety, architecture, accessibility, and regression;
- keep production deployment and public release out of this goal unless
  separately authorized.

## Re-plan triggers

Re-plan rather than paper over evidence when:

- the real Session contract cannot represent the needed recoverable state;
- Hybrid requires loading a remote privileged page or broad native access;
- Person/context identity is ambiguous at the point of mutation;
- a mock/fixture is the only available proof for a production claim;
- concurrency, expiry, revocation, or deletion loses audit evidence;
- visual refinement reduces contrast, focus, provenance visibility, or action
  clarity.

## Completion boundary

This plan is complete only when M1–M4 are implemented and verified, M5 records
every case honestly, current Web and macOS rollback paths remain recoverable,
and no unresolved P0/P1 safety finding remains. Design acceptance may still be
`not_reviewed`; that is an explicit human gate, not a reason to falsify status.
