# Design QA — iOS natural contact understanding

## Evidence

- Surface and persona: global iOS Agent input for a time-constrained recruiter
  capturing a person from an ordinary note.
- Evidence level: 1, executable iPhone 17 Pro Simulator interaction on iOS 26.5
  plus canonical fixture-backed identity operations.
- Natural English contact review:
  `/tmp/contact-intent-proof.5tkONZ/base/54FDDA33-AA61-4FB0-8A48-46420246D8E8.png`
- Ordinary identity question routed to relationship clarification:
  `/tmp/contact-intent-proof.5tkONZ/base/105AEB7E-E14F-4359-80A7-D3678969FE59.png`
- Simplified Chinese, dark appearance, AX5 contact review:
  `/tmp/contact-intent-proof.5tkONZ/ax5/2E3A4072-4BBB-4E8D-ABD1-ADE075078AEB.png`
- Simplified Chinese, dark appearance, AX5 contact edit:
  `/tmp/contact-intent-proof.5tkONZ/ax5/931DC7CF-C09D-455C-ABC6-EADA779005D7.png`
- Focused interaction bundle:
  `/tmp/talent-signal-contact-intent-ui-complete.xcresult`
- Final single-spinner progress and cancellation render:
  `/tmp/contact-intent-final.KlGGWf/878E7739-4FE1-4F60-9E28-D430ED0303AE.png`
- Final cancellation result bundle:
  `/tmp/talent-signal-contact-intent-cancel-final-ui.xcresult`
- Final exact-source model-validation suite, 22/22 passing:
  `/tmp/talent-signal-contact-intent-unit-literal-proof.xcresult`
- Focused Chinese AX5 bundle:
  `/tmp/talent-signal-contact-intent-ax5-zh-ui.xcresult`
- Canonical create/attach bundle:
  `/tmp/talent-signal-contact-intent-canonical-live-ui.xcresult`
- Canonical identity-conflict bundle:
  `/tmp/talent-signal-contact-intent-conflict-live-proof2-ui.xcresult`

## Finding and resolution

The remaining input friction was semantic rather than visual: the compact
composer still expected command-like phrasing before it would stage a contact.
That made the recruiter learn the implementation vocabulary and made the
experience feel like a form hidden inside chat.

The finished input accepts a short ordinary note with name, exact email, phone,
or LinkedIn clue, and optional relationship context. It immediately echoes the
immutable source and presents one quiet contact-review card. A deterministic
high-precision parser owns obvious notes; a bounded on-device model may propose
narrative extraction, but every field must occur verbatim in the source. The
model has no identity or write authority.

Questions remain questions. An unscoped identity question advances to the
existing `Who is this about?` clarification while retaining the exact composer
text. During bounded interpretation, one left-hand progress row exposes a
44-point Cancel action; cancellation restores the untouched note. The familiar
Send symbol remains visually stable, avoiding a second routing metaphor.

The established Today / Sessions / People navigation and original bottom
global input were not moved or restyled. The contact card, edit disclosure, and
terminal receipt remain inside the conversation above that composer.

## Behavioral, safety, and accessibility proof

- No-match, confirmed current owner, and current-versus-historical conflict
  paths used canonical backend lookup and explicit confirmation. No candidate
  was preselected, and the conflict could remain unresolved without inheriting
  a relationship scope.
- Create and attach returned canonical readback and a Session-restorable
  receipt. Merge remained a separate reversible preview and was not exercised
  as an automatic consequence of interpretation.
- The exact source note remains visible and stored with interpreter provenance.
  Proposed interpretation, identity decision, action, and receipt are distinct
  states.
- Chinese dark AX5 keeps review and edit controls reachable, text wrapping
  complete, and the pinned composer visible. The new progress/cancel semantics
  expose separate accessibility elements.
- No visual confidence, quality, fit, protected-trait, personality, or
  acceptance-probability score is produced.
- The compatible physical-device Foundation Models runtime has not yet been
  executed; Simulator proof covers deterministic behavior, injected structured
  model validation, cancellation, failure, and unavailable-model fallback.

## Mobile UX rubric

