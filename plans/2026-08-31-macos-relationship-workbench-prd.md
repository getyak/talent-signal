# Talent Signal macOS Relationship Workbench PRD

- Status: proposed product requirements; not canonical product truth
- Date: 2026-08-31
- Primary surface: desktop knowledge workspace
- Initial audience: independent recruiters and boutique or executive-search
  teams doing relationship-dense work on a Mac
- Product question: how can a recruiter turn the exact work in front of them
  into one evidence-backed relationship decision and one safe next step without
  rebuilding context or granting ambient access?

## Executive decision

Talent Signal for macOS should not be a larger mobile chat surface. It should
be the desktop context and action shell around the existing Pursuit-centered
relationship system.

The core loop is:

```text
current work
→ recruiter chooses context
→ Context Capsule preview
→ scoped Agent task and first read
→ fact or action Proposal, or no_action
→ recruiter decision
→ controlled internal action or local handoff
→ canonical Receipt and readback
→ continued reasoning or proposed governed memory
```

The Mac app does not become a second brain. `Pursuit`, stable `Person`
identity, governed Evidence, reviewed temporal state, `Task`, `Proposal`,
`Action`, and `Receipt` keep their existing ownership. A Context Capsule is a
temporary, purpose-bound context manifest for one task. It is not Evidence,
confirmed state, memory, or execution authority.

## Concept translation

This PRD intentionally translates the proposed Ailoha desktop shell into
Talent Signal's existing governed relationship system instead of introducing a
parallel product vocabulary.

| Proposed shell concept | Talent Signal meaning |
| --- | --- |
| current work | the recruiter-facing source currently in view, such as email, Slack, browser research, notes, or a role brief |
| user chooses context | explicit capture through selection, share, drag and drop, file picker, screenshot, or user-chosen window |
| Context Capsule | the recruiter-reviewed context manifest for one Task version |
| first judgment | one evidence-backed read of the current Pursuit, Person, gap, or dependency |
| action proposal | a governed `Proposal` bound to the affected object, or intentional `no_action` |
| user confirms | separate fact review, identity review, or action approval depending on consequence |
| local or cloud execution | a typed internal action, local draft handoff, or later admitted exact-effect executor |
| real receipt | canonical `Receipt` plus readback and observable outcome state |
| continue thinking | a follow-up Task, Artifact, or proposed governed source or memory, never silent memory promotion |

The product difference is therefore not "chat on Mac." It is that desktop
capture, review, approval, execution, and recovery become first-class shells
around one existing relationship truth.

The proposed product shape is a native SwiftUI and AppKit host around reusable
relationship-workspace content. Native code owns menu-bar presence, windows,
system entry points, permission state, local processing, file access, and
device actions. Reused Web or shared renderer content owns deep governed
review only through typed authenticated contracts. No arbitrary JavaScript to
native tool bridge is permitted.

## Why Talent Signal should exist on the Mac

Recruiters already perform the highest-context parts of relationship work on
desktop: email and messaging, browser research, documents, call preparation,
candidate comparison, client updates, ATS work, and follow-up drafting. The
cost is not a lack of another place to chat. It is the repeated reconstruction
of who this concerns, what changed, which source supports it, what remains
uncertain, and what can safely happen next.

The Mac advantage is therefore:

- accepting one recruiter-chosen aperture from the current work surface;
- compiling only that aperture with the relevant governed Pursuit context;
- keeping the affected person, evidence, change, and decision visible together;
- returning one small proposal or an intentional `no_action`;
- making permissions, retention, approval, recovery, and receipts ordinary UI.

This extends the accepted desktop relationship editor rather than replacing it
with a command center.

## Product defaults

These defaults are accepted for this PRD but remain falsifiable through field
evidence:

1. The first user is an independent recruiter or boutique-search operator with
   a high active-relationship load, not every Mac owner.
2. Capture is manual by default. Structured product events may create a soft
   prompt later, but the app does not monitor the environment continuously.
3. Raw window images and audio remain local by default and use a short TTL.
   Only the recruiter-visible selection or reviewed derivative enters a
   shared Agent task.
4. The first complete effect is an internal governed action or a local draft
   handoff. The MVP does not claim that a message, meeting, Contact, ATS, or CRM
   destination changed.
5. Local models are replaceable optimizations for OCR cleanup, redaction, and
   light classification. Product correctness cannot depend on their
   availability.

## Design read

The primary surface is a desktop knowledge workspace for a time-constrained
recruiter moving between live conversations and governed relationship state.

The visual character is a quiet professional notebook with the precision of an
evidence instrument: warm neutral canvas, deep ink, scarce vermilion at the
evidence-to-change seam, native Mac material only where it explains window or
permission behavior, low motion, and medium information density.

The interface should feel:

- immediate at capture;
- editorial during interpretation;
- exact at review;
- deliberately slower at consequence;
- calm and inspectable during failure or recovery.

Visual weight ranks work attention, never a person. Large type, elevation,
glass, color, and animation remain scarce. Exact evidence stays one step from
every decision-relevant claim.

## One product, five surfaces

