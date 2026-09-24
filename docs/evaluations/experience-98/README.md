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

## First verified repair

EXP-02: parent changed only the outer containers of `QueuedConversation` and `SessionDirectory` to focusable `main#main-content`. Direct browser activation of the skip link on both routes returned one main and `document.activeElement.id === "main-content"`. Existing conversation image and Memory-review tests passed (3 tests in 2 files). Independent review and populated/error-state checks remain open.

## Conversation runtime observations

The synthetic first reply persisted and was readable after entering the Session through history. A second explanation replied successfully. A third run was stopped while a fourth message was queued; the UI showed the stopped incomplete reply, a paused queue containing exactly one pending message, and an explicit Continue action. These are observed lifecycle checks, not an overall model-quality claim. The runtime images were `talent-signal-backend-local:973e7913-platform`; readiness reported migration `079_memory_source_authority`.

GET-49 has separate uncommitted work for in-place send/supplement UI and queue prioritization. Keep ownership separate; do not overwrite or claim delivery of that task in this audit.

## Coverage and remaining evidence

Rendered all eight primary page families at both widths: conversation home, Today, People, Time, Sources, Extensions, Settings and Sessions. No horizontal page overflow was observed in those empty states. This does not establish populated-page, keyboard, error, theme or native-app quality. The initial automated capture attempt sampled loading states; those samples were discarded and the harness now waits for content and source/time reads to settle.

Still required: repair EXP-01 before judging populated Person/Memory; complete send/queue/stop/reconnect tests; review sources and deletion; theme and enlarged-text passes; independent review; any relevant database integration and native-surface acceptance. Preserve deductions instead of upgrading unknowns to passes.

## Deep optimization directions

1. Make mutation intent an explicit typed object containing identity, scope, stable request ID, observation time and recovery state. This would prevent a loose JSON caller from silently omitting required time metadata.
2. Replace tiny inherited working-surface typography with a small scoped token hierarchy. Verify actual computed styles, both themes, long Chinese/English content and focus states before consolidating CSS.
3. Give every route a consistent main landmark, heading, recoverable navigation state and focus destination. Keep successful empty states quiet while errors remain actionable.
4. Treat admission, provider work, persistence and verified readback as distinct lifecycle states throughout front and back ends. Measure latency by stage and test interrupted/partial outcomes.
5. Maintain a compact realistic synthetic journey set covering ambiguity, source withdrawal, long labels, no-action and retries; use it as recurring evidence, never as a substitute for human field feedback.

## Reference standards

- [WCAG 2.2](https://www.w3.org/TR/wcag/) for contrast, target-size exceptions, keyboard access and focus.
- [Reflow](https://www.w3.org/WAI/WCAG21/Understanding/reflow) for a 320 CSS-pixel viewport and text enlargement.
- [Contrast minimum](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum) for ordinary text contrast. Pixel font size alone does not establish WCAG conformance.

The project plan owns the current milestones and per-journey scoring method: [experience quality plan](../../../plans/2026-09-24-experience-98.md).
