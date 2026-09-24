# Journey acceptance ledger

Checkpoint: local Web `01cb7aa8`; resident backend `973e7913-platform`.
The two versions are deliberately named separately. No journey has been awarded
98/100. Evidence below is operational verification of synthetic cases, not a
user-satisfaction score or accessibility certification.

| Journey | Directly observed | Remaining acceptance |
| --- | --- | --- |
| Access and settings | Authenticated isolated Lab; settings and diagnostics render in both themes; visible navigation and shell targets checked at 320/390/430px | Sign-in interruption, account transition, expired-session recovery and settings changes through the deployed UI |
| Conversations | Send and canonical reload; stop with queued message; edit pending text; reload paused state; explicit continuation completes once; skip link reaches main | Deployed post-commit stop/restart repair, prioritization on the current revision, provider failure diagnosis, screen-reader and enlarged-browser-text checks |
| People and Memory | Create with note and confirmed clue; canonical reload; first-field focus; lost source/clue receipts resolve to the same identity and resource, independently counted in PostgreSQL | Live Memory proposal failed twice; review/accept/correct/undo loop is not accepted. Durable recovery after leaving remains a design gap |
| Sources and evidence | No-person outcome; create Person from synthetic source; retain undecided statements; conflict refresh preserves input and requires a new decision; deletion readback | Deployed API-latency repair; repeated identity-confirmation explanation; broader source withdrawal/derived-store readback and assistive navigation |
| Today and Time | Empty Today surface; create/edit/reload internal arrangement; invalid end time retains input and announces error; delete and compact unavailable deep link | Populated Today comprehension, timezone/date boundaries, recovery from an unknown arrangement result on the current runtime and native integration where applicable |
| Recovery and continuity | Frozen exact replay, malformed/wrong-request receipts, account expiry, navigation-before-unmount, and thrown host callback covered; two real lost-201 probes passed | Refresh-safe durable intent reconciliation, cross-device continuation, deployed lifecycle proof and representative interruption trials |

## How points may be awarded

Each journey uses the plan's 100-point internal rubric. Completion and recovery
each contain five checks worth five points; clarity, visual craft and
accessibility each contain three checks worth five points; responsiveness has
one five-point check. A check earns its points only when all stated conditions
have an evidence locator on the tested version. Missing evidence remains
unscored; it is not silently converted to a pass or a product failure.

| Category | Atomic checks required for a full award |
| --- | --- |
| Completion, 25 | Entry is discoverable; primary task succeeds; correct identity/scope is retained; canonical reload matches the result; applicable correction/deletion reaches its observable destination |
| Recovery, 25 | Ambiguity requires an explicit choice; invalid input is preserved with actionable feedback; missing result is not false success or rejection; retry is idempotent; stale scope/exit/restart cannot cause a later unauthorized continuation |
| Clarity, 15 | Source, interpretation and confirmed state remain distinguishable; each action states its effect; loading/empty/error/partial/terminal states name a useful next step |
| Visual craft, 15 | Content hierarchy remains readable in both themes; long content and narrow widths do not clip or overlap consequential controls; spacing, borders and type hierarchy are consistent across the complete journey |
| Accessibility, 15 | Keyboard order, landmark and focus recovery work; accessible names, announced states and contrast have evidence; real text enlargement and relevant assistive use remain operable |
| Responsiveness, 5 | Measured input-to-feedback and completion stages meet declared task-specific bounds, including a provider run while unrelated API requests remain responsive |

This coarse rubric cannot distinguish 98 from 100; it is intentionally not
adjusted to manufacture a near-perfect number. Meeting a numerical threshold
requires completing every currently necessary check. Safety, identity, privacy,
duplicate-effect, false-success and inaccessible-action vetoes still override
points. No cross-journey average or specialist-score conversion is permitted.

## Next bounded improvement goals

1. Diagnose the failed Memory run using bounded, allowlisted failure metadata;
   then prove proposal → human selection → canonical Memory → correction/undo.
   Never retain raw provider errors, credentials or extra conversation content
   to make debugging easier.
2. Deploy the reviewed backend repairs after the storage gate is satisfied;
   measure liveness/readiness during actual source admission and repeat proposed
   evidence chat plus stop/restart/prioritization acceptance.
3. Design durable unknown-result reconciliation tied to account, intent and
   stable request identity. Reopening should recover or explicitly resolve the
   original request before another intent is allowed. This requires a retention
   and deletion decision, not unbounded browser storage of private notes.
4. Test one clear path between source archive, relationship brief and accepted
   Memory with representative tasks. Improve labels and destinations based on
   observed confusion, then consolidate typography and interaction tokens only
   where their measured behavior agrees.
5. Complete keyboard, actual browser text enlargement and assistive checks on
   populated/error states; add native checks only for relevant native boundaries
   under the shared-device and storage guards.

The older [specialist checkpoint](checkpoint-panel.json) remains immutable.
The audit [evidence index](README.md) records repairs and their limits. The
active [plan](../../../plans/2026-09-24-experience-98.md) owns execution status.