- Task legibility: 3 — one ordinary message leads directly to one review.
- Hierarchy: 3 — source, proposal, decision, and receipt remain distinct.
- Platform interaction: 3 — native text entry, progress, cancellation, and
  disclosure behavior.
- Accessibility: 3 — Chinese dark AX5, 44-point actions, wrapping, and child
  semantics verified.
- Visual craft: 3 — no form chrome, command chips, duplicate spinner, or routing
  icon change competes with the contact decision.
- Safety/provenance: 3 — exact-source validation and explicit tool authority.
- Vetoes: none in Simulator scope; physical-device model availability remains
  an explicit proof gap.

final result: pass with physical-device follow-up

---

# Design QA — iOS explicit global Agent scope

## Finding and selected direction

The bottom entry was visually global, but a new Ask silently selected the first
available relationship. A concise contact intent could therefore appear to
target Leila Hartmann before the Agent had analyzed the message. That mixed a
global IM interaction with form-style preselection and created a wrong-target
risk.

The selected direction starts a new global Ask with no relationship selected.
Contact-shaped language can proceed to the existing reviewable contact proposal
without inventing a relationship. A generic relationship question now advances
to one lightweight Agent clarification only after the recruiter taps the arrow:
`Who is this about?` The message remains editable and is not sent until the
recruiter explicitly chooses a Person and context and confirms Send. Selecting
one moves the exact draft atomically; if protected persistence fails, the draft
remains recoverable as a global draft and the UI explains the boundary.

Three structures were compared. A persistent empty relationship selector was
rejected because it still made a global message look like a form. Inline
horizontal chips were retained at standard sizes, but rejected at AX5 after the
first render clipped the Pursuit context. The selected responsive structure
puts complete, full-width relationship rows in the conversation scroll at
accessibility sizes while the composer remains pinned. The selector's complete
44-point row is tappable, no-match search has an explicit clear recovery, and
scope animation follows Reduce Motion. Existing contextual Sessions remain
scoped and do not steal keyboard focus. The Today / Sessions / People
navigation and bottom global input were not moved or restyled.

## Evidence

- Evidence level: 1, fixture-backed iPhone 17 Pro Simulator on iOS 26.5.
- Rejected implicit-scope state:
  `/tmp/talent-signal-global-input-focus.ooNbRf/0E30CC00-5541-4DC3-BA0E-A3D7703FFDE6.png`.
- Empty explicit global state:
  `/tmp/talent-signal-global-scope-ui-v2.MUWJ4t/33C72746-7A2E-4511-A43F-5C943FC9B9B3.png`.
- Restored unscoped contact intent:
  `/tmp/talent-signal-global-scope-ui-v2.MUWJ4t/3B37D620-EF52-4EFD-9356-E72B9F865DC8.png`.
- Standard global-intent result bundle:
  `/tmp/talent-signal-global-scope-ui-v2.xcresult`.
- Contextual Session scope regression bundle:
  `/tmp/talent-signal-contextual-session-scope-ui.xcresult`.
- Simplified Chinese, dark appearance, AX5 result bundle:
  `/tmp/talent-signal-global-scope-ax5-zh.xcresult`.
- Atomic global-draft transition model bundle:
  `/tmp/talent-signal-global-draft-atomic-model-v2.xcresult`.
- Input-first, draft restoration, contact intent, and progressive clarification
  result bundle: `/tmp/talent-signal-progressive-scope-ui.xcresult`.
- Rejected AX5 horizontal-chip render:
  `/tmp/talent-signal-progressive-scope-detail-artifacts.MjYCtT/595D732F-2477-4E79-93DD-0C344C3369B2.png`.
- Selected AX5 full-width relationship rows:
  `/tmp/talent-signal-progressive-scope-scroll-artifacts.GPlXUC/726BDB65-92AC-4E66-B50C-B2DD8B2E3012.png`.
- Final standard and Simplified Chinese dark AX5 clarification bundle:
  `/tmp/talent-signal-progressive-scope-scroll-ui.xcresult`.
- Unified final six-journey bundle on the current implementation:
  `/tmp/talent-signal-progressive-scope-final-ui.xcresult`.
