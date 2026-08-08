# iOS relationship library design benchmark

Date: 2026-08-07

## Question

What would make Talent Signal's iOS experience feel aesthetically coherent,
useful, and distinctly appropriate for relationship intelligence rather than
like a compressed CRM or a styled AI demo?

This study compares the current Simulator surface with current first-party
product material from adjacent contact, relationship, task, meeting, and CRM
products. It is directional research, not canonical product truth.

## Current-surface finding

The current iOS workbench is strong where the product must be safe:

- capture is explicit and purpose-bound;
- identity, evidence, proposed state, and action remain distinct;
- a human reviews consequential changes;
- the review flow exposes ambiguity, receipt, retry, and recovery.

Its weakness is more fundamental than color or typography. The first screen is
a synthetic product demonstration with a large marketing headline and nested
workflow cards. It does not yet provide a credible daily destination for:

1. finding a person;
2. understanding what changed in that relationship;
3. seeing the one current dependency;
4. choosing a small, reviewable next step.

The consequence is an aesthetic problem produced by information architecture.
The interface looks like it is explaining the product before it lets the
recruiter use it.

## What aesthetic quality means here

An aesthetically strong Talent Signal app should meet eight conditions.

1. **The product object is immediately legible.** A person within a specific
   recruiting relationship is the primary object, not a chat, dashboard, score,
   or generic task.
2. **Visual hierarchy follows evidentiary hierarchy.** Identity, current
   dependency, change, supporting evidence, action, and outcome appear in that
   semantic order.
3. **Material has a job.** Warm paper-like surfaces support reading; the
   restrained vermilion seam joins exact evidence to the state it changed.
   Blur, gradients, and depth do not become decoration.
4. **Progressive disclosure preserves calm.** The list answers why to look;
   the relationship page explains what changed; exact evidence expands only
   when needed.
5. **Native rhythm reduces effort.** Search, bottom navigation, sheets, swipe
   behavior, Dynamic Type, focus order, and tactile response should feel
   expected on iOS without becoming a clone of Apple Contacts.
6. **States are designed, not appended.** Empty, ambiguous, stale, offline,
   retry, recovery, and no-action states receive the same compositional care as
   the happy path.
7. **The signature is causal, not ornamental.** Talent Signal should be
   recognizable by the evidence-to-change seam and quiet editorial density,
   not by generic glass, sparkles, or oversized radii.
8. **Human dignity stays visible.** The product ranks work attention, never
   people, relationship strength, personality, culture fit, or acceptance
   probability.

## Adjacent product comparison

### Mesh, formerly Clay

