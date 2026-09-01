# macOS Relationship Workbench implementation

Status: active — RC7 build 5 frozen; final independent panel pending
Owner: Codex
Started: 2026-08-31

## Outcome

Implement the proposed
[macOS Relationship Workbench PRD](2026-08-31-macos-relationship-workbench-prd.md)
as a native, evidence-first Talent Signal surface whose product experience,
user experience, and technical experience each clear a directly evidenced
95-point release threshold without averaging away a safety veto.

Completion requires a real macOS build, a complete explicit-capture-to-governed-
receipt journey against the shared backend, real native UI and accessibility
evidence, and independent recruiter-workflow and evidence-safety sub-agent
packets against the same frozen artifact. A fixture-only shell, passing unit
tests, attractive screenshots, or an Agent saying it completed the task is not
completion.

## Boundary

In scope:

- `MAC-FND-*`, `MAC-CAP-*`, `MAC-AGT-*`, `MAC-ACT-001` through
  `MAC-ACT-005`, `MAC-TRU-*`, and `MAC-A11Y-*` from the PRD;
- a separate `apps/macos` native SwiftUI and AppKit host;
- Menu Bar Presence, Quick Panel, Context Capsule review, Relationship
  Workspace, and Action Center;
- explicit selected text and file capture first, followed by system-selected
  window capture without ambient monitoring;
- the existing account, Person, relationship context, Pursuit, governed
  resource capture, Agent Task, Proposal, decision bundle, and Receipt owners;
- deterministic recovery, deletion, stale, ambiguity, `no_action`, failed, and
  outcome-unknown states;
- native unit, integration, UI, keyboard, VoiceOver, reduced-motion, dark,
  mixed-script, relaunch, and deletion proof;
- independent reviewer packets and versioned adjudication.

Out of scope until a later PRD gate:

- inbound Calendar monitoring, microphone or system-audio sessions;
- Accessibility, Automation, Input Monitoring, Full Disk Access, or generic
  computer control;
- message send, Calendar, Contacts, ATS, or CRM write;
- automatic identity binding, memory promotion, person merge, scoring, fit,
  personality, protected-trait, culture-fit, or acceptance inference;
- changing the active dirty iOS implementation to make the Mac app easier.

## Current evidence

- `apps/macos` is now a separate native SwiftUI/AppKit XcodeGen host. It keeps
  the user's active iOS and Web work out of the Mac implementation boundary.
- Frozen RC7 is `TalentSignalMac 0.1.0` build `5`, archive SHA-256
  `0101fd702e594d03517d9ac1b9dd9c11ab5799a1676049ced6634a5d7d42002b`.
  It supersedes RC5 after the RC6 strict gate found that TTL expiry did not
  account for every registered derivative. Build 5 adds the governed derivative
  ledger and keeps all 22 native Swift source and test files byte-identical to
  build 4; the build number is the only behavior-neutral native project change.
- The native and backend path now completes the shared governed chain:

  ```text
  explicit relationship scope + reviewed selected text
  → POST /v1/resource-captures
  → GET /v1/resources/:id for evidence IDs
  → POST /v1/pursuits/:id/agent-tasks
  → bounded Run + no_action or Decision Bundle
  → canonical Pursuit Receipt
  → Action Center exact-object readback
  ```

- Relationship scope selection and source-author attribution are separate
  reviews. Submission stays disabled until both are explicitly confirmed.
- The system window route uses the macOS single-window picker, captures one
  still, performs local Vision OCR, and exposes redaction, removal, retention,
  local-only, and upload-boundary controls before submission.
- Encrypted local recovery is account-partitioned, excluded from backup, and
  covered for expiry, clear, sign-out, corruption, account A → B → A, and
  settlement deletion. Pause, stop, and clear have distinct receipts.
- Native verification and the focused notification privacy test pass for build
  5, while four live-only tests passed against a fresh loopback backend with
  zero failures or skips. The complete backend check passes 215 backend tests,
  49 Agent tests, runtime evaluations, failure-boundary checks, and 30/30 Agent
  control-plane deterministic trials.
- The live proposal path proves one applied canonical Receipt, Pursuit revision
  `1 → 2`, `external_effects: []`, exactly one review POST after deliberate
  response loss, and zero action-completion POSTs. Revocation after preview
  produces no review Receipt and no destination write.
- RC7 projects revoked or TTL-expired Artifact authority as Task
  `needs_rebase` for every
  client, maps the native decision attempt to a refresh-required state, and
  proves after backend relaunch that source access is purged, no supported
  fragments or claims remain, and an earlier submitted Run cannot gain
  evidence from a later Capsule version.
- The Web pursuit workspace directly rendered the Mac-created Task, exact
  version-two evidence, Task revision `2`, intentional `no_action`, and zero
  external effects.
- Manual capture deletion redacts Agent control-plane derivatives and returns a
  content-removal versus audit-reference-retention ledger. TTL expiry now
  performs the same governed inventory across the current Mac flow: the RC7
  proof records 43 unique entity dispositions across 25 types, includes all
  four allowed disposition classes, scans 93 public base tables for a unique
  private sentinel with zero matching rows, and returns the identical ledger
  after backend process restart. Source-review completion remains distinct and
  does not prematurely delete reviewed evidence.
- The build 5 frozen target has no system-notification delivery API. A focused native
  test injects a private notification canary and candidate compensation text,
  then proves the generic Menu Bar copy contains neither.
- Direct build 4 frozen-Release recordings cover keyboard-only traversal, an actual
  VoiceOver Caption Panel focused on a decision whose label orders identity,
  relationship, claim, uncertainty, evidence, consequence, and choice,
  Reduced Motion, 200 percent text, window lifecycle, relaunch,
  pause/resume/stop/delete, failure recovery, outcome reconciliation, identity
  ambiguity, and exact Action Center readback. They support build 5 native UI
  claims only because a path-aware hash proves every Mac Swift source and test
  file is identical; no recording is relabeled as build 5.
