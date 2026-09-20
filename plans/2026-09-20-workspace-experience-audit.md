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

Evidence: CUA screenshots and AX snapshots in task 01a0bd93-b909-7090-88e1-d672ca51eef3. Temporary test artifacts: /private/tmp/ai-test-workspace-experience-20260920.mvkOza; only synthetic test data may enter committed evidence. No production personal data in repository artifacts.

## Milestones

1. Active: inventory each module and real interaction; record reproducible gaps, inspect production contracts.
2. Implement shared composer and bounded, safe slash/mention behavior; preserve draft, retries, scope and account partition. Improve each audited module where evidence supports changes.
3. Verify focused behavioral tests, lint/typecheck/build and synthetic interactive review in light/dark/narrow layouts. Review meaningful alternate compositions before choosing a consequential visual direction.
4. Independent review; fix confirmed P0/P1 and material UX regressions. Run current-head repository gates, PR delivery and live readback where authorized.
5. Record an honest module matrix, remaining gaps and craft deductions, evidence links; remove registered temporary artifacts only after durable proof is preserved.

## Approach

Retain quiet neutral typography and restrained accent. Prefer shared behavior and progressive disclosure over new dashboards. Slash choices either stage editable prompts or open existing governed tools; selecting never sends. Mention choices use only the current authorized directory, stay explicit references and never grant evidence scope by themselves. No opaque identity coercion or pretending unsupported integration exists. A backend protocol extension requires separate evidence and review.

## Completion evidence

Direct before/after interaction for slash/mention, keyboard and IME boundaries, caret edits, overflow, empty/error directory, escape/focus, draft recovery, disabled/busy/retry behavior. People, meetings, captures, settings and navigation each have evidence or explicit not-run state. Tests use synthetic input. Local green is not a merged or deployed result.