| Surface | User question | Product role | Authority boundary |
| --- | --- | --- | --- |
| Menu Bar Presence | Is Talent Signal seeing or doing anything now? | Shows idle, active capture, running Task, pending decision, failure, pause, stop, and clear | Status and control only; never displays private source content or confirms work |
| Quick Panel | What does this selected work mean for this relationship? | Global-shortcut entry for selected text, shared content, file, URL, screenshot, or chosen window | Builds a Capsule and starts a scoped Task; it cannot confirm facts or execute external effects |
| Relationship Workspace | What changed, what supports it, and what should I decide? | Persistent Agent surface beside the selected Pursuit and living person page | Governed objects own review and state; conversation owns intent, not truth |
| Action Center | Which decisions or effects need attention or recovery? | A projection of Proposals, approvals, Runs, Receipts, failures, unknown outcomes, and expiry | Routes to the exact affected object and decision gate; it is not a parallel action record |
| System Entries | How can I hand this exact item to Talent Signal without changing apps? | Share Extension, Services, Finder or file picker, drag and drop, browser extension, App Intents, Shortcuts, and Spotlight | Entry adapters accept only user-selected input and cannot skip Capsule review |

### Menu Bar Presence

The menu-bar item remains available while the main workspace is closed. Its
label and icon communicate state with text or shape as well as color:

- `Idle`: no active capture or run;
- `Reviewing context`: a Capsule is open but not submitted;
- `Working`: one or more authorized Tasks are active;
- `Needs decision`: a Proposal or outcome recovery needs the recruiter;
- `Session active`: an explicit bounded capture session is running;
- `Paused`: no new local context can be added;
- `Failed` or `Outcome unknown`: recovery is available.

The menu contains `Open Quick Panel`, `Open Workspace`, `Open Action Center`,
`Pause context intake`, `Stop session`, and `Clear local context`. A clear
operation names what will be deleted and returns a local deletion receipt.

No candidate name, message excerpt, meeting title, or company-sensitive detail
appears in the menu bar, Dock badge, lock-screen notification, or generic
notification preview.

### Quick Panel

The Quick Panel is a compact intent threshold, not an empty chatbot. It opens
from a configurable global shortcut or explicit system entry and has three
progressive regions:

1. **Scope** — current account, optional Pursuit and Person, and the user-stated
   purpose.
2. **Context** — the Capsule items the recruiter explicitly added, with remove,
   crop, redact, local-only, and retention controls.
3. **Ask** — a plain-language question or one of a small number of task starts,
   such as `What changed?`, `Prepare me`, `Draft a response`, or `Find the
   unresolved dependency`.

Opening the panel does not capture the current window. Knowing the foreground
app may help label an empty scope, but reading its contents requires a separate
`Add current window` choice and a system-mediated selection flow.

The first useful answer must lead with one supported change or dependency. It
shows exact available source fragments, visible ambiguity, current owned work,
and one Proposal or `no_action`. Broad analysis remains progressive disclosure.

### Relationship Workspace

The main window keeps the accepted relationship-editor composition:

- a narrow global rail for Today, Pursuits, People, Sessions, and Action Center;
- a persistent Agent surface bound to one Pursuit and affected Person;
- the governed Pursuit room or living person page as the main reading surface;
- a temporary evidence, comparison, or exact-effect inspector when a decision
  requires it.

A pending Proposal moves focus to the exact fact or action gate on the governed
object. It does not strand the user in chat or replace the page with a generic
approval queue. Complex research, identity conflict, merge review, and source
comparison may open a denser temporary workspace, but ordinary work retains one
relationship, one meaningful change, and one calm next step.

### Action Center

Action Center is an attention and recovery projection over canonical objects.
It groups work by consequence and state:

- facts or source bindings awaiting review;
- internal actions awaiting an owner decision;
- exact device or external effects awaiting separate approval;
- active execution with a visible stop path where supported;
- verified Receipts;
- failed, unknown, stale, expired, superseded, or reversible results.

Each row names the affected Pursuit or Person, consequence, current authority,
age, and next safe operation. Opening it lands on the current canonical object,
not a cached approval sheet. Batch approval is unavailable for identity,
deadlines, source retention, message content, calendar changes, Contacts, ATS,
CRM, deletion, or merges.

### System Entries

MVP system entries are:

- Share Extension for user-selected text, links, images, and attachments;
- browser extension handoff for selected DOM text, URL, and visible provenance;
- drag and drop plus standard file selection;
- user-selected screenshot or window through the system picker;
- App Intent or Shortcut that opens the same foreground Capsule review;
- Finder or Services entry where the platform supplies the selected item.

Spotlight may find and open a Person, Pursuit, Session, or pending review, but
search results must not expose private excerpts. App Intents expose navigation,
capture handoff, and typed draft operations; discovery never grants data or
effect authority.

## Context Capsule contract

### Definition

A Context Capsule is the complete, recruiter-visible manifest of context made
available to one task version. It answers:

- what the recruiter selected;
- where it came from and how it was acquired;
- what local preprocessing or redaction changed;
- what may leave the Mac;
- how long raw and derived material remains available;
- which Pursuit, Person, relationship, purpose, and account may use it;
- which exact version the Agent saw.

