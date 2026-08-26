# Web workspace vNext continuity slice

## Outcome

Talent Signal Web should behave as one continuous relationship workspace rather
than a set of independently mounted Today, People, Pursuit, and Agent pages.
The first slice establishes one persistent product shell, preserves navigation
and account controls while route content streams, removes misleading global
loading copy, and reduces avoidable serial ownership in the Relationship Desk
initial read.

The recruiter question for this desktop knowledge-workspace slice is:

> What changed, which governed object am I working in, and can I move between
> attention, people, and the current relationship without reconstructing my
> place?

## Scope

In scope:

- one authenticated `/workspace` layout that persists across child routes;
- one responsive navigation model for Today, Agent, People, and intentional
  source capture;
- Today, People, Pursuit, and Relationship Desk embedded in that shell;
- a route-level loading state that leaves the shell interactive and makes no
  false evidence-review claim;
- one server owner for the Relationship Desk initial read, with independent
  history and Wiki readbacks loaded concurrently;
- focused automated checks and real browser proof of route continuity.

Out of scope for this slice:

- completing the full decomposition of the legacy Relationship Workspace;
- adding a new Pursuits directory or mobile Sessions product;
- deleting accumulated fixture or evaluation data;
- restyling every evidence, identity, action, and recovery subflow;
- introducing a second canonical client-side data store.

## Current evidence

- `app/workspace` has no `layout.tsx`; each surface renders its own navigation,
  account controls, and responsive structure.
- all current workspace pages force dynamic rendering and share a full-page
  `loading.tsx` whose “Opening evidence review” message also appears for People
  and Agent navigation.
- Today uses a top navigation, People uses the legacy context sidebar, and the
  Pursuit room owns another page header.
- `relationship-workspace-app.tsx` remains a 9,000+ line Client Component with
  dozens of direct requests and local states. Opening it in the current Next
  development server produced a sustained full-core compile stall.
- the local `fixture-alpha` account contains repeated evaluation data. That is
  a separate environment-isolation issue; the shell slice must not disguise it
  as a visual problem.

## Chosen approach

1. Use a nested Server Component layout for authenticated account scope and a
   small Client Component only for pathname-aware navigation. This keeps most
   shell markup out of the client bundle while preserving it across routes.
2. Keep Today as the return surface and Agent as the relationship work surface
   inside the same shell. Sources remain an intentional command, not a browsing
   destination.
3. Remove competing page-owned product chrome. Route components continue to
   own their governed content and decision states.
4. Keep the existing canonical backend contracts. Consolidate only the initial
   Relationship Desk reads so the same authenticated client performs the base
   read and concurrent dependent readbacks.
5. Treat the currently rendered Today topbar and People/Desk persistent rail as
   the two structural directions already compared. Select the persistent rail:
   it better preserves context and interruption recovery; adapt it to a compact
   bottom dock on narrow screens.

## Milestones and proof

1. **Persistent shell**
   - all workspace child routes render inside one shared rail/dock;
   - current-route semantics and keyboard focus are visible;
   - account controls and theme remain reachable without page duplication.
2. **Embedded surfaces**
   - Today, People, Pursuit, and Relationship Desk no longer render competing
     global navigation;
   - loading replaces only route content and describes canonical readback
     without assuming an evidence-review task.
3. **Initial read owner**
   - one typed loader owns Relationship Workspace, relationship scope, identity
     review, Agent history, and Wiki initial readback;
   - independent history and Wiki work is concurrent and partial failure keeps
     verified primary state visible.
4. **Verification**
   - focused tests, lint, typecheck, and production build pass;
   - the real browser proves Today → People → person/Agent → Today without the
     shell disappearing or a mismatched full-page loader.

## Design read

Primary surface: desktop knowledge workspace. Audience: an independent
recruiter moving between several relationship-led searches under interruption.
Character: quiet, compact, and stable; restrained motion; high density only in
the governed object, not in global chrome. Canonical objects remain Pursuit,
Person, Relationship Context, evidence, Proposal, Action, and Receipt. Today
and People are projections. The shell owns navigation and account context only;
it has no evidence truth or effect authority.

## Completion boundary

