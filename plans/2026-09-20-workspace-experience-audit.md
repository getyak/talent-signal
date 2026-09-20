# Web and macOS workspace experience audit

## Outcome and boundary

Make the production shared workspace meaningfully better than the independent Open Design prototype in input, navigation, object clarity, recovery and craft. Cover new and existing conversations, slash commands, person mentions, search/sidebar, People and person context, Meetings, Captures, Plugs and Settings. The macOS main window renders this same Web UI; native tools keep their existing explicit boundary. No candidate ranking, new external writes or invented capabilities.

The requested >96/100 is a craft target, not a predeclared measured result. Record per-module evidence and deductions. Safety, keyboard, state integrity and missing proof cannot be averaged away. No claim that every module passes without direct evidence.

## Baseline

Frozen baseline: e88458bcb143e217f3216888d160232ea69ff80a, resident Web and installed macOS release, inspected through Computer Use on 2026-09-20. The default source checkout is older and dirty; this work uses an isolated worktree. Another task owns historical branch integration and P0/P1 fixes; preserve those changes and reconcile latest main before delivery.

Direct UI observations:
- Main empty composer renders calmly, but '/' and '@' are ordinary text with no suggestions.
- Add menu only navigates to a person; directory has an honest empty state.
- People empty state contains internal language ('governed source').
- Meetings defaults to the first of the month, not today; no obvious Today affordance.
- Plugs labels a WKWebView session 'Web / native unavailable'; explain the remote-workspace versus separate native-tools boundary without claiming permissions.
- New conversation Enter-send differs from existing Session modifier-Enter-send; inspect IME and length handling.
- Settings and empty content need interaction, responsive, contrast and recovery review.

Evidence: CUA screenshots and AX snapshots in task 01a0bd93-b909-7090-88e1-d672ca51eef3. Temporary test artifacts: /private/tmp/ai-test-workspace-experience-20260920.ldn2LU; only synthetic test data may enter committed evidence. No production personal data in repository artifacts.

## Milestones

1. Completed: inventory each module and real interaction; record reproducible gaps, inspect production contracts.
2. Implement shared composer and bounded, safe slash/mention behavior; preserve draft, retries, scope and account partition. Improve each audited module where evidence supports changes.
3. Verify focused behavioral tests, lint/typecheck/build and synthetic interactive review in light/dark/narrow layouts. Review meaningful alternate compositions before choosing a consequential visual direction.
4. Independent review; fix confirmed P0/P1 and material UX regressions. Run current-head repository gates, PR delivery and live readback where authorized.
5. Record an honest module matrix, remaining gaps and craft deductions, evidence links; remove registered temporary artifacts only after durable proof is preserved.

## Approach

Retain quiet neutral typography and restrained accent. Prefer shared behavior and progressive disclosure over new dashboards. Slash choices either stage editable prompts or open existing governed tools; selecting never sends. Mention choices use only the current authorized directory, stay explicit references and never grant evidence scope by themselves. No opaque identity coercion or pretending unsupported integration exists. A backend protocol extension requires separate evidence and review.

## Completion evidence

Direct before/after interaction for slash/mention, keyboard and IME boundaries, caret edits, overflow, empty/error directory, escape/focus, draft recovery, disabled/busy/retry behavior. People, meetings, captures, settings and navigation each have evidence or explicit not-run state. Tests use synthetic input. Local green is not a merged or deployed result.

## Implemented and independently reviewed

Rebased onto `abb46de6` before integrating the composer. The conflict, pending-send, idempotency and exact-draft cleanup protections from #208 remain intact. Pi task `20260920-150811-c0fd9b1b` supplied the bounded shared composer implementation; the parent integrated it and corrected findings from real UI use. Independent reviewer found no remaining P0/P1/P2 after follow-up fixes.

- Shared home/session composer: caret-aware slash prompts and existing-tool navigation; real account directory mentions with explicit text-only scope; keyboard choice, dismissal, IME guards, plain-text native undo and retained draft ownership.
- Adaptive suggestion placement: above/below in ordinary windows, inline in very short windows; bounded textarea growth with internal scrolling; send action stays at the right edge. Oversized paste is rejected explicitly without truncating or overwriting the draft. Send meter uses trimmed text; the draft cap uses raw text.
- Search: centered dialog, fixed avatar geometry, keyboard result traversal, retry, preserved account binding and honest empty states.
- People, Meetings, Settings and Plugs: readable small text, clear copy, focus states, local-date Today navigation, accurate connected count, and explicit separation of shared workspace from native Mac tools.
- Recovery: native reload links, one Today error state, editable retained drafts, Chinese source-service failure guidance, and readable dark-theme conversation messages.

## Interactive evidence matrix (2026-09-20)

All interactions used Computer Use with screenshots and accessibility readback. Mutation tests used a separate synthetic PostgreSQL database, backend on 4367 and Web on 3067. No real candidate records were used. Screenshots are embedded in the Codex task above; they are not claimed as repository PNGs.

| Surface | Direct evidence | Limit / deduction |
| --- | --- | --- |
| Home composer | Slash opening/filtering, keyboard selection without send, Escape, native undo, real person insertion; oversized paste warning retains original text | Full OS IME candidate selection not run; composition/keyCode guards covered by unit tests |
| Existing session | Synthetic send/response, draft save and reload, >1000-character send prevention, long-text internal scroll, dark message readability | Deterministic reply verifies transport and rendering, not model answer quality |
| Mentions | Real synthetic account/person/context, no-match and failure states, backend stop/restart then Retry reloads directory | Mentions insert readable text; they deliberately do not bind private evidence scope |
| Responsive input | Screenshots at 375x812, 375x400 and 200% browser zoom; clipped popup replaced by adaptive/inline menu, footer controls remain reachable; sidebar groups scroll without collapsing over each other | Chrome device emulation; no claim of physical mobile-keyboard certification |
| Search / navigation | Cmd-K, centered dialog, avatar proportions, Arrow keys and Enter navigate to actual synthetic person | Large production-account directory performance not measured |
| People / person workspace | Empty and populated directory, synthetic detail, note creation and deterministic brief, review-needed facts retained | No external contact write performed |
| Meetings | Month/day navigation, Today based on local date, narrow/dark reading and empty draft state | Real Calendar import not executed |
| Settings / Plugs | Theme selection and narrow/dark display; 1 connected of 3 capabilities; native Mac boundary and real routes read back | No additional permission or integration enabled |
| Captures | Screenshot/text toggle, required-input disabled state, real service-unavailable submit, Chinese recovery text and preserved source text | Isolated source Agent intentionally lacks provider configuration; successful AI extraction is not proven by this audit |
| Today | Successful zero-action state and workspace return directly inspected; single disconnected recovery reviewed | No real recruiting action submitted |
| macOS | Installed host architecture inspected: native shell opens the resident shared Web workspace | Final deployed WKWebView readback recorded after activation |

## Verification and release status

- Final Web suite: 118 passed files, 1 skipped; 771 passed tests, 1 skipped. Typecheck, lint, docs/architecture checks and production build passed. Composer regression suite passed 33/33. Follow-up recovery tests passed 58/58 and sidebar checks passed 23/23; real screenshots confirmed the single restored-draft notice and 200% sidebar scrolling.
- Independent review: 99 focused checks passed, then reviewed final whitespace and source recovery changes; no unresolved P0/P1/P2. This is code review, not an invented usability score.
- Final complete check, PR, merge and release readback are recorded below when available. The >96 target remains an acceptance aspiration: the missing real-provider, physical keyboard and broad human usability evidence prevents certifying every module at that score.