- The macOS XCTest UI runner could not establish its host connection on this
  machine. No UI assertion from that attempt is counted as passed; the compiled
  target plus real Release interaction and accessibility evidence are the
  truthful substitute.
- RC5 is an unsigned local verification build. Signing, hardened runtime,
  notarization, privacy declaration review, and external distribution remain a
  later distribution gate.
- The working tree contains unrelated user changes in iOS, Web, documentation,
  and Live Activity evaluation artifacts. This work owns only new macOS,
  macOS-evaluation, macOS-script, root-script, and these plan artifacts unless a
  separately recorded contract change becomes necessary.

## Design and implementation decision

Primary surface: desktop knowledge workspace.

User question: “For this exact selected work, what changed in this Pursuit,
what supports that judgment, and what is the one safe decision I can make now?”

Canonical entities: Account, Pursuit, Person, Relationship Context, governed
Resource and Evidence, Task, Proposal, Action, and Receipt.

Views and projections: Context Capsule, Quick Panel, Agent response,
Relationship Workspace composition, Menu Bar state, and Action Center.

Attention order:

1. selected scope and identity;
2. exact included evidence and local/shared boundary;
3. one change or dependency;
4. the independent decision;
5. receipt, recovery, and history.

Use a separate native app with platform-specific presentation and storage. Do
not embed the entire iOS target through Catalyst and do not grant an embedded
renderer a generic native tool bridge. The first implementation may reuse
handwritten URLSession contract models, but canonical success appears only
after authenticated account-scoped readback agrees.

## Experience score contract

The requested 95-point bar is applied independently:

- product experience: at least 95, plus no product-boundary or recruiter-value
  veto;
- user experience: at least 95, plus no inaccessible consequential path;
- technical experience: at least 95, plus no identity, privacy, deletion,
  unauthorized-write, false-success, or recovery veto.

Scores are atomic requirement accounting, not a cross-domain average. Every
item needs a reproducible evidence locator. Missing or indirect evidence earns
no completion credit. Independent reviewer rubric scores remain separate and
must be 4/4 with direct confidence for the frozen release candidate; they are
not converted into the 95-point scores.

## Milestones

### 1. Native trust shell and deterministic states — complete

- create the isolated XcodeGen macOS project and check script;
- implement Menu Bar, Quick Panel, Capsule review, Relationship Workspace, and
  Action Center;
- implement local-only text and file intake with visible synthetic test mode;
- cover empty, working, ambiguity, `no_action`, decision, failure, unknown,
  stale, deleted, dark, reduced-motion, keyboard, and mixed-script states;
- prove no prohibited entitlement or permission exists.

Exit evidence: clean build, unit/UI tests, entitlements inspection, real
screenshots, and no fixture state presented as canonical readback.

### 2. Shared-backend governed vertical slice — complete

- authenticate against a loopback seeded backend for deterministic E2E;
- list and select one existing Pursuit and confirmed candidate role;
- bind the exact existing relationship context without silent selection;
- submit reviewed selected text as one governed resource capture;
- read back the resource and exact evidence fragment IDs;
- create and poll one governed Pursuit Agent Task;
- render a grounded Artifact, `no_action`, clarification, or Proposal;
- resolve one decision bundle and verify the matching Pursuit Receipt;
- keep external effects empty.

Exit evidence: fresh database, one stable operation chain, shared Mac and Web or
iOS readback, response-loss recovery, cross-account denial, and deletion-driven
staleness.

### 3. System-selected window and durable local Capsule — complete

- add the system content picker and one-shot screenshot only after explicit
  `Add window` intent;
- locally OCR the selected image and show exact aperture and redaction;
- encrypt account-partitioned Capsule recovery, exclude it from backup, and
  enforce TTL, clear, expiry, sign-out, and derivative deletion receipts;
- ensure editing a submitted Capsule creates a new immutable task version.

Exit evidence: permission readback, no background stream, relaunch recovery,
expiry, clear, and deletion tests from the real app.

### 4. Frozen E2E and 95-point deterministic gate — complete

- run required normal, ambiguity, no-action, stale, wrong-identity,
  third-party-data, availability-not-consent, timeout, revoked-permission,
  prohibited-score, keyboard, VoiceOver, reduced-motion, and deletion cases;
- freeze build identity, environment, checks, recordings, screenshots,
  entitlements, database readback, and requirement trace;
- make all three score categories reach at least 95 with no active veto.

Exit evidence: the versioned validator passes against the frozen bundle, not a
working-tree inference.

### 5. Independent panel and iteration — active

- issue the same frozen artifact and scenario independently to
  `recruiter-workflow-reviewer` and `evidence-safety-reviewer`;
- add `candidate-experience-guardrail` when a candidate-facing draft is in the
  frozen journey;
- validate packets, adjudicate by domain jurisdiction, and preserve all vetoes;
- fix and retest affected reviewers without exposing prior reviewer opinions;
- run a small real-recruiter study before claiming field usefulness.

Exit evidence: contract-valid independent packets with direct confidence and
4/4 scores, no active veto, a valid panel result, and the field-evidence gaps
stated without inflation.

## Reconsideration signals

- native lifecycle or distribution cost does not improve capture trust or
  frequency;
- Capsule review costs more than the relationship reconstruction it replaces;
- selected text cannot be bound safely without broad collection;
- the backend path forces task-only context to become durable Evidence against
  the user's selected memory posture;
- reviewers cannot reproduce the same artifact or direct evidence;
- a numeric score rises while a safety or accessibility gate remains active;
- recruiters prefer browser or iOS capture for the same real episodes.