This plan is complete when the shared shell and consolidated initial read are
implemented and directly verified. The broader vNext goal remains active after
this slice: feature-owned queries/commands, canonical person routes, safe Web
draft recovery, evaluation-account isolation, and removal of the legacy giant
component are later milestones rather than claims of this plan.

## Verification record

Completed on 2026-08-26:

- the shared Server Component layout and pathname-aware rail/dock render once
  across Today, People, Pursuit, and Relationship Desk;
- the Relationship Desk initial read now uses one authenticated client and
  settles independent Agent history and Wiki readbacks concurrently;
- a same-route Add source command opens and closes the governed capture modal
  without a reload, and removes its transient URL intent on close;
- desktop browser proof covered Today → People → exact relationship Agent →
  Today, while the 390 × 844 check confirmed the compact mobile dock;
- the neutral local loading view kept the shared shell available, and a clean
  browser session reported no runtime warnings or errors;
- `pnpm --filter @talent-signal/web lint`, 202 Web tests, typecheck, production
  build, `pnpm docs:check`, and `git diff --check` passed.

Observed but intentionally not claimed as fixed by this slice: the current
account still contains repeated evaluation Pursuits and synthetic UI-owner
people. The next continuity slice should isolate evaluation writes and bound
projection rendering before deeper Relationship Workspace decomposition.

### Follow-on continuity record

Completed on 2026-08-26:

- Today now mounts a six-item attention projection by default while preserving
  the full canonical count and an explicit route to the complete queue;
- synthetic integration fallback is visibly labeled as a fixture workspace so
  account identity and evaluator state cannot be mistaken for one live user;
- the iOS Pursuit Proposal evaluator retires only exact, evaluator-owned active
  fixture titles before creating a new run, including after process restart;
  existing historical records were not deleted or rewritten;
- Relationship Wiki mapping and rendering now live in a feature-owned module,
  preserving confirmed facts, contested evidence, and proposed action as
  distinct states rather than adding another client store;
- Relationship history, preserved external effects, unresolved identity
  judgment, and account-scoped person creation now live behind feature-owned
  components; the legacy client entry fell from 9,710 to 8,061 lines without
  changing its canonical backend contracts;
- the frozen boundary-case evaluator keeps its own case rail and is no longer
  exposed inside a second copy of the product shell;
- focused Web and backend tests cover projection totals, Wiki provenance, the
  exact fixture classifier, and a non-fixture counterexample.

Remaining work includes deeper command/query ownership, draft and retry
recovery, and decomposition of merge review, capture, and resource-composer
features from the legacy client component.

Verification after this follow-on slice: 208 Web tests passed with one skipped;
Web lint, typecheck, and production build passed; backend typecheck and all 155
backend tests passed; documentation, architecture-diagram, and whitespace
checks passed. Direct browser proof covered the focused Today projection,
Today → People → Agent → Today, and standalone boundary-evaluator chrome.

### Feature ownership follow-on

Completed on 2026-08-26:

- person merge now owns its current preview, source and target versions,
  blockers, recruiter basis, idempotent commit, receipt, and canonical reversal
  availability in one feature module;
- screenshot capture, transcript speaker review, relationship start, governed
  resource capture/review, identity correction, source authorization, and
  deletion moved behind feature-owned components without changing backend
  contracts or creating a second client store;
- shared display-only labels moved into a pure relationship display module;
- the legacy Relationship Workspace entry fell from 8,061 to 3,103 lines;
- concurrent initial reads of one relationship resource list now share one
  in-flight request, while post-mutation readback explicitly bypasses that
  projection and requests fresh canonical state;
- direct browser proof opened and dismissed screenshot review and duplicate
  review without a write, opened the relationship resource composer, and
  observed one resource-list request instead of the prior duplicate pair.

Remaining work is concentrated in the 3,103-line orchestration and living-page
render: feature-owned fact decisions, internal-action and effect-reversal
commands, and smaller governed projection sections.

Verification after this follow-on slice: 215 Web tests passed with one skipped;
Web lint, typecheck, and a clean production build passed; documentation,
architecture-diagram, and whitespace checks passed. The final browser readback
showed the persistent workspace shell, six mounted Pursuit links, 76 quieter
items behind the explicit full-queue route, no loading state, and a 200 response
for `/workspace/today`.

### Governed projection follow-on

Completed on 2026-08-26:

