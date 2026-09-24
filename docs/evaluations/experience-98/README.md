# Experience audit and improvement evidence

Status: in progress. No 98/100 acceptance claim has been issued.

## Frozen baseline

- Source: `159c640286c14fa3c1d0244db3f318bf9b30422c`.
- Resident Web observed at `973e7913ee1908aaa0fea95417974f212ba6f463`; the source difference is the install/opening prototype, not the audited workspace components.
- Local Web: loopback port 3410, isolated worktree and authenticated synthetic Lab workspace. Never use real relationship content as a fixture.
- Browser: Chrome through Kimi WebBridge; desktop 1440 × 900 and narrow 390 × 844. Debugger border and extension/dev badges are browser tooling, not product decoration.
- Baseline Web typecheck passed; 1,213 tests passed and 1 skipped. Backend Pi reported typecheck passed, 764 tests passed and 306 skipped. Skipped database tests are missing proof, not passing checks.

## Confirmed findings

| ID | Priority | Observation and reproduction | Required proof of repair |
| --- | --- | --- | --- |
| EXP-01 | P1 | People → Add contact → enter synthetic name, email clue, relationship and first note → confirm clue → Create. The UI stays on the draft with `Invalid time value`; resource POST returns 422. `agent-create-person-card.tsx` omits `captured_at` in all three resource submissions while `localBackend.ts` requires it. | Create, attach confirmed clue, defer ambiguous identity, and same-intent retry preserve a valid observation time. Open the resulting Person and reload; read back one identity/context and expected sources. |
| EXP-02 | P2 | `/workspace` and `/workspace/sessions` render no `main` landmark and no `#main-content` target despite exposing the global skip link. | Exactly one focusable main destination in empty, populated and error states; keyboard skip reaches it on all conversation routes. |
| EXP-03 | P2 | Contact creation labels and source/identity explanations use approximately 9–11px text, including the effect of confirming an identity clue. The raw error is a small paragraph outside an alert region. | Readable form hierarchy at desktop/narrow/200% text, alert and focus recovery, no clipped identity/effect text, calm surface borders. |
| EXP-04 | P2 | The narrow Time view uses 38px-high controls for creating an arrangement, time navigation, view selection and filtering. Extensions uses a 34px add button. These miss the project's 44px mobile target. | Applicable mobile controls meet the project target without excess wrapping; test keyboard and 320px reflow. Do not mislabel the project's target as WCAG's 24px AA minimum. |
| EXP-05 | P2 | In the synthetic saved Session, asking the Agent to explain `no_action` produced a statement that related information is not persisted, while the same conversation is persisted and reloadable. | Product explanations distinguish no domain/external mutation from conversation retention. Test an actual provider reply plus reload, without claiming prompt tests guarantee every reply. |
| EXP-06 | P2 | Activating the skip link before sending leaves `#main-content` in the URL. The admitted conversation stays on `/workspace?draft_session=...#main-content` because the admission navigation rejects every hash; opening history reaches the saved canonical Session. | Preserve the valid main-content anchor while replacing the admitted route, and keep unrelated navigation protected. |
| EXP-07 | P2 | After deleting an internal arrangement and reloading its deep link at 390 × 844, Time still opens a full blank disabled “Edit arrangement” form. The deletion explanation is below the visible viewport, so the terminal state is unclear. The disabled fieldset does prevent writes; this is a presentation defect, not an observed authorization bypass. | Show an immediately visible compact deleted/unavailable state with a clear close action; no misleading blank editor or leaked old content. |
| EXP-08 | P2 | A source archive's “Open profile” links back to the same source archive; empty task histories still expose an empty processing disclosure. The separate relationship page displays an English no-action fallback in Chinese and a manual-identity badge based only on absence of a capture object. | Meaningful destinations and empty states; localized system copy; never claim a human identity decision without its receipt. |
| EXP-09 | P1 | Starting a synthetic text-source run stalled the whole API: liveness and readiness each exceeded 8 seconds in three consecutive probes. The source list/detail took about 35 seconds. SDK 0.3.266 synchronously calls `process.report.getReport()` to detect Linux libc before spawning its executable. Node diagnostic reports perform reverse DNS on active sockets by default. An isolated server reproduced a 3,118ms report versus 2.4ms with network collection disabled. | Disable network lookups in runtime diagnostics before SDK admission, preserve required libc detection, and repeat a real source run while measuring API liveness/readiness. The isolated pair is not yet resident-runtime acceptance. |
| EXP-10 | P1 | Source confirmation/deletion can submit a stale terminal revision after the runner's last save. The page displays raw `CONTACT_TASK_REVISION_CHANGED` and retains the stale action state; a full page reload was needed to proceed. | Reload current task on conflict, retain editable input, explain the changed state and require a fresh human decision. Do not automatically replay identity/deletion writes. |
| EXP-11 | P1 | After the first resource POST returned a real 201, a synthetic transport failure hid the receipt from the form. Editing the note and pressing Create sent another `new_person` request; the backend created a second Person with a distinct ID. | Lock an unknown outcome to its exact submitted payload and request identity, reconcile before edits, and distinguish an acknowledged rejection from a missing response. Test source, clue and deferred-identity requests; never claim an unknown write was not saved. |
| EXP-12 | P2 | At 320px the mobile shell labels shrink to 9px; utility labels wrap into one-character columns when the privacy action is present. The search target is 30px square and the account target is 35px wide. | Keep the four primary labels readable; preserve named utility destinations at narrow widths and verify all header targets at 320/390/430px. |
| EXP-13 | P1 | A Person with unchanged proposed source fragments enters relationship chat, waits for model processing, then gets `CHAT_COMPLETION_SOURCE_CHANGED`. The reviewed-manifest filter only ran when Session screenshot sources were present, while the final completion guard always required reviewed/attributed evidence. Both Session and no-Session synthetic PostgreSQL cases reproduced 409 before repair. | Filter proposed evidence from every reviewed manifest before provider work; preserve its unconfirmed state and the late revocation guard. Repeat against the deployed runtime. |