It does not answer what is true about a person and cannot authorize an action.

### Minimum fields

| Field group | Required content |
| --- | --- |
| Identity | Capsule ID, account or workspace, creator, created time, version, and idempotency key |
| Purpose | User objective, eligible task definition, optional Pursuit, optional Person, and relationship scope |
| Source | Kind, display name, originating app or URL where allowed, acquisition method, capture time, and source version or fingerprint |
| Content boundary | Selected text or asset reference, included regions, exclusions, redactions, speaker or time ambiguity, and sensitivity label |
| Processing | Local processors and versions, derived content, upload status, provider eligibility, and content identity |
| Retention | Raw local TTL, shared derivative TTL or governed retention proposal, deletion state, and an exhaustive derivative registry with one disposition per registered entity |
| Memory posture | `task_only`, `propose_governed_source`, or `do_not_retain`; never `remember automatically` |
| Authority | Current permission status, authorization scope, expiry, and immutable context-manifest reference after Task submission |

### Lifecycle

```text
draft
→ locally prepared
→ recruiter reviewed
→ submitted as immutable task context
→ active or partially available
→ expired, revoked, or deleted
```

Editing a submitted Capsule creates a new task version. A running Task cannot
silently gain newly captured context. Removing an item retracts it from future
task versions and invalidates dependent draft claims; it does not rewrite an
already recorded historical Receipt.

Raw context defaults to deletion when the task finishes, with a proposed
24-hour crash-recovery ceiling. The exact ceiling is a launch decision and must
be tested with recruiters before becoming canonical retention policy. Promoting
a fragment to durable Evidence requires an explicit source or fact Proposal,
retention disclosure, identity and Pursuit review, and canonical readback.

TTL expiry is a governed deletion boundary, not only a source-row flag. When a
retention deadline elapses, the control plane must inventory every registered
derivative reachable from the capture, remove private source content, revoke
evidence authority, preserve only purpose-required audit references or already
confirmed structured state, and persist exactly one disposition for each
entity. Allowed dispositions are `content_purged`, `access_revoked`,
`audit_reference_retained`, and `confirmed_state_retained`. The receipt remains
readable after process restart and must not contain the removed private
content. Merely completing source review does not trigger this full derivative
purge; it only releases transient transport material under the existing intake
contract.

## Capture ladder and excluded defaults

Talent Signal on macOS expands context intake only through explicit user trust.
The default posture is to start narrow and open broader capture only when the
user can see the boundary, stop it, and predict what may leave the device.

### L0 explicit capture

Default entry points are explicit and one-shot:

- paste or typed text;
- drag and drop;
- file picker;
- Share Extension or Services handoff;
- browser-extension selected text or URL handoff;
- recruiter-initiated push-to-talk or screenshot selection.

Every L0 entry creates an acquisition receipt and a visible Capsule item before
submission.

### L1 current-surface context

The app may know which foreground app is active so the recruiter can orient the
capture, but it does not read contents until the recruiter chooses `Add current
window`, `Add selected page context`, or an equivalent bounded command.

Browser and typed app adapters are preferred because they can preserve DOM,
URL, selected text, and provenance with less unrelated capture than a raw
screenshot.

### L2 bounded session

A bounded session is a recruiter-started mode such as preparation, meeting, or
follow-up review. It is scoped to named windows, displays, files, or later
admitted audio sources; it shows a persistent active indicator in the menu bar;
and it always exposes `Pause`, `Stop`, and `Clear local context`.

The MVP does not admit microphone or system audio, but the session contract is
reserved here because later meeting support must inherit the same visible
boundaries rather than invent a second capture model.

### L3 soft prompts only

Later product activity may create a soft prompt from structured product events,
such as an owned reminder becoming due or a recruiter-started task completing.
Soft prompts may suggest resuming work, but they do not capture content or
start a session by themselves.

Inbound ambient monitoring of calendar, screen, audio, clipboard, or input is
not an MVP mechanism for proactive value.

### Excluded defaults

The Mac app must not, by default:

- poll the clipboard;
- request Full Disk Access;
- run continuous background screen or audio capture;
- record keystrokes or pointer input;
- capture password managers, payment flows, private-browsing windows where
  detectable, system-auth sheets, or secure text fields;
- promote incidental captured content into durable memory automatically.

When a later release proposes any broader capture surface, it must explain the
new user value, narrower admitted boundary, permission posture, retention
change, and stop or deletion controls in the same PRD update.

## Primary journeys

### Journey A: selected conversation to relationship decision

1. The recruiter selects text in email, a browser, a document, or a supported
   messaging surface and invokes Talent Signal.
2. Quick Panel shows the selected text, origin, purpose, upload boundary,
   retention, and any redaction.
3. The recruiter binds a Pursuit and Person, chooses from supported current or
   historical identity clues without preselection, or saves the Capsule with
   identity unresolved.
4. The Agent reads the immutable Capsule plus the smallest currently authorized
   Pursuit context.
5. The first response shows one meaningful change or dependency, exact source
   support, current ambiguity, and existing owned action if one already exists.