- fact review now owns corrected-value editing, complete calendar-date
  validation, evidence anchors, and the source-linked supersession gate;
- Next move now owns its exact fact gate, stale-approval path, internal effect
  execution, reconciliation, reversal preview, idempotent reversal approval,
  execution, revocation, and verified readback states;
- relationship outcome history is a pure, time-ordered projection over source,
  confirmed state, approval, effect, and reversal receipts;
- the legacy Relationship Workspace entry fell again from 3,103 to 2,093
  lines, down from 9,710 before the Web vNext decomposition.

Verification after this slice: 220 Web tests passed with one skipped; Web lint,
typecheck, production build, documentation, architecture-diagram, and whitespace
checks passed. Direct browser proof showed the fact review, known context,
reviewed source, Next move, reversal review, and outcome timeline together on
the real Agent surface without a write, then returned to a stable Today view
with six mounted Pursuits and the explicit 76-item quiet overflow.

The command boundary now also rejects successful HTTP responses that do not
contain a verified workspace readback, preserving the prior readable state for
conflicts, malformed responses, and network failures. Governed capture deletion
owns its local two-step confirmation and clears the living page only after both
deletion and lineage receipts are present. Verification after these recovery
guards: 223 Web tests passed with one skipped; Web lint, typecheck, production
build, documentation, architecture-diagram, and whitespace checks passed.

### Relationship continuity follow-on

Completed on 2026-08-26:

- one relationship-scoped Agent controller now owns the unsent objective,
  submitted objective, response, local operation receipt, governed UI commands,
  request identity, and cancellation instead of duplicating that state across
  the full and Agent-only render paths;
- unsent Agent text recovers from session storage only when a canonical account,
  person, and relationship context are all known. Volatile contexts remain
  in-memory so a draft cannot cross an account or relationship boundary;
- changing relationship context aborts the old request, clears its busy state,
  and rejects any late response. A failed retry of the same objective retains
  its request ID while a changed objective receives a new one;
- identity creation, identity resolution, and person-merge reversal move their
  visible receipt to the resulting relationship context instead of leaving it
  behind in the prior Agent scope;
- one controlled Agent panel now presents both the focused and review modes,
  while one read-only evidence projection owns active confirmed context,
  historical state, exact source anchors, reviewed source, and provenance;
- the remaining Relationship Workspace orchestrator fell from 2,012 to 1,357
  lines, down from 9,710 before the Web vNext decomposition.

Verification for this follow-on: Web typecheck and lint passed; 227 Web tests
passed with one skipped; the production build, documentation, Wiki, architecture
diagrams, and whitespace checks passed. Direct browser proof staged a synthetic
unsent objective, recovered it after a full reload of the same relationship,
then cleared it and confirmed the default objective after another reload. The
read-only confirmed context and reviewed source remained visible throughout.
The final browser view returned to Today with six mounted Pursuits, 76 quieter
items behind the explicit full-queue route, no loading state, and only 200
responses in the development-server readback.

### Living-page presentation follow-on

Completed on 2026-08-26:

- the living contact header now has one projection for both a relationship with
  governed resources and a full evidence-review workspace. Its dependency label
  is derived only from source access, pending review, confirmed context, and
  verified outcome state; the copy explicitly rejects person rating;
- source lineage owns its four-step Source → Identity → Relationship → Living
  contact projection and keeps retention scope distinct from identity evidence;
- the empty-workspace onboarding, unscoped Agent start, and relationship resource
  launcher/composer now have independent presentation owners instead of living
  beside mutation orchestration in the root component;
- the Relationship Workspace orchestrator fell from 1,357 to 1,000 lines, down
  from 9,710 before the Web vNext decomposition.

Verification after this extraction: 229 Web tests passed with one skipped; Web
typecheck, lint, production build, and whitespace checks passed. Direct browser
proof showed the scoped Agent, living contact header, current dependency,
governed resource launcher, source lineage, confirmed context, and reviewed
source together with no loading state. No approval, deletion, or external-effect
control was used during proof.

### Brief-reload continuity follow-on

Completed on 2026-08-26:

- canonical Agent history was confirmed to retain a relationship-scoped brief
  receipt, immutable snapshot reference, disposition, and included-block count,
  but not the prior question or sensitive answer body;
