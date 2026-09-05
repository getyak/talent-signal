# Agent semantic streaming

## Outcome

Deliver the governed Agent Task experience from P0 through P3: a durable,
reconnectable semantic event stream; progressive artifact rendering; explicit
cancel, decision, stale, failure, and recovery states; and restrained
Talent Signal motion that connects evidence to interpretation without exposing
private reasoning or granting model output authority.

The observable completion evidence is a real Pursuit Agent task whose browser
surface receives ordered server events, survives reconnection without duplicate
content, progressively reveals its artifact, focuses the exact human decision,
and passes backend, contracts, Web, accessibility, reduced-motion, build, and
documentation checks.

## Boundary

In scope:

- the existing governed `pre_call_briefing` Agent Task and Pursuit Agent rail;
- PostgreSQL task events/outbox as the authority for progress and recovery;
- an authenticated SSE projection with cursor replay and snapshot fallback;
- safe storage of lifecycle, tool, checkpoint, artifact, decision, budget, and
  terminal metadata without chain-of-thought or raw evidence payloads;
- progressive semantic artifact blocks and the evidence-to-claim causal seam;
- desktop, narrow viewport, keyboard, screen-reader, and reduced-motion states.

Out of scope:

- exposing provider reasoning or raw model tokens;
- making Redis, Kafka, LangGraph, or a provider protocol authoritative;
- external effects, automatic fact confirmation, or automatic proposal approval;
- redesigning unrelated Relationship Ask, iOS, Lab, or candidate-data paths.

## Current evidence

- `agent_task_events` and `agent_delivery_outbox` already persist ordered public
  events and cursors.
- Agent Run events already persist tool and terminal fingerprints, but the
  public event API is JSON polling and the Web rail polls whole projections.
- The current rail renders only a generic active state and the final artifact.
- The worktree contains extensive unrelated user changes; this plan owns only
  the streaming-specific files and narrow additions to shared contracts/routes.

## Approach

Keep PostgreSQL authoritative. Use SSE as a resumable transport over the
existing outbox and `Last-Event-ID`; use PostgreSQL notification or bounded
polling only as a wake-up mechanism. Do not add Redis in this slice because it
would duplicate neither durability nor authorization and would require a new
operational dependency before measured fan-out pressure exists. Preserve a
broker seam so Redis can later replace the wake-up mechanism without changing
the event contract.

Normalize stored task events into a versioned surface-event union. The Web uses
one idempotent reducer for live events and snapshot reconciliation. Artifact
content remains a governed, non-canonical projection; the UI progressively
reveals stable semantic sections rather than rendering provider token or
reasoning streams.

## Milestones

1. **P0 — durable transport (complete):** add SSE encoding/subscription, replay,
   heartbeats, snapshot reconciliation, and transport tests.
2. **P1 — semantic rendering (complete):** add the Web stream reducer, visible real stages,
   progressive artifact sections, cancellation, and reconnect recovery.
3. **P2 — human decisions and long work (complete):** surface clarification, decision,
   stale, no-action, failed, cancelled, and rebase states with exact handoffs.
4. **P3 — refined interaction (complete):** add the restrained vermilion causal seam,
   stable motion, source anchors, responsive layout, accessibility announcements,
   and reduced-motion behavior.
5. **Verification (complete):** the Web suite passed with 323 tests and one
   intentional skip; Web/contracts typecheck, focused ESLint, production build,
   and `pnpm docs:check` passed. The synthetic governed-task stream preserved
   durable event order through terminal sequence 7, and the real rail was
   inspected at 696×873 with reduced motion enabled, no horizontal overflow,
   and a polite terminal-stage announcement.

## Verification evidence

- `pnpm --filter @talent-signal/web test -- agentTaskStream.test.ts`
- `pnpm --filter @talent-signal/web typecheck`
- focused ESLint over the stream, route, fixture, and rail files
- `AUTH_SECRET=… pnpm --filter @talent-signal/web build`
- `pnpm docs:check`
- browser DOM, screenshot, reduced-motion, narrow-width, and overflow inspection
- raw development SSE inspection: durable ids 1–4, semantic block frames,
  durable ids 5–7, then the reconciled terminal snapshot

## Reconsideration signals

- Add Redis only when measured concurrent subscribers or cross-region delivery
  exceed PostgreSQL notification/polling needs; Redis remains ephemeral fan-out.
- Add provider token streaming only for content whose partial form can be
  validated and retracted without weakening evidence or decision semantics.
- Revisit the transport if bidirectional high-frequency interaction becomes a
  real requirement; approvals and cancellation remain ordinary HTTP mutations.