- Contextual Session regression bundle after one infrastructure-only SIGTERM
  retry: `/tmp/talent-signal-progressive-scope-context-ui-retry.xcresult`.

The standard journey verifies empty, direct-contact, relaunch, and generic
relationship-question states. The model journey verifies rollback and exact
relaunch recovery for both global-to-relationship and global-to-contact
proposal transitions. The AX5 journey keeps the unselected scope, preview
boundary, capture controls, and composer readable without clipping.

## Mobile UX rubric

- Task legibility: 3 — global means unscoped until the message supplies intent.
- Hierarchy: 3 — contact review and relationship context remain distinct.
- Platform interaction: 3 — one-tap typing, progressive clarification, and a
  full-row native selector.
- Accessibility: 3 — 44-point targets, Reduce Motion, no-match recovery, and
  complete AX5 context rows verified.
- Visual craft: 3 — no new form, modal, navigation, or bottom-bar treatment.
- Vetoes: none.

final result: passed

---

# Design QA — Web natural contact intake and duplicate bridge

## Evidence

- Contact proposal:
  `/tmp/talent-signal-web-contact-proposal-final.png`
- Reversible merge preview:
  `/tmp/talent-signal-web-contact-merge-preview-final.png`
- Viewport: in-app browser, 1280 × 720 CSS pixels.
- State: signed-in synthetic fixture workspace, light appearance.

## Finding and resolution

The compact contact card initially kept a sticky disabled commit action in the
first viewport while its identity result sat below the fold. That made the
consequence look more important than the evidence used to choose it. The
finished card lets identity check lead, keeps extracted details and source
details collapsed when the message is complete, and places the final action at
the end of review.

`Add Noor Vega for Design` now reads back exactly `Noor Vega` and `Design`; it
does not require form-like `search` or `role` suffixes. When an exact-name page
matches the person already open and at least one other page exists, the card
offers Review possible duplicate. This opens the current reversible merge
preview. For an unrelated current page the bridge remains absent.

## Behavioral proof

- One message staged the contact card and cleared the composer without a write.
- Name and relationship were extracted independently and the original message
  remained visible as the source note.
- Account-scoped search showed distinct matching pages and left create disabled
  until the recruiter made an identity decision.
- The duplicate bridge opened Identity maintenance with the current page as the
  stable target; no merge decision was selected or submitted.
- Today / Agent / People navigation and the global bottom composer were
  preserved.

final result: passed

---

# Design QA — iOS Ask input-first empty session

## Evidence

- Evidence level: 1, executable iPhone 17e Simulator interaction on iOS 26.5.
- Before, standard English:
  `/tmp/talent-signal-ask-audit.iIw8Py/5C291ED3-AF84-4B15-9D24-D94886FE2CA9.png`
- Before, AX5 Dynamic Type:
  `/tmp/talent-signal-ask-audit.iIw8Py/B27EA86E-F7D9-4034-AF8F-B2DB96C215AB.png`
- After, standard English:
  `/tmp/talent-signal-ask-final.wDU0sZ/1B533C6F-8ED0-4BDE-AB7F-39F754C1231E.png`
- After, Simplified Chinese, dark appearance, AX5 Dynamic Type:
  `/tmp/talent-signal-ask-final.wDU0sZ/29FFEEF0-8DAB-4822-9D56-1514D26EE192.png`
- Focused result bundle:
  `/tmp/talent-signal-ios-ask-simplification-v2.xcresult`

## Finding and resolution

The prior empty session repeated the selected person as a large editorial
heading, then exposed three equally weighted horizontal prompt pills. The
standard layout clipped the last prompt, while AX5 turned the prompts into a
stack of oversized rows that displaced the conversation and made a simple
message entry feel like another form. At AX5 the attachment and voice symbols
also scaled beyond their fixed circular controls.

The finished session keeps the relationship selector as the only context
header, moves the three optional starters into one native menu, and leaves the
conversation and bottom composer as the visual lead. The menu still requires
an explicit choice before sending and remains disabled for preview data. SF
Symbols use a fixed optical size inside controls that expand from 44 to 52 pt
at accessibility categories, so the target grows without icon overflow.