## First verified repair

EXP-02: parent changed only the outer containers of `QueuedConversation` and `SessionDirectory` to focusable `main#main-content`. Direct browser activation of the skip link on both routes returned one main and `document.activeElement.id === "main-content"`. Existing conversation image and Memory-review tests passed (3 tests in 2 files). Independent review and populated/error-state checks remain open.

## Conversation runtime observations

The synthetic first reply persisted and was readable after entering the Session through history. A second explanation replied successfully. A third run was stopped while a fourth message was queued; the UI showed the stopped incomplete reply, a paused queue containing exactly one pending message, and an explicit Continue action. These are observed lifecycle checks, not an overall model-quality claim. The runtime images were `talent-signal-backend-local:973e7913-platform`; readiness reported migration `079_memory_source_authority`.

The pending message was edited, reloaded with its exact text and paused state, resumed, and completed once. Reloading the canonical Session retained the stopped marker and the final “测试完成。” reply. The diagnostics page independently reported Web, backend, PostgreSQL and required migrations healthy; it explicitly excludes external providers from that claim.

## Time lifecycle observations

Created one synthetic internal arrangement for September 25, 14:00–14:30 Asia/Shanghai. The next-30-days list and a reload retained the title, time and private note. An end time before the start produced an announced validation error and preserved input. Updating the title and end to 14:45 persisted after reload. The explicit delete confirmation explained its effect; confirming removed the item from the list and cleared its title/note on deep-link reload. No calendar file was exported and no invitation was sent. EXP-07 records the remaining deleted-state presentation defect.

GET-49 was independently merged in PR #242. This audit integrated `88eb33b3`
and preserved its in-place send/supplement behavior. A new regression covers
its prioritize path without claiming delivery of that separate task.

## Revised browser acceptance

- Manual contact creation with a confirmed email clue now completes. Reloading
  the authenticated relationship destination shows one first note and one
  confirmed clue. The source review retains the undecided participation and
  meeting-time statement. See [creation readback](evidence/create-person-readback.json).
- Injecting a definite first-clue rejection after a real source save preserves
  the saved identity. The visible alert receives focus, saved source fields are
  disabled, and correcting the clue produces one note POST and two clue attempts
  against the same Person. The injected 503 was applied before network execution
  in this bounded probe; ordinary 503 responses must be treated as uncertain,
  which remains part of EXP-11. See [partial retry](evidence/create-partial-retry.json).
- Source conflict recovery was verified against a real backend 409. The probe
  changed only the submitted revision from 14 to 13; the page then read revision
  14 once, preserved the name input, focused a Chinese alert and performed no
  mutation replay. Relevant controls measured at least 44px at 320px, with no
  horizontal overflow. See [conflict recovery](evidence/source-conflict-recovery.json).
