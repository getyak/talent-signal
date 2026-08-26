# Web Today and bounded Agent vertical slice

## Outcome

Make the authenticated Talent Signal Web experience open on a quiet, canonical
Today surface backed by the shared PostgreSQL Pursuit and Proposal APIs. From
one evidence-backed Today item, a recruiter can start one bounded Agent run,
observe its terminal state, inspect the resulting review-only Proposal or
explicit `no_action`, and reach the affected Pursuit without any external
effect or client-side provider credential.

Completion is directly observable when a clean local stack can load synthetic
canonical Pursuit data, the Web Today page renders from backend readback, a
pinned free OpenRouter model can complete the four-tool Agent protocol, and a
real browser journey verifies the resulting Proposal/no-action state.

## Boundary

In scope:

- authenticated desktop Today as a projection over canonical Pursuits and
  Pursuit Proposals;
- a server-only Web adapter for the backend session and Agent-run APIs;
- one pinned OpenRouter tool-calling provider behind the existing bounded
  `@talent-signal/agent` interface;
- loading, empty, no-action, pending review, unavailable evidence, failure,
  retry, and stale-revision language relevant to this slice;
- synthetic local fixture preparation, deterministic tests, live credentialed
  proof with no real candidate content, and browser verification;
- allowlisted local credential sync from `/Users/cubxxw/data/daypage/.env`
  without logging values or committing them.

Out of scope:

- treating Today, model output, or chat history as canonical state;
- sending messages, changing calendars/contacts/ATS/CRM, or any other external
  effect;
- automatic Proposal confirmation or identity binding;
- copying unrelated Daypage credentials into Talent Signal;
- claiming production identity-provider, private-evidence provider, data-region,
  or design-partner readiness from this synthetic local proof.

## Current evidence and unknowns

- The backend already exposes account-scoped Pursuit, Proposal, Agent-run, and
  operation readback contracts, and the database owns the matching tables.
- The current Web workspace reads the older relationship/assignment surface
  through localhost simulated authentication and has no canonical Today,
  Pursuit, Proposal, or Agent-run route.
- The V1 iOS client already contains the accepted Today attention semantics;
  the Web implementation should reuse those meanings, not duplicate iOS UI.
- `@talent-signal/agent` currently supports the safe deterministic provider and
  Claude Agent SDK. Daypage supplies a valid OpenRouter credential. A pinned
  `cohere/north-mini-code:free` connectivity probe returned the expected
  `read_pursuit` tool call on 2026-08-26.
- The repository has pre-existing user edits in two iOS files. This plan owns
  Web, Agent, backend configuration/evaluation, contracts only when necessary,
  and this plan; it does not modify or revert those iOS files.

## Chosen approach

Add an OpenRouter provider as another implementation of the existing
provider-neutral Agent interface. It receives only the frozen objective and
four JSON-schema tools, executes tool requests through the in-process governed
gateway, disables parallel calls and server tools, records actual usage, and
must terminate through the existing candidate-fingerprint validation.
Until provider admission is proven, the backend permits remote providers only
when every selected fragment has both a `synthetic:` source locator and a
synthetic parser. Private or mixed scopes fail before a provider call.

Add a small Web Today module rather than extending the 10,000-line legacy
workspace component. Server-side code obtains a backend client, reads Pursuits
and Proposals in parallel, and compiles a disposable Today projection. Client
interactions call same-origin route handlers; provider and backend credentials
remain server-only.

Use the existing synthetic Pursuit fixture preparation for local proof. Do not
silently create business state on a read path or ship sample state as if it
were production data.

## Rejected directions

- Calling OpenRouter directly from a React component would expose credentials
  and bypass the Agent gateway, journal, fingerprints, and Proposal boundary.
- Using the `openrouter/free` router would currently run, but it can select a
  different underlying model and weakens the pinned-model proof.
- Reusing the marketing Today concept as the authenticated product would make
  synthetic visual copy look canonical.
- Expanding the legacy relationship workspace would increase regression risk
  before the old assignment model and Pursuit model are fully migrated.

## Milestones

1. Freeze contracts, environment posture, and credentialed provider probe.
2. Implement and test the pinned OpenRouter bounded-Agent provider.
3. Implement the canonical Web Today projection, route handlers, and states.
4. Prepare a fresh synthetic Pursuit fixture and verify database/Agent readback.
5. Run Web/Agent/backend checks and a real browser journey with Computer Use.
6. Review evidence, safety, responsive behavior, and repository state; then
   record the final proof and remaining production boundary.

## Proof

- provider unit tests cover valid multi-turn tools, prohibited/unknown tools,
  malformed arguments, provider failure, timeout, usage, and terminal output;
- Web tests cover attention ordering, no arbitrary cap, one consolidated item
  per Pursuit, pending Proposal plus owned-action coexistence, unavailable
  evidence, no-action, and server-only credential handling;
- backend tests prove provider selection fails closed without a key or pinned
  model and preserves the deterministic default;
- a fresh PostgreSQL stack and synthetic fixture prove Pursuit/Proposal/Agent
  readback with empty external effects;
- a browser journey proves desktop and narrow viewport rendering, keyboard
  access, Agent terminal feedback, Proposal visibility, retry/failure honesty,
  and no horizontal overflow;
- `pnpm docs:check`, relevant lint/typecheck/tests, backend CI, and Web build
  pass; unrelated iOS modifications remain untouched.

## Reconsider when

Use a different provider or model only when the pinned free model loses tool
support, availability, or acceptable bounded-protocol reliability. Replace
simulated local login with a production Web identity bridge only after its
account-binding and session-exchange contract is explicitly designed and
tested.

## Progress checkpoint — 2026-08-26

- OpenRouter adapter, backend selection, synthetic-only provider gate, and
  allowlisted 0600 credential sync are implemented and tested.
- Canonical Today, Pursuit room, same-origin Agent/review routes, explicit
  per-item review, and visible canonical receipt are implemented.
- Isolated PostgreSQL/backend ports `55433`/`44317` and Web port `3000` ran the
  synthetic journey. The latest live run used
  `cohere/north-mini-code:free`, terminated as `no_action` in three turns and
  two tool calls, cost 0 estimated USD, and recorded zero external effects.
- In-app browser proof passed at 1280×720 and 390×844 with no horizontal
  overflow. A keep-unresolved review left Pursuit revision 1 unchanged, moved
  the visible queue from 1 to 0, and retained the canonical receipt.
- A separate confirm-path review moved the synthetic milestone from shortlist
  review to final conversation and the canonical revision from 1 to 2; the
  server refresh preserved the receipt and the queue remained at 0.
- Evidence-safety verdict is `pass_with_changes`: the synthetic route has no
  veto, while provider lifecycle admission and production identity remain
  explicitly outside the proof boundary.
- Native macOS Computer Use replay passed in Google Chrome. It opened the
  canonical Today surface, ran the bounded OpenRouter Agent to `no_action`
  with zero external effects, opened the Pursuit room, confirmed the exact
  synthetic milestone Proposal with a recorded decision basis, and observed
  canonical readback from revision 1 to 2, shortlist review to final
  conversation, queue 1 to 0, and a retained receipt reporting one changed
  field and zero external effects.