6. The system stages one fact Proposal, one action Proposal, or `no_action`.
7. Fact confirmation occurs on the affected object. It does not authorize the
   action.
8. The recruiter separately approves an internal reminder or local response
   draft. The MVP may copy or hand off the draft, but it does not claim delivery.
9. Talent Signal returns a canonical Receipt and readback, then offers to
   continue reasoning or stage a governed-source proposal.

### Journey B: file or window to brief

1. The recruiter drags a role brief, CV, note, or other supported file, or
   chooses one window through the system picker.
2. Local processing extracts text and detects likely secrets or unrelated
   personal content. The recruiter sees and edits the exact aperture.
3. The Capsule preview distinguishes source content, recognized text,
   redactions, and unsupported interpretation.
4. The Agent produces a snapshot-bound brief tied to one Pursuit, with exact
   citations and an `insufficient evidence` state where appropriate.
5. Saving the brief creates an Artifact. It does not create confirmed candidate
   state or memory.

### Journey C: action recovery

1. Action Center shows an operation as `failed` or `outcome unknown`.
2. The recruiter opens the current canonical object and sees target, intended
   change, prior approval, attempt, idempotency key, and observable destination
   evidence.
3. Readback reconciles the same operation before retry is enabled.
4. Retry reuses the stable operation intent and cannot create a duplicate.
5. A verified Receipt or an explicit unresolved outcome closes the current
   attempt without inventing success.

### Later gated journey: meeting loop

The full before, during, and after meeting loop is a high-value hypothesis, not
an MVP entitlement:

- **Before:** a user-selected event or explicit event handoff can compile a
  Pursuit and relationship brief.
- **During:** the recruiter starts a bounded session, chooses the window or
  audio sources, sees a persistent recording indicator, and can stop from the
  menu bar.
- **After:** local segmentation and transcription produce inspectable evidence,
  then the ordinary fact and action review gates apply.

Inbound Calendar monitoring, microphone or system-audio capture, and session
retention require separate user evidence, provider and regional posture, and a
change to the current outbound-only Calendar integration decision.

## Capability and effect governance

The PRD maps desktop actions to the existing capability boundary instead of
inventing a model-owned computer-control layer.

| Effect class | Examples | Decision rule |
| --- | --- | --- |
| E0 scoped read | Read included Capsule items or authorized Pursuit state | Allowed inside the immutable task scope; every item remains attributable |
| E1 local reversible | Create a draft Artifact, copy reviewed text, export to a user-selected file, snooze local attention | Visible result and undo or deletion where the platform permits |
| E2 canonical relationship change | Attach Evidence, confirm a fact, update a scoped relationship state, resolve identity | Exact before and after diff plus the independent fact or identity decision |
| E3 device or external effect | Create or change Calendar, Contacts, ATS, CRM, or communication | Exact current target and payload approval, stale-state recheck, typed executor, idempotency, observation, and Receipt |
| E4 unsupported or prohibited | Unverifiable send, irreversible automation, candidate ranking, protected-trait inference, generic production shell or browser control | Refuse automation and provide a truthful manual handoff when safe |

Execution preference is:

```text
official typed API or App Intent
→ app-specific adapter or browser extension
→ explicitly approved Accessibility adapter in a later release
→ unsupported or manual handoff
```

The MVP does not request Accessibility, Automation, Input Monitoring, or Full
Disk Access. A later Accessibility adapter must accept a deterministic,
single-purpose Action Plan, display the target app and intended steps, stop on
unexpected state, expose an emergency stop, and verify the destination. The
Agent never receives an unrestricted click, type, shell, or browser tool over
candidate data.

## Permission model

Permissions are requested at the moment a feature needs them, never as a broad
onboarding checklist.

| Capability | MVP posture | User-visible rule |
| --- | --- | --- |
| Foreground app metadata | May label current app without reading content | `You are in Mail` is not presented as permission to read Mail |
| Selected text, URL, or attachment | Explicit system share or browser-extension gesture | Preview before submission; remove any item |
| Files and folders | Standard picker, drop, or security-scoped selected item | No directory crawl or Full Disk Access |
| Window or screen | System picker after `Add current window` | No background polling; show selected target and active state |
| Microphone or system audio | Out of MVP | Explicit bounded session, persistent indicator, separate permission, and stop path if later admitted |
| Accessibility or Automation | Out of MVP | Requested only for one admitted adapter after typed APIs fail |
| Input Monitoring | Prohibited | Talent Signal never records keystrokes or pointer input |
| Clipboard | No polling | The app may write a recruiter-approved draft or read content pasted by the recruiter |
| Notifications | Generic by default | No private excerpts, candidate names, or meeting content on the lock screen |

The default exclusion policy blocks password managers, banking and payment
surfaces, private-browsing windows where detectable, system permission sheets,
authentication prompts, and secure text fields. If an exclusion cannot be
reliably detected, the user must still choose the exact aperture and the
preview must make accidental content removable before submission.