- The deleted Time deep link now immediately shows a compact terminal state and
  working Close action at 320px. The previous blank editor is absent. Time's
  affected controls measured at least 44px.
- Contact creation labels measured 14px, inputs 16px and controls 44px at 320px.
  Its compact primary label still measured 12.64px, so the parent scoped the
  footer labels to 14px. A submit button initially overlapped the fixed bottom
  bar but normal scrolling exposed it; this was not classified as unreachable.

These checks cover specific synthetic journeys. They do not establish native
app quality, 200% browser text enlargement, production latency, or 98/100.
Next's retained route DOM can contain hidden main elements; landmark checks
must count visible/accessibility-exposed routes rather than hidden cache nodes.

### Typography, entry focus and shell follow-up

- Creating a contact no longer focuses the chat composer below the card. The
  visible name input receives focus; the card heading remains on screen at
  320px. See [entry and relative text-size proof](evidence/create-entry-and-text-size.json).
- Enabled solid-color form text measured at least 4.61:1 in light mode and
  7.74:1 in dark mode. Gradients, group opacity, disabled controls and assistive
  technology remain outside that narrow calculation. See [contrast samples](evidence/create-text-contrast.json).
- EXP-12: primary mobile navigation labels now measure 12px; the six header
  targets each measure at least 44px in both axes. Compact utility icons keep
  their accessible names. There is no horizontal page overflow at 320, 390 or
  430px. Tab then Enter on the skip link focuses the single visible main while
  preserving Person/context parameters.
- Reloading the populated source archive confirms the self-link is absent.
  The relationship page now uses the Chinese no-action fallback and does not
  assert a manual identity decision without evidence. See [relationship and
  shell readback](evidence/relationship-shell-readback.json).
- A follow-up found Time's retention/scope explanation at 10.56px, review
  explanation at 11.68px and inputs at 13.12px. Scoped CSS now renders the two
  explanations and form labels at 14px and inputs at 16px. Both 320px and
  390px browser checks preserve page width; the open arrangement form fits
  within the viewport, including native date/time fields. Mobile inputs and
  selects measure 44px high; the checkbox's clickable label also measures
  44px. These changes do
  not alter dense month/week calendar typography. See [before](evidence/time-type-before.json),
  [after](evidence/time-type-after.json) and [form reflow](evidence/time-type-form.json).

## Coverage and remaining evidence

Source lifecycle: the first explicitly no-person synthetic text saved a no-person
receipt; deleting it eventually returned an unavailable state after readback.
A second synthetic source created one Person and retained the exact statement
that participation and meeting time remain undecided. Its Person Memory page
correctly stayed empty because source material is not confirmed Memory. A third
source naming the same Person asked for explicit identity selection. A resumed
run asked for identity confirmation again; request/selection provenance still
needs inspection before attributing that repeated question to the model.
Public research remained unchecked; no external messages were sent.