[Mesh](https://me.sh/) presents a relationship memory with search, reminders,
life updates, a home feed, and native iOS surfaces. Its
[iOS 26 redesign](https://library.me.sh/2025/10/09/ios-and-macos-26/) uses
contact-photo-derived cards and an adaptive Home, People, and Groups tab bar.
[Clay's March 2026 rebrand](https://library.me.sh/2026/03/25/clay-is-now-mesh/)
also confirms that current references should use Mesh.

- Borrow: people as the primary object, native navigation, reminders, and
  photo-responsive identity treatment.
- Do not copy: visual effects as the product signature, ambient surveillance
  as the default premise, or relationship-strength scoring.

### folk

[folk mobile](https://www.folk.app/mobile) prioritizes adding contacts, voice
notes, fast search, and portable relationship context. Its current
[mobile search documentation](https://help.folk.app/en/articles/15178813-contacts-list-search-on-mobile)
starts with All people, distinguishes people and companies, and searches
across contact fields and notes.

- Borrow: search as a home-level action, useful default scope, and one-tap
  capture of relationship context.
- Do not copy: sales-pipeline language, bulk-outreach logic, or closing metrics
  in the person's primary surface.

### Cardhop

[Cardhop](https://flexibits.com/cardhop) combines natural-language contact
actions, smart lists, focus filters, relationship fields, widgets, and
device-local privacy.

- Borrow: low-friction command grammar, focus filters, and relationships that
  remain understandable as fields and lists.
- Do not copy: free-form commands that could bypass evidence review or grouped
  actions that obscure their exact external effect.

### Things

[Things](https://culturedcode.com/things/features/) achieves calm through a
clear object model, paper-like item detail, tucked-away metadata, Quick Find,
Today, and restrained purposeful motion.

- Borrow: progressive disclosure, editorial whitespace, stable Today and
  Library destinations, and continuity between list and detail.
- Do not copy: check-off semantics for a human relationship. A quiet
  relationship is not an incomplete task.

### Granola

[Granola for iOS](https://docs.granola.ai/help-center/ios/getting-started)
deliberately serves in-person and iOS-call capture while keeping advanced work
on desktop.

- Borrow: the discipline to make mobile complementary instead of reproducing
  every desktop capability.
- Do not copy: capture as the only durable mobile destination. Talent Signal
  still needs retrieval and relationship continuity after capture.

### Attio

[Attio mobile](https://attio.com/help/reference/tools-and-extensions/attio-on-mobile)
preserves records, lists, email, calls, notes, tasks, and comments on mobile.

- Borrow: a coherent record model and direct paths from a list to full context.
- Do not copy: desktop CRM breadth, customizable database chrome, or many
  equally weighted activity types on a small screen.

### Dex

[Dex](https://getdex.com/product/) uses contact timelines, reminders, and
groups to support personal relationship follow-through.

- Borrow: visible relationship history and lightweight follow-up cadence.
- Do not copy: guilt-inducing "stay in touch" mechanics or a synthetic measure
  of relationship health.

## Second iteration: quiet Agent and museum composition

The supplied Notion mobile screenshot clarified a useful tension. A nearly
monochrome field, plain document list, and persistent AI affordance create
excellent scanability, but the same screen duplicates navigation, search, AI,
and compose controls while a floating dock covers the bottom of the document
list. It is an effective knowledge-work shell, not yet the right relationship
object model.

### Notion

[Notion search](https://www.notion.com/help/search) brings workspace search and
workspace questions into a familiar retrieval surface, while
[Notion Agents](https://www.notion.com/product/agents) makes permissions, run
history, and reversibility part of Agent operation.

- Borrow: persistent access to find and ask, governed permissions, visible
  history, and reversible Agent work.
- Do not copy: separate search, chat, compose, and AI destinations competing
  for the same mobile attention, or an Agent becoming the canonical record.

### flomo

[flomo](https://flomoapp.com/) deliberately removes formatting, layout, and
classification decisions from capture.
[flomo AI voice](https://help.flomoapp.com/ai/aivoice.html) keeps the original
record available while limiting cleanup to lightweight transcription repair,
and [flomo Agent](https://help.flomoapp.com/ai/agent.html) treats the Agent as
an optional reader of the user's existing notes rather than a setup-heavy
workspace.

- Borrow: one sentence or voice moment, no classification before expression,
  preservation of the raw words, and an Agent that lives quietly beside the
  archive.
- Do not copy: personal-note semantics for governed recruiting evidence or
  silent model-authored changes to confirmed relationship state.

### Raycast

[Raycast AI Extensions](https://manual.raycast.com/ai/ai-extensions) exposes
search, questions, and tool invocation through one command surface while
keeping the invoked capability legible.

- Borrow: one entry for find, ask, and invoke; reveal tools only after intent.
- Do not copy: an opaque command that hides evidence scope or the exact effect
  of a consequential action.

### Japanese museum references

The [MIHO Museum approach](https://www.miho.jp/en/architecture/approach/) uses
a path, tunnel, bridge, understated entrance, and natural light to prepare
attention before the collection. The
[21st Century Museum of Contemporary Art, Kanazawa](https://www.kanazawa21.jp/data_list.php?d=2&g=11)
uses openness, brightness, courtyards, and multiple entrances to make culture
approachable without a monumental front door.

- Borrow: thresholds, calm intervals, hairline boundaries, natural material
  contrast, and more than one understandable entrance.
- Do not copy: treating people as exhibits, imposing a literal gallery map, or
  using empty space that delays routine retrieval.

## What Capture becomes

Capture is removed as a navigation destination. It is not renamed.

Its useful capability becomes **Remember a moment**, one job inside the
contextual Guide and, later, an operating-system share or voice surface:

1. the recruiter writes or speaks one natural sentence;
2. the exact raw words remain visible as user-authored material;
3. the Agent proposes a possible person and relationship context;
4. it asks for at most one missing detail when that detail changes meaning;
5. the result is staged as a draft, with no confirmed state or external action
   changed until human review.

This transformation changes the mental model from filing an artifact to
preserving a meaningful relationship moment with the least possible
administration.

## Third iteration: translucent chrome and object actions

The next critique focused on where navigation material ends and relationship
operations begin. The supplied Notion screenshot demonstrates that a lightly
translucent navigation field can remain present without feeling like a heavy
toolbar. Copying its complete pill language, however, would fragment Talent
Signal into a collection of floating controls and weaken the archive's spatial
calm.

### Material fork

Two rendered material branches were compared:

- **Museum Glass:** status and primary navigation form one continuous
  translucent threshold, while the bottom Guide remains one optical rail.
- **Floating Objects:** brand, navigation, and Guide controls become separate
  translucent islands closer to Notion's mobile composition.

Museum Glass is selected. It keeps the page boundary and navigation hierarchy
legible during deep scroll, uses one continuous optical layer rather than
several grey pills, and leaves the relationship content visually primary.
Floating Objects survives as a desktop study control because it is useful for
testing the boundary where liveliness becomes chrome fragmentation.

The selected material uses backdrop blur, restrained saturation, an upper edge
highlight, and a hairline boundary. It falls back to the opaque pearl surface
when reduced transparency is requested. Translucency remains limited to
navigation and temporary focused menus; evidence and relationship content do
not become glass cards.

### Global versus relationship-scoped operations

Find, ask, and remember are global intent operations, so they remain in the
stable bottom Guide rail. Repeating the Guide or search icon in a selected
person's top-right would make global navigation compete with the relationship
object.

The person page therefore uses:

- **Share:** stage a private, recruiter-reviewed view, export preview, or
  access review. No option claims that a link, file, or permission changed
  before verification. Sharing remains unavailable while identity is
  unresolved.
- **Actions:** edit relationship, add note or evidence, add to favorites, and
  open relationship history. Edit and add remain staged; favorite is explicitly
  a personal shortcut rather than a person or relationship rank.

Every person row now opens that person's own detail content and actions. The
prior prototype incorrectly reused Leila's detail for every selected row.

### Brand entrance

The text wordmark is replaced by one circular Talent Signal mark with a stable
graphite core. It opens account-scoped Settings, Privacy and evidence,
Support, and What's new. This keeps configuration discoverable without
pretending that workspace settings belong to the selected relationship.

## Product-shape decision

Two brand theorems survived the initial branch:

- **Relationship Ledger:** calm people library first, then an
  evidence-to-change ledger inside the living relationship.
- **Relationship Constellation:** one-hop, question-specific relationship map
  with typed, time-bound edges and an equivalent list.

The initial Relationship Ledger established the correct object model but its
name and first implementation still felt administrative: filter chips, filled
cards, repeated red seams, and a three-item dock made the experience resemble
a calm CRM.

The second iteration therefore compared:

- **Living Archive:** a sparse, stable relationship index whose space and
  sequence borrow from a quiet museum, with a contextual Guide beside the
  relationship.
- **Quiet Concierge:** an Agent-first threshold that begins with intent and
  reveals the archive only when needed.

Living Archive is selected for the primary iOS architecture. It keeps direct
browseability, stable spatial memory, and a durable person-within-relationship
object without turning the interface into an inventory. Quiet Concierge has
the more dramatic first impression and lower visible input burden, but it is
weaker when a recruiter wants to scan without first forming a question. Its
composition survives as the expanded Guide state.

The Relationship Constellation survives only as a secondary question view. It
is justified when a recruiter asks a real relationship question such as "who
can help with this decision?" It is not a home screen, does not use node size
to rank people, does not infer unconfirmed edges, and always provides a list
equivalent.

Within the selected direction, People is the stable retrieval destination.
Today remains separate so only relationships with a supported reason to look
now enter the judgment brief. Combining Today into the People list would make
urgency visually dominant, while removing People would make quiet but important
relationships hard to retrieve. The default return-surface decision is
resolved in the fourth iteration below.

## Feature ledger

### Keep

- intentional screenshot capture and device-visible processing boundary;
- editable extraction before evidence promotion;
- explicit identity comparison with no preselected match;
- exact-effect review, receipt, retry, reversal, and recovery;
- historical evidence distinct from current confirmed state;
- `no_action` as a legitimate result.

### Reframe

- Remove Capture as a product destination and turn its useful behavior into
  Remember a moment inside the unified Guide, voice, and share surfaces.
- Turn the current large workflow cards into progressive review sheets.
- Make Today an attention view, not an importance ranking.
- Treat a relationship graph as a secondary answer to a scoped question.
- Use the vermilion redline only where evidence causally changes state.
- Use one contextual entry for find, ask, and remember instead of separate
  search, chat, capture, and compose controls.

### Add first

1. Searchable People archive across name, role, company, assignment, and
   recruiter-authored notes.
2. Work-state filters: changed, waiting on client, decision this week,
   identity review, and no action.
3. Living relationship page with one context selector and one current
   dependency.
4. Exact evidence attached to the changed state, with provenance and review
   status.
5. One smallest safe action with a preview of target, content, and effect.
6. One-line or voice memory that preserves raw words and stages
   interpretation as a draft.
7. State preservation when returning from detail, collection, Guide, or
   review.
8. Thoughtful empty, ambiguous, stale, offline, retry, and recovery states.

### Add after evidence

- saved work-state views and a private Today widget;
- quick recruiter notes and voice capture with explicit source labeling;
- assignment-specific relationship context;
- typed relationship paths with time and provenance;
- private notification previews and reversible reminder actions;
- an offline-readable cache of previously reviewed relationship state.

### Remove or defer

- synthetic product demonstrations as the default home;
- marketing headlines inside the daily product surface;
- nested card-on-card workflow exposition;
- numbered steps on ordinary retrieval screens;
- "AI analysis" labels, sparkles, and theatrical agent copy;
- unverified success messages or multiple competing recommendations;
- tiny metadata, decorative graphs, person scores, and acceptance predictions;
- ambient contact, email, or calendar ingestion before authorization and
  deletion semantics are proven;
- full ATS, bulk messaging, customizable dashboards, and desktop CRM parity.

## Observable validation

The direction is ready for native implementation only when a recruiter can:

1. find a known person from the default screen in five seconds;
2. state what changed and what is waiting after one detail-screen scan;
3. open the exact supporting evidence in one additional action;
4. distinguish confirmed, ambiguous, stale, and no-action states without color
   alone;
5. preview the exact effect of an action before any external write;
6. return to the same query, filter, and scroll position;
7. complete the same tasks at larger Dynamic Type, in dark mode, with reduced
   motion, and through VoiceOver semantic order.

## Fourth iteration: Editorial Today

The next critique supplied a stronger mobile composition: a compact translucent
navigation threshold, an open editorial page, one dominant return-to item, a
recoverable interrupted review, and a separate evidence-to-change composition.
The useful mechanism was not its serif type or warm paper alone. It changed the
product from a resource manager into a daily judgment brief.

This iteration supersedes the earlier choice of People as the default
destination. People remains the stable retrieval surface, but Today becomes the
return surface because the product promise is to reduce context reconstruction
at the moment a relationship needs judgment. The change is bounded: Today
contains at most a few evidence-supported dependencies, while all quiet
relationships remain directly available through People.

### Reference judgments

- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines)
  makes hierarchy and harmony the reason for elevating controls above content;
  Talent Signal borrows the stable, labeled navigation threshold and keeps
  relationship actions out of the tab layer.
- [Apple tab bar guidance](https://developer.apple.com/design/human-interface-guidelines/tab-bars)
  separates navigation from actions and warns against unstable destinations;
  Talent Signal keeps Today, People, and Library stable while search, capture,
  share, and review remain contextual actions.
- [Granola for iPhone](https://docs.granola.ai/help-center/ios/getting-started)
  narrows mobile scope to coming meetings, notes, chat, and settings; Talent
  Signal borrows that restraint but makes governed relationship state, not the
  note, the durable destination.
- [Things](https://culturedcode.com/things/features/) uses Today, progressive
  disclosure, and a clear paper-like object to make powerful detail feel calm;
  Talent Signal borrows the daily focus and open-page hierarchy, not task
  completion semantics for people.
- [Notion Agents](https://www.notion.com/product/agents) keeps permissions,
  history, and reversibility visible inside the workspace; Talent Signal
  borrows governed Agent presence but does not turn an evidence review into
  autonomous work or an AI destination.

### Structural fork

Two materially different first-viewport compositions were rendered:

- **Open Page:** hierarchy comes from one warm field, editorial type, sparse
  rules, and whitespace. Only the focused evidence review receives a bounded
  surface.
- **Floating Briefs:** the dominant change, resume rows, and no-action summary
  become individually elevated cards.

Open Page is selected. Floating Briefs improves local grouping but turns the
daily brief into a familiar premium-SaaS card stack and makes chrome compete
with the relationship decision. Open Page is more ownable because the
vermilion causal seam, not card treatment, carries the product mechanism.

### Interaction decision

The selected loop is:

```text
Today return-to item
→ exact reviewed evidence
→ proposed relationship-state change
→ keep unresolved or confirm change
→ internal-state receipt and undo
```

The receipt explicitly states that no message was sent and no external system
was written. Resume-with-context names what was preserved, where the recruiter
stopped, and what did not happen. The bottom Agent threshold supports search,
one-line intent, and capture, but remains draft-only until the affected
relationship object is reviewed.