- after reload, a relationship with an existing `chat_brief` receipt now shows
  whether the earlier brief is current or superseded and explains that asking
  again compiles against currently authorized evidence;
- the answer body is deliberately not copied to session storage, preventing a
  deleted, revoked, or expired source from leaving stale sensitive prose in a
  second browser-owned cache;
- relationships without a canonical brief receipt show no recovery claim.

Final verification: 231 Web tests passed with one skipped; Web typecheck, lint,
production build, and whitespace checks passed. Read-only browser proof found
an existing relationship with a delayed history readback and showed “An earlier
brief is recorded”, “Receipt only”, and “not the answer body” without response
metadata replay. All inspected relationship routes returned 200. The browser
finished on Today with six mounted Pursuits, 76 quieter items behind the full
queue, and no loading state.

### Canonical readback and session-recovery follow-on

Completed on 2026-08-27:

- the signed account ID now crosses the server/client boundary even when only a
  relationship scope is open, so account-scoped Agent draft recovery no longer
  downgrades to volatile memory after source or relationship removal;
- account identity is an invariant rather than mutable relationship state. A
  valid-shaped readback from another account or capture is rejected and the
  prior verified workspace remains visible;
- one relationship readback controller owns Agent-history and workspace-review
  refreshes, aborts superseded requests, validates person/context/capture
  identity, and ignores late responses after a scope switch;
- expired backend credentials now preserve their distinct 401
  `backend_session_expired` meaning through local integration routes instead of
  becoming a generic 503;
- Today, Agent, People, and Pursuit routes now offer or route to a sign-in-again
  path that retains the exact safe callback location. The login page renders
  that recovery state even while the stale outer Web session still exists, so
  retry no longer loops back to another unavailable read;
- an already-open relationship now preserves the structured 401 code from a
  mutation, history refresh, workspace readback, identity review, or merge
  reversal preview and immediately exposes the same returnable sign-in path;
- every Relationship Workspace feature request now crosses one integration
  boundary. Only a verified 401 `backend_session_expired` response broadcasts
  recovery; ordinary authorization, validation, conflict, and availability
  failures remain with their owning feature;
- the same request and recovery boundary now covers already-open Pursuit Today
  Agent runs and Proposal reviews, including the Pursuit routes' nested error
  envelope. The last verified Today projection and local review decisions stay
  visible while new governed writes are paused behind one sign-in path;
- a resource's “Continue fact review” path no longer hard-reloads `/workspace`
  to reinitialize client state. A governed in-place capture switch now verifies
  account, capture, person, relationship context, and request currency before
  replacing the visible review and URL; failed or late readback keeps the prior
  relationship visible;
- refreshed Today focus and Pursuit review state are keyed to canonical Pursuit
  and Proposal identity, so an objective, local decision, or receipt cannot
  drift into the next object. A reviewed Proposal stays excluded locally while
  canonical refresh settles, and the next Proposal can open without a manual
  page reload;
- source identity correction no longer refreshes the old relationship and then
  pushes the browser to the new scope. After the governed write, a controlled
  readback must match the explicit target person and relationship as well as
  account, capture, and origin request currency before state and URL move
  together. A committed correction with unavailable readback is reported as
  committed-but-unread rather than as a failed write;
- the shared session-recovery hook now reconciles changed Server Component
  props after a soft refresh without erasing an already-observed client 401
  when the server prop did not change. Server-added and server-cleared recovery
  links therefore stay aligned with the current rendered projection;
- relationship loading/error presentation moved behind a feature-owned status
  component, while session-event ownership moved into a dedicated hook. The
  remaining orchestrator is 991 lines.

Verification after this follow-on: 243 Web tests passed with one skipped; Web
lint, typecheck, and the production build passed. Documentation and Wiki checks
passed. Read-only browser proof showed the expired-session recovery link on
Today, Agent, and People, preserved each callback URL, opened the login recovery
state without a redirect loop, and observed `/api/local-integration/people`
return 401 instead of 503. The architecture check initially encountered
unrelated merge markers in concurrent backend, iOS, compose, environment, and
script work. Another process resolved and committed those files without this
slice touching them; the final architecture rerun passed all three diagrams.
The after-load Pursuit mutation path remains ready for browser proof after the
account owner restores the expired session; no credentials were entered during
this implementation pass.