Runtime evidence: [source health probe](evidence/source-health-probe.json) and
[isolated Node diagnostic experiment](evidence/node-diagnostic-report-probe.json).
The initial CPU sample mistakenly observed Docker init rather than Node and is
excluded. The SDK's local pinned source and Node's official
[diagnostic-report documentation](https://nodejs.org/api/report.html) support the
reverse-DNS mechanism; actual resident improvement remains unverified.

Rendered all eight primary page families at both widths: conversation home, Today, People, Time, Sources, Extensions, Settings and Sessions. No horizontal page overflow was observed in those empty states. This does not establish populated-page, keyboard, error, theme or native-app quality. The initial automated capture attempt sampled loading states; those samples were discarded and the harness now waits for content and source/time reads to settle.

Still required: deployed acceptance and finish populated Person/Memory acceptance;
complete reconnect and current-runtime prioritization checks; broaden source
deletion, theme and enlarged-text evidence; independent review and native-surface
acceptance where required. Preserve deductions instead of upgrading unknowns
to passes.

### Unknown-result recovery acceptance

Pi repair 3 is integrated with the parent's navigation-race correction. The
parent first reproduced two missed cases: accepting navigation while a source
request is still pending dispatched a later clue POST before unmount; a
same-document skip link incorrectly asked to discard recovery. Both now pass.
The form validates one complete receipt against the exact request and identity,
seals acknowledged success before host callbacks, and preserves unknown outcomes
across replay rejection. Scope expiry and accepted navigation stop continuation.

Two real-backend browser probes deliberately hid a successful 201: first for
the source and then for the confirmed clue. The focused unknown-result notice
kept inputs locked. Explicit retries reused the complete body, request ID and
observation time; each returned the original Person and resource. Canonical
reload retained the Person. Read-only PostgreSQL verification found exactly one
Person per unique synthetic name, one note, one contact resource and one
confirmed handle. See [browser recovery](evidence/lost-response-recovery.json)
and [database readback](evidence/create-recovery-db-readback.json).

The assembled Web suite passed 1,267 tests with one skipped; a subsequent
single-resource receipt regression also passed. Web typecheck and changed-file
lint passed. These are local checks, not production deployment evidence.
Recovery remains in memory: leaving or refreshing warns truthfully but cannot
restore the pending request after reopening. Durable recovery is still a deeper
improvement direction.

The next parent review found a second transport boundary: the resource Web
route converted a backend fetch or receipt-parse exception into 422, falsely
classifying an uncertain upstream write as validation rejection. Two new tests
first reproduced this failure. The route now tracks attempted/acknowledged
writes, returns a neutral 503 unknown-outcome response after transport/parse
failure, and also preserves uncertainty when a document saved before a later
link failed. Pre-write validation stays editable; an acknowledged first atomic
backend rejection retains its status. All 42 affected route/card tests pass.
This boundary is verified by deterministic route tests; the earlier browser
probes specifically cover loss between browser and Web, not this upstream hop.
After the upstream-boundary and Time typography follow-ups, the complete Web
suite passed 1,272 tests with one skipped. No skipped check is counted as passed.

### Browser tooling isolation

Client navigation in the extension-enabled audit tab raised a React
`parentNode.removeChild` error and retained the previous page. Inspection found
the React-owned favicon detached while a `data-wb-cursor` replacement existed.
A fresh extension-free Chrome context, using only the same synthetic Lab
authorization in memory, completed Sessions → New conversation → Sessions →
People with no page errors. The lost-response journeys also completed there.
See [clean browser comparison](evidence/clean-browser-navigation.json).
This is evidence of tool interference, not proof of an application defect;
no React workaround or global browser-extension change was introduced.

The [four-lens checkpoint](checkpoint-panel.json) freezes the earlier
`9938d394` state, before unknown-result recovery was integrated. It is a
sequential parent self-review, not independent reviewer consensus. Its active
duplicate-write veto is superseded locally by the recovery evidence above;
its deployment, Memory, accessibility and score-validity gaps remain open.

## Deep optimization directions

1. Make mutation intent an explicit typed object containing identity, scope, stable request ID, observation time and recovery state. This would prevent a loose JSON caller from silently omitting required time metadata.
2. Replace tiny inherited working-surface typography with a small scoped token hierarchy. Verify actual computed styles, both themes, long Chinese/English content and focus states before consolidating CSS.
3. Give every route a consistent main landmark, heading, recoverable navigation state and focus destination. Keep successful empty states quiet while errors remain actionable.
4. Treat admission, provider work, persistence and verified readback as distinct lifecycle states throughout front and back ends. Measure latency by stage and test interrupted/partial outcomes.
5. Maintain a compact realistic synthetic journey set covering ambiguity, source withdrawal, long labels, no-action and retries; use it as recurring evidence, never as a substitute for human field feedback.
6. Connect the source archive, relationship brief and Person Memory with explicit destinations and status language. A reader should understand what was imported, what is inferred, what has been confirmed and where to act without guessing between three Person surfaces.
7. Make acknowledged success, definite rejection and unknown outcomes distinct
   states of the same mutation. Correcting one field must never silently
   recreate an already-saved Person, note or arrangement; missing receipts
   require reconciliation before another intent.
8. Apply one evidence-admission policy across direct relationship chat and
   Session chat. A pending review must remain an explicit pending state; it
   must not enter the reviewed manifest and fail much later as a fictitious
   concurrent change. [EXP-13 regression](evidence/proposed-source-chat-regression.json)
   records two failing cases before repair and 32 passing related checks after.

## Reference standards

- [WCAG 2.2](https://www.w3.org/TR/wcag/) for contrast, target-size exceptions, keyboard access and focus.
- [Reflow](https://www.w3.org/WAI/WCAG21/Understanding/reflow) for a 320 CSS-pixel viewport and text enlargement.
- [Contrast minimum](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum) for ordinary text contrast. Pixel font size alone does not establish WCAG conformance.

The project plan owns the current milestones and per-journey scoring method: [experience quality plan](../../../plans/2026-09-24-experience-98.md).
