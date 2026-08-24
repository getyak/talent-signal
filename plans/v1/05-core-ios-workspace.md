# PRD-05: Pursuit-first iOS workspace

## Problem and user outcome

An independent recruiter returning to Talent Signal must see which governed
Pursuit deserves judgment, why it deserves attention, and the smallest owned
next step without browsing a relationship demo or treating a person as ranked.

## In-scope requirements

- Pursuit-first contributions to `V1-IOS-001`, `V1-IOS-002`, `V1-IOS-003`,
  `V1-IOS-004`, and `V1-IOS-005`;
- canonical Today, Pursuits, Pursuit detail, People, Inbox, and Proposal-review
  retrieval from the account-scoped backend;
- loading, empty, failure, stale, no-action, and retry states on the same mobile
  surface.

## Out of scope

- candidate-facing sends, calendar writes, ATS/CRM mutations, or background
  automation;
- automatic action completion, person ranking, relationship scores, or
  acceptance probability;
- production authentication, real-source rollout, and desktop workspace.

## Personas and entrypoints

The flagship user is an independent recruiter or boutique-search operator.
Today is the normal return surface. Pursuits is stable outcome retrieval;
People is stable identity retrieval across outcomes; Inbox exposes governed
review work. Capture and Guide remain contextual capabilities.

## Canonical owner and projection boundary

PostgreSQL Pursuits, roles, criteria, gaps, actions, Proposals, People, and
revisions remain canonical. The iOS workspace stores only transient loading,
selection, and navigation state. Display labels and review counts are backend
projections resolved from canonical account-scoped rows, not a second CRM.

## Attention rules

Attention orders work, never people. A pending Proposal, an owned due action,
or an open evidence-backed gap may make a Pursuit visible on Today. Each item
must name the Pursuit, reason, evidence boundary, and next review destination.
When none qualify, Today presents an explicit no-action state.

## Failure and stale behavior

Loading is visible. A failed read never falls through to realistic fixture
facts. Retry repeats a read only. If a selected Pursuit disappears or changes
revision, the client returns to the current canonical list and labels the
change; it does not retain an authoritative local copy.

## Deterministic tests

Tests cover canonical account scope, subject-label resolution, Today ordering,
no person score, no-action, loading, empty, failure/retry, stale selection,
Pursuit detail, People cross-Pursuit roles, pending review navigation, and
relaunch readback.

## Simulator and full-stack journeys

Proof requires iPhone 17e and current Pro journeys from Today → Pursuit →
pending review → canonical readback, plus People retrieval, empty workspace,
offline/retry, Dynamic Type, dark mode, and reduced motion.

## Rollout and falsifiers

The first slice uses synthetic account data and loopback authentication. It
fails if the UI presents fallback fixture facts after a canonical read error,
orders people by inferred value, hides why a Pursuit needs attention, or claims
that an internal action performed an external effect.

## Implementation checkpoint — 2026-08-24

Contract `2026-08-24.5` now exposes account-scoped Pursuit, People, and open
Proposal projections. The iOS root is Pursuit-first: Today ranks governed work,
Pursuits retrieves outcomes, People retrieves stable identities across outcomes,
and Inbox opens the existing canonical Proposal review. The client has no
realistic fallback facts and retains a prior canonical read only with an
explicit uncertainty notice when refresh fails.

Frozen current-code Simulator proof is recorded in
`docs/evaluations/2026-08-24-v1-prd-05/ios-workspace-runtime.json`; matching
PostgreSQL readback is in `pursuit-workspace-runtime.json`. The evidence covers
the canonical Today → Proposal → Pursuit → Person journey, account isolation,
work-not-person ordering, no-action, empty, offline/retry, stale refresh,
governed identity layout, iPhone 17 Pro, iPhone 17e, AX5, dark mode, and reduced
motion. Ten exported screenshots are retained beside the runtime artifacts.

This checkpoint does not claim production authentication, real-source or
design-partner value, manual VoiceOver, real-device, localization, Chinese, or
external-write proof. Those remain release-gate evidence rather than inferred
passes.
