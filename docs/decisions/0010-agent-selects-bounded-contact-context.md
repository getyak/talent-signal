# ADR 0010: The Agent selects bounded contact context after Send

## Context

The mobile composer previously mixed three decisions before or immediately
after Send: whether a message concerned a contact, which Person it meant, and
which relationship context should be opened. Client-side keyword scoring and a
picker made ordinary conversation feel like form entry. They also placed
semantic routing in UI code while still being unable to resolve genuine
ambiguity safely.

Contact selection is not itself a consequential external effect, but contact
search and relationship reads cross a sensitive-data boundary. Giving a model
generic directory or database access would trade one interaction problem for
unbounded collection and opaque identity decisions.

## Decision

Use one composer with no mandatory pre-send contact selection. For an unbound
Session, the Agent chooses among a direct reply, one clarification, a bounded
contact lookup, or one contact-change proposal.

Expose one typed `contact_workspace` Tool with four operations:

- `search` requires a specific clue grounded in the current message and returns
  at most six minimal Person/context labels from the authenticated account;
- `read` accepts only a uniquely resolvable Person/context returned by search
  in the same Run and returns no messages or evidence;
- `propose_create` and `propose_update` bind their fields to user text or an
  unchanged exact target and return a fingerprinted review candidate;
- no model-callable apply, merge, messaging, calendar, CRM, notification, or
  publication operation exists.

When the Tool resolves one relationship, iOS binds the Session and uses the
existing governed scoped Ask to compile evidence and produce a cited answer.
When several scopes remain plausible, iOS shows only candidate labels and asks
the recruiter to choose. Contact changes reuse the existing confirmation,
idempotent capture, canonical readback, and receipt path.

## Consequences

- sending a normal message never depends on a picker;
- the Agent owns semantic strategy while deterministic code owns account
  authorization, uniqueness, budgets, schemas, idempotency, and writes;
- a search cannot silently become a private unscoped answer, and an ambiguous
  result cannot be read;
- the manual relationship picker remains available as recovery or an explicit
  shortcut;
- a provider or Tool failure falls back without fabricating contact access;
- the first vertical slice stores the fingerprinted proposal in the protected
  iOS Session and reuses the existing capture executor; a server-side proposal
  record with expiry may be added if multi-device review becomes necessary.

## Alternatives considered

- Require a picker before Send: deterministic, but adds repeated work and
  forces the recruiter to classify every message.
- Keep client-side keyword matching: fast, but duplicates semantic policy in
  UI code and cannot reliably represent ambiguity.
- Give the model full contact or database access: flexible, but violates data
  minimization and makes authorization difficult to inspect.
- Let the Agent write contacts directly: fewer taps, but removes exact-effect
  approval, conflict handling, reversibility, and truthful readback.

## Reconsider when

Add durable server-side proposal identity and expiry when contact review must
move between devices or reviewers. Broaden read context only if measured tasks
cannot be completed through unique scope resolution followed by governed Ask.
Any new effect operation still requires a separate human authorization and
deterministic executor.