Apple exposes Full Disk Access, Accessibility, Automation, Input Monitoring,
Microphone, and Screen & System Audio Recording as distinct privacy controls.
The product mirrors those distinctions rather than collapsing them into
`computer access`. See [Apple Privacy & Security settings](https://support.apple.com/guide/mac-help/change-privacy-security-settings-on-mac-mchl211c911f/mac).

## System architecture

```text
Native macOS shell
  Menu Bar · Quick Panel · system entries · permissions · local TTL
                    │
                    ▼
Local Context Broker
  OCR · extraction cleanup · redaction · dedupe · Capsule compiler
                    │ immutable manifest and reviewed derivatives
                    ▼
Shared Talent Signal control plane
  account · Pursuit · Person · Evidence · Task · Proposal · Action · Receipt
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
Bounded Agent runtime     Governed effect executor
first read · Artifact     typed capability · idempotency · observation
```

### Native shell

The native shell owns platform trust: application lifecycle, menu-bar state,
global shortcut, windows and panels, system pickers, local encrypted storage,
file coordination, permission readback, capture indicators, App Intents, and
device-owned effects. Apple documents persistent menu-bar scenes through
[`MenuBarExtra`](https://developer.apple.com/documentation/swiftui/menubarextra),
foreground application metadata through
[`NSWorkspace`](https://developer.apple.com/documentation/appkit/nsworkspace),
user-facing content handoff through
[`Share Extension`](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/Share.html),
window or display capture through
[`ScreenCaptureKit`](https://developer.apple.com/documentation/screencapturekit),
and system-visible typed actions through
[`App Intents`](https://developer.apple.com/documentation/appintents).

### Local Context Broker

The broker is deterministic infrastructure, not a second Agent. It:

- accepts only explicit entry receipts;
- stores raw local context in a protected, account-partitioned container;
- performs OCR, text normalization, secret and sensitive-content detection,
  redaction, and duplicate checks;
- compiles the Capsule shown to the recruiter;
- uploads only reviewed derivatives eligible for the selected provider;
- enforces TTL, revocation, deletion, and exhaustive derivative accounting;
- creates no Person, fact, memory, Proposal, or external effect.

Apple Foundation Models may be one local processor when supported, but its
availability, locale, device eligibility, and model version are capability
inputs rather than product assumptions. See
[`Foundation Models`](https://developer.apple.com/documentation/foundationmodels).

### Shared control plane and Agent

The existing account, Pursuit, Person, Evidence, Proposal, Action, Task, Run,
Artifact, context-manifest, and Receipt contracts remain authoritative. The Mac
client submits a reviewed immutable context manifest and typed objective. The
Agent receives only eligible scoped reads and artifact or Proposal tools.

The first response must reconcile canonical work in the selected Pursuit. If a
matching open action or evidence-backed gap already exists, it cites and opens
that object instead of creating duplicate work. A response restored after
authorization or source change is stale until a fresh Task revalidates its
context.

### Effect executor

Only deterministic executors receive an approved effect. Typed APIs, App
Intents, and app-specific adapters are preferred. Accessibility APIs are a
high-permission control path and remain outside MVP even though macOS exposes
them through
[`AXUIElement`](https://developer.apple.com/documentation/applicationservices/axuielement_h).

An executor returns attempt, target, result, observation, and recovery data.
The model saying an operation succeeded is never a Receipt.

## Functional requirements

### Foundation

| ID | Priority | Requirement | Acceptance evidence |
| --- | --- | --- | --- |
| `MAC-FND-001` | Must | Ship one native app shell with Menu Bar, Quick Panel, main workspace, and Action Center entry | The main window may close while status and explicit controls remain available; quitting ends local activity |
| `MAC-FND-002` | Must | Reuse the shared account, Pursuit, Person, Evidence, Task, Proposal, Action, and Receipt contracts | A Mac-created task and result read back correctly on Web or iOS without a Mac-owned canonical record |
| `MAC-FND-003` | Must | Keep native capability calls behind a typed, allowlisted bridge | Renderer content cannot invoke arbitrary file, shell, browser, permission, or external-write operations |
| `MAC-FND-004` | Must | Partition local state by verified account and exclude sensitive recovery state from backups | Account switching, sign-out, relaunch, and deletion tests reveal no prior workspace content |

### Capture and Context Capsule

| ID | Priority | Requirement | Acceptance evidence |
| --- | --- | --- | --- |
| `MAC-CAP-001` | Must | Accept selected text, URL, attachment, drag or picked file, screenshot, and user-chosen window through explicit entry | Opening Quick Panel alone captures no content; each included item has an acquisition receipt |
| `MAC-CAP-002` | Must | Show a complete Capsule preview before any private derivative is submitted | The recruiter can remove, crop, redact, mark local-only, inspect retention, and cancel with no shared task |
| `MAC-CAP-003` | Must | Bind purpose and optional Pursuit or Person without silent identity selection | Ambiguous or historical clues have no default; unresolved is a valid terminal state |
| `MAC-CAP-004` | Must | Pin the submitted Capsule as an immutable task context manifest | Editing context creates a new task version and the old Run cannot read added content |
| `MAC-CAP-005` | Must | Enforce raw local TTL, manual clear, source revocation, and exhaustive derivative deletion accounting | Relaunch, expiry, clear, partial deletion, and recovery produce truthful local and canonical receipts; each registered derivative has exactly one persisted disposition and a private-sentinel scan across every public base table returns zero rows |
| `MAC-CAP-006` | Should | Detect likely secrets, secure surfaces, unrelated participants, and unsupported speaker or time attribution | Detection remains reviewable, false positives are removable, and no detector silently creates fact state |

### Agent and relationship decision

| ID | Priority | Requirement | Acceptance evidence |
| --- | --- | --- | --- |
| `MAC-AGT-001` | Must | Start a bounded Task with account, purpose, Pursuit or subject, Capsule version, time, retention, budget, and eligible capabilities | Run history reconstructs exactly what the Agent could know and spend without storing an unbounded transcript |
| `MAC-AGT-002` | Must | Lead the first response with one supported change or dependency | Every material claim opens an exact currently authorized fragment; unsupported claims are quarantined |
| `MAC-AGT-003` | Must | Return one fact Proposal, one action Proposal, an Artifact, a clarification, or `no_action` | No response silently confirms a fact, attaches identity, changes memory, or executes an effect |
| `MAC-AGT-004` | Must | Reconcile existing Pursuit gaps and actions before staging new work | Existing owner, due time, and close condition appear without a duplicate action |
| `MAC-AGT-005` | Must | Make ambiguity, stale context, unavailable evidence, cancellation, budget stop, and failure ordinary terminal states | Each state has one safe next operation and no false success presentation |

### Review, action, and receipt

| ID | Priority | Requirement | Acceptance evidence |
| --- | --- | --- | --- |
| `MAC-ACT-001` | Must | Keep fact confirmation, action approval, and outcome verification as independent decisions | Confirming a fact exposes no implied permission to draft, copy, schedule, send, or update another system |
| `MAC-ACT-002` | Must | Render exact before and after state plus provenance on the affected object | Proposed, edited, confirmed, dismissed, expired, contested, and superseded remain distinguishable without color alone |
| `MAC-ACT-003` | Must | Support one internal governed action and one local draft handoff in MVP | Canonical readback proves the internal action; the handoff Receipt says `prepared` or `copied`, never `sent` |
| `MAC-ACT-004` | Must | Project pending, active, verified, failed, unknown, stale, and reversible work in Action Center | Opening any item resolves current canonical authority before enabling a decision or retry |
| `MAC-ACT-005` | Must | Make execution idempotent and reconcile unknown outcomes before retry | Response loss, relaunch, double click, timeout, and changed target create no duplicate operation |
| `MAC-ACT-006` | Later | Admit one typed Calendar, Contacts, ATS, CRM, or message effect only after separate effect proof | The destination object is independently observed and a matching Receipt survives readback and deletion policy |

### Trust and accessibility

| ID | Priority | Requirement | Acceptance evidence |
| --- | --- | --- | --- |
| `MAC-TRU-001` | Must | Request permissions progressively and never request Accessibility, Automation, Input Monitoring, or Full Disk Access in MVP | Clean-install runtime and entitlements show only capabilities exercised by an explicit feature |
| `MAC-TRU-002` | Must | Keep private content out of generic notifications, menu-bar labels, analytics, logs, crash reports, and task events | Synthetic secret and candidate-name tests find no raw content in those sinks |
| `MAC-TRU-003` | Must | Preserve one-click pause, stop, and clear for every bounded session or local context store | Stop prevents further intake; clear names and verifies each deleted local derivative |
| `MAC-A11Y-001` | Must | Support full keyboard operation, visible focus, VoiceOver names and order, reduced motion, contrast, and zoom | The complete primary journey works without a pointer and at 200 percent zoom with no hidden consequence |
| `MAC-A11Y-002` | Must | Test long and mixed-script names, missing avatars, no tags, three tags, stale evidence, and ambiguous identity | Information order and action meaning remain stable without horizontal scrolling or person-ranking cues |

## Complete state matrix

The surface must design and test, where relevant:

- loading and first launch;
- no account or unavailable workspace;
- empty Capsule and unsupported item;
- local processing, redaction suggested, and redaction failed;
- ready, submitted, stale, expired, revoked, deleting, deleted, and partial
  derivative deletion;
- Task queued, running, waiting for review, cancelled, budget exhausted, failed,
  and complete;
- insufficient evidence, identity ambiguity, speaker ambiguity, time ambiguity,
  and `no_action`;
- Proposal proposed, edited, confirmed, dismissed, expired, contested, and
  superseded;
- action awaiting approval, executing, verified, failed, outcome unknown,
  reversed, and no longer reversible;
- offline, relaunch recovery, response loss, duplicate intent, changed target,
  changed permission, and sign-out during work.

A polished success state must never hide an unverified canonical mutation or
destination effect.

## MVP scope

### Included

- native SwiftUI and AppKit macOS host;
- Menu Bar Presence, configurable global shortcut, Quick Panel, Relationship
  Workspace entry, and Action Center projection;
- Share Extension or system service, browser-extension handoff, drag and drop,
  file picker, screenshot, and user-selected window;
- Context Capsule preview, removal, crop or redaction, local or shared boundary,
  retention disclosure, and short raw TTL;
- local OCR and deterministic Capsule compilation with replaceable local-model
  assistance;
- existing account, Pursuit, Person, Task, context manifest, Proposal, Action,
  Artifact, and Receipt contracts;
- one evidence-backed first response, one Proposal or `no_action`, exact source
  navigation, and stale-context behavior;
- fact review on the governed object;
- one internal action and one local message-draft or brief handoff with truthful
  receipts;
- failure, unknown, retry, expiry, deletion, pause, stop, keyboard, VoiceOver,
  dark, reduced-motion, and zoom states.

### Explicitly excluded

- ambient screenshot, audio, clipboard, keyboard, or application monitoring;
- inbound Calendar monitoring or event-triggered prompts;
- background or continuous screen recording;
- meeting recording or transcription;
- Full Disk Access, Input Monitoring, generic Accessibility automation, or an
  unrestricted computer-use tool;
- automatic source-to-memory promotion;
- automatic identity binding or person merge;
- message send, Calendar, Contacts, ATS, or CRM write;
- arbitrary MCP installation or tool discovery as authority;
- candidate scoring, fit, personality, protected-trait inference, culture fit,
  or acceptance probability;
- a new Mac-only account, memory store, Agent transcript, action queue, or
  canonical database.

## Delivery sequence

### Gate 0: feasibility and trust prototype

- prove native menu-bar and Quick Panel lifecycle;
- prove selected text, file, and system window picker entry without ambient
  capture;
- render Capsule preview, exclusion, redaction, and TTL deletion locally;
- validate Mac App Store versus notarized direct distribution implications;
- test the permission story with synthetic data and five recruiters before
  choosing a minimum macOS version.

Exit when a recruiter can explain exactly what the app saw, what may leave the
Mac, and how to stop or delete it without opening settings documentation.

### Gate 1: complete relationship slice

- connect one Capsule to the existing bounded Task and context-manifest path;
- reuse Pursuit, Person, evidence citation, Proposal, and Receipt readback;
- land review on the affected governed object;
- complete one internal action and local draft handoff;
- freeze end-to-end proof for success, ambiguity, `no_action`, stale state,
  response loss, retry, and deletion.

Exit when the same canonical result appears correctly on Mac and one other
surface, with no second truth owner.

### Gate 2: field validation

- run a consented concierge or prototype trial with independent recruiters;
- compare a generic answer with evidence-first state diff plus one action;
- measure reconstruction time, error discovery, permission willingness,
  Capsule editing cost, and action usefulness;
- test selected-content, pre-meeting preparation, and post-call follow-up as
  separate jobs rather than assuming one combined habit.

Exit when repeated real episodes show that the Mac aperture creates enough
value to justify capture and review cost.

### Gate 3: one external effect

Choose only one typed effect after field evidence identifies the highest-value
repeated destination. Add separate exact-effect approval, stale preview,
idempotency, observation, unknown-result reconciliation, deletion posture, and
real-device proof. Do not admit generic Accessibility automation as a shortcut
around a missing destination contract.

## Success measures

Success is lower reconstruction and safer relationship momentum, not Agent
activity or confirmation volume.

### Workflow measures

- time from explicit invoke to reviewed Capsule;
- time from submission to first evidence-backed value;
- percentage of Tasks that end in a useful Proposal, Artifact, clarification,
  or intentional `no_action`;
- time to find and correct an unsupported fact;
- duplicate-work avoidance when an owned action already exists;
- completion and recovery time for internal actions.

### Trust measures

- incorrect or unreviewed context uploaded: zero release tolerance;
- ambiguous identity that reaches a canonical or external write: zero;
- external effect without exact approval and observation: zero;
- private content in generic logs, analytics, or notifications: zero;
- duplicate execution after retry or response loss: zero;
- deletion or TTL claims without verified derivative accounting: zero;
- recruiter ability to accurately describe current capture and retention state.

### Outcome measures

- reduced time spent reconstructing a relationship before follow-up;
- fewer missed or overdue recruiter-owned commitments;
- higher rate of actions that resolve an evidence-backed dependency;
- fewer irrelevant, premature, or duplicated follow-ups;
- recruiter-reported improvement in communication relevance and confidence;
- no decline in candidate trust or dignity in reviewed episodes.

Confirmation rate alone is not a quality metric. Edit, dismiss, dispute,
reversal, and `no_action` are valuable calibration evidence.

## Release gates

The MVP cannot ship until:

- every Capsule item is recruiter-visible and removable before submission;
- the submitted context manifest exactly matches the rendered Capsule version;
- an excluded or deleted item is denied on later retrieval;
- ambiguous identity cannot bind Evidence, confirm state, or authorize action;
- every material first-read claim opens exact currently authorized evidence;
- fact confirmation, action approval, and outcome verification remain separate;
- response loss and retry reuse one operation intent and do not duplicate work;
- `failed` and `outcome unknown` never render as complete;
- pause, stop, expiry, clear, sign-out, and deletion work after relaunch;
- TTL expiry inventories every registered derivative, persists its disposition,
  removes private source content from supported readbacks and all public base
  tables, and remains stable after backend restart;
- no prohibited permission or entitlement is requested;
- full keyboard, VoiceOver, dark, reduced-motion, long-name, mixed-script,
  ambiguous, offline, and 200-percent zoom proof is frozen from the real app;
- focused unit, integration, backend, renderer, and native UI checks pass;
- `pnpm docs:check` passes and the final review contains no active evidence,
  privacy, external-effect, or person-ranking veto.

### Reference implementation validation

The current implementation candidate is the unsigned local RC7 build
`TalentSignalMac 0.1.0 (5)`, frozen with archive SHA-256
`0101fd702e594d03517d9ac1b9dd9c11ab5799a1676049ced6634a5d7d42002b`.
It is evidence for this PRD, not a change to canonical product truth.

Direct synthetic loopback proof now covers the full explicit Capsule-to-Task
chain, exact decision and Receipt readback, response-loss reconciliation,
revoked-authority refresh, expiry-driven source purge and stale projection
after backend relaunch, immutable Capsule-version isolation, shared Web
readback of a Mac-created Task, generic Menu Bar privacy, direct
frozen-binary VoiceOver decision labels, manual derivative deletion, and
expiry-driven exhaustive derivative accounting. The RC7 TTL proof records 43
entity dispositions across 25 derivative types, scans all 93 public base tables
for a unique private sentinel with zero matching rows, and reads back the same
ledger after backend restart. Build 5's 22 native Swift files are byte-identical
to build 4, so the earlier direct native UI recordings remain admissible only
through the separately hashed source-identity proof. The frozen package remains
an engineering candidate until the independent RC7 panel clears every atomic
requirement and veto. Signing, notarization, App
Store distribution, real-candidate retention operations, and design-partner
frequency evidence remain outside this proof.

## Open decisions and falsifiers

### Decisions required before implementation commitment

- minimum macOS version and supported Apple Intelligence hardware;
- Mac App Store, notarized direct distribution, or a staged combination;
- whether deep workspace content is embedded Web, shared native components, or
  a typed hybrid after accessibility, auth, offline, and update testing;
- exact raw local TTL and crash-recovery ceiling;
- local OCR, redaction, transcription, and model fallback matrix by language;
- whether the local Agent host is bundled, separately managed, or reached only
  through authenticated shared Tasks;
- which single external effect, if any, earns Gate 3;
- whether inbound Calendar access creates enough value to change the current
  outbound-only integration decision.

### Falsifiers

Reconsider or stop the Mac direction if:

- recruiters prefer explicit mobile or browser capture and rarely use a Mac
  aperture during real work;
- Capsule review costs more time than later context reconstruction;
- users cannot predict what will leave the Mac after one onboarding session;
- window or meeting permission willingness is too low for the target jobs;
- the persistent Agent surface reduces evidence reading or accessibility;
- selected context cannot be reliably bound to a Pursuit and Person without
  broad collection;
- the first response behaves like generic summarization rather than resolving a
  current dependency;
- local and cloud execution cannot return independently observable Receipts;
- a native shell adds lifecycle and distribution risk without improving trust,
  capture frequency, or completion.

## Source alignment

This PRD operationalizes, but does not override:

- [Product](../docs/product.md): Pursuit-centered work, stable Person identity,
  one dependency, and one safe action;
- [Design system](../docs/design-system.md): evidence before interpretation,
  control at consequence, and the desktop relationship editor;
- [Capture to action](../docs/capture-to-action.md): intentional capture,
  separate fact and action decisions, controlled effect, and observed outcome;
- [Architecture](../docs/architecture.md): one shared truth, replaceable model
  runtimes, and a governed effect boundary;
- [Agent system](../docs/agent-system.md): immutable Task context, Proposal
  without authority, typed capabilities, and Receipt-based evaluation;
- [Integration boundaries](../docs/integrations.md): explicit adapters,
  minimum access, replaceability, and no connector-owned truth;
- [ADR 0005](../docs/decisions/0005-agent-operated-relationship-workspace.md):
  the Agent beside the governed relationship object, not a command cockpit;
- [Candidate momentum loop](../docs/research/candidate-momentum-loop.md):
  evidence-backed state change, one next action, temporal memory, and no
  autonomous V1 computer control.

The platform feasibility references are Apple documentation for
[`MenuBarExtra`](https://developer.apple.com/documentation/swiftui/menubarextra),
[`NSWorkspace`](https://developer.apple.com/documentation/appkit/nsworkspace),
[`Share Extension`](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/Share.html),
[`ScreenCaptureKit`](https://developer.apple.com/documentation/screencapturekit),
[`App Intents`](https://developer.apple.com/documentation/appintents),
[`Foundation Models`](https://developer.apple.com/documentation/foundationmodels),
[`AXUIElement`](https://developer.apple.com/documentation/applicationservices/axuielement_h),
and [macOS Privacy & Security settings](https://support.apple.com/guide/mac-help/change-privacy-security-settings-on-mac-mchl211c911f/mac).