The familiar Today / Sessions / People navigation and the global input entry
were not moved or restyled. This change is scoped to the Ask sheet opened from
that existing entry.

## Behavioral and accessibility proof

- Standard and Chinese dark AX5 tests verify the relationship scope, optional
  prompt menu, attachment, voice, composer, and preview authority boundary all
  remain reachable in one column.
- Voice input still produces an editable draft and does not create an Agent
  response until Send is tapped.
- The canonical prompt-menu path is encoded in the fixture-backed UI test. Its
  current local run skipped because the Pursuit backend fixture was unavailable;
  the preview, AX5, and voice paths executed successfully.
- Dynamic Type enlarges conversation content. Persistent relationship-selector
  chrome is optically capped at XXXL while its complete value remains exposed
  to assistive technology; no text or control crosses the viewport, and both
  media controls retain at least a 44 pt target.

## Mobile UX rubric

- Task legibility: 3 — the composer is the unmistakable primary action.
- Hierarchy: 3 — relationship context appears once; starters are progressive.
- Platform interaction: 3 — native Menu, PhotosPicker, text, and voice patterns.
- Accessibility: 3 — AX5, dark mode, Chinese, target size, and wrapping verified.
- Visual craft: 3 — no clipped prompt strip, icon spill, or competing title.
- Vetoes: none.

final result: passed

---

# Design QA — iOS Agent evidence-bound conversation

## Evidence

- Evidence level: 1, fixture-backed iPhone 17 Pro Simulator interaction on
  iOS 26.5.
- Before, standard English response:
  `/tmp/talent-signal-ios-ask-response-baseline-artifacts.LUK2kR/F916899D-B2E3-4EE8-9405-92B2586DC7DD.png`
- Before, Simplified Chinese, dark appearance, AX5 Dynamic Type:
  `/tmp/talent-signal-ios-ask-response-ax5-baseline-artifacts.aI8vsy/2A805D50-B4CE-4DF1-9A2E-9297E2404AA6.png`
- After, standard English response:
  `/tmp/talent-signal-ios-ask-response-final3-artifacts.SamdXm/CA637797-9A64-450D-9B7E-5251349CA0F2.png`
- After, Simplified Chinese, dark appearance, AX5 Dynamic Type:
  `/tmp/talent-signal-ios-ask-response-final3-artifacts.SamdXm/86F61D35-0717-4D61-9521-5A6E12334147.png`
- Final micro-craft pass, standard English response:
  `/tmp/talent-signal-ios-ask-bubble-final-artifacts.0wmh0K/592257BB-140B-4539-844E-61A8FCA4B2A9.png`
- Final micro-craft pass, Simplified Chinese, dark appearance, AX5 Dynamic
  Type:
  `/tmp/talent-signal-ios-ask-bubble-final-artifacts.0wmh0K/19FD8B48-E635-4E1D-8E7F-A2B367C721B8.png`
- Exact evidence detail:
  `/tmp/talent-signal-ios-ask-bubble-final-artifacts.0wmh0K/A4D67804-1CB6-4F2A-84DE-F57769887C5B.png`
- Focused result bundle:
  `/tmp/talent-signal-ios-ask-bubble-final.xcresult`

## Finding and resolution

The populated conversation was functionally sound but did not yet read like a
quiet IM tool. A solid graphite user bubble was the heaviest element; the first
answer heading repeated the selected person's name; review state was icon-only;
and controlled Agent headings plus citation provenance remained English in a
Chinese interface. At AX5, relationship-selector chrome and a hidden verbose
starter instruction consumed nearly the whole first viewport, then automatic
bottom anchoring opened a long response at its conclusion.

The finished response uses a quiet bordered question bubble and shows the exact
short starter the recruiter chose. Accessibility-size responses anchor at the
beginning of the new turn. The relationship selector stays compact as persistent
chrome, while the conversation keeps full Dynamic Type. The response now leads
with `Current understanding`, keeps exact evidence content unchanged, exposes a
text-and-symbol `Needs review` state, and localizes controlled block titles,
dates, actor kind, and review status. Existing owned work remains distinct from
a proposed action and still declares that it creates no external effect.

The final micro-craft pass removes the fixed 330-point question width. A short
message now shrink-wraps its content like a quiet IM bubble; `ViewThatFits`
switches longer messages and accessibility sizes to a wrapping layout bounded
at 330 points. The standard fixture's `What changed?` bubble is under 280 points,
while the Chinese AX5 bubble remains within the viewport without truncating its
question or reducing Dynamic Type.

The send moment now follows the same conversation hierarchy. Two structures
were compared: embedding a mutable progress/error state inside the recruiter's
right-hand bubble, or treating the recruiter message as an immediate immutable
echo while the Agent reports its own state in a separate left-hand row. The
second direction was selected because it preserves authorship and never makes
the recruiter's words look as though the Agent can edit their state. On send,
the composer clears visually, the exact question and any task-image thumbnails
appear immediately at the right, and a quiet `Reading the record…` row appears
at the left. This pending turn is only an ephemeral projection; a canonical
`AgentSessionTurn` is recorded after the validated response returns.

Failure restores the exact question and retained media to the composer while
keeping the existing idempotency intent available for retry. The failure card
scrolls into view and exposes `Retry` as a distinct accessible child. The first
focused failure run revealed that the row-level accessibility identifier was
overwriting the child button identifier despite a visually visible control;
the final container preserves child semantics, and the same-intent retry now
passes end to end.

The established Today / Sessions / People navigation and bottom global Agent
entry were not moved or restyled.

## Behavioral, safety, and accessibility proof

- Three UI tests passed against the canonical fixture: the standard cited
  answer and evidence-dispute recovery, the Chinese dark AX5 populated answer,
  and the AX5 input-first empty session.
- The AX5 test verifies the short Chinese question, localized response headings,
  localized candidate/review provenance, bounded bubble width, citation
  reachability, and persistent bottom composer.
- The standard test verifies the exact user-message label and content-sized
  geometry, preventing a short prompt from regressing to a form-like full row.
- The standard path still opens the exact cited fragment, marks the saved answer
  stale after a dispute, and opens the referenced existing Pursuit action.
- One unit test verifies source-timezone boundaries and localized citation
  provenance. Release build and the localization boundary passed.
- The send-state verification covers standard English, Simplified Chinese dark
  AX5 with Reduce Motion, a five-task-image message, and failure recovery. The
  three non-failure journeys passed in
  `/tmp/talent-signal-ios-ask-pending-final.xcresult`; the corrected focused
  failure and same-intent retry passed in
  `/tmp/talent-signal-ios-ask-pending-failure-v3.xcresult`.
- Final send-state renders are:
  `/tmp/talent-signal-ios-ask-pending-artifacts.wkm72W/main/5EC40826-F1A5-454E-8126-76243111B046.png`
  (standard pending),
  `/tmp/talent-signal-ios-ask-pending-artifacts.wkm72W/main/E2120393-85EE-40FF-8F15-BA8BD9052094.png`
  (Chinese dark AX5 pending),
  `/tmp/talent-signal-ios-ask-pending-artifacts.wkm72W/main/3C522C53-2DCB-465F-B313-3B8AA13C1F77.png`
  (five-image pending), and
  `/tmp/talent-signal-ios-ask-pending-artifacts.wkm72W/failure/D2929875-1CBA-4280-B3D6-4DCD60A7DA19.png`
  (failure restoration).
- Exact excerpts, person names, and backend evidence content are never silently
  translated. No contact, message, calendar event, or external system write is
  authorized by this presentation layer.

## Mobile UX rubric

- Task legibility: 3 — the selected question and beginning of the answer lead.
- Hierarchy: 3 — understanding, evidence, and owned work are distinguishable.
- Platform interaction: 3 — native scrolling, sheets, Menu, and pinned composer.
- Accessibility: 3 — AX5, dark mode, Chinese, wrapping, and provenance verified.
- Visual craft: 3 — quiet bubble, compact chrome, and no duplicate person title.
- Vetoes: none.

final result: passed
