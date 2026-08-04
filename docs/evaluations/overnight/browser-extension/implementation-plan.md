# Browser extension execution plan

## Outcome and proof

Build a load-unpacked Chrome Manifest V3 extension that lets a recruiter
intentionally capture only the visible tab or their explicit text selection,
inspect source metadata and the exact reviewed payload, crop or redact
screenshots, remove content, and explicitly submit a purpose- and
retention-scoped handoff to a localhost Talent Signal session.

Completion requires:

- a valid package using only `activeTab`, `scripting`, and `sidePanel`;
- localhost-only development host permission;
- no ambient listeners, content scripts, tab/history/cookie access, remote
  code, or external writes;
- deterministic access to all eight shared fixture cases;
- direct browser evidence for `TS-CORE-01` and safety blocker states;
- focused checks for denial, offline, retry, duplicate, stale-session, and
  unknown-result behavior;
- a behavior-anchored craft rubric with evidence or explicit gaps.

## Product read

- **Primary surface:** browser evidence review and signed handoff.
- **Audience:** a time-constrained independent recruiter deliberately
  capturing one current source.
- **User question:** “Is this exactly the evidence and context I intend to
  submit for review?”
- **Canonical entity:** the governed capture episode that the backend may
  create after receipt; the extension draft is temporary and non-canonical.
- **Attention:** the exact reviewed pixels or text, followed by one explicit
  Submit decision.
- **Visual character:** quiet warm neutral, restrained vermilion at the
  consequence boundary, low motion, compact side-panel density.

## Meaning and boundaries

The surface keeps these states distinct:

1. observed source: captured pixels or explicit selected text plus URL, title,
   and capture time;
2. fixture-only proposed understanding: synthetic assertions and disposition,
   always labeled as fixture contract and never confirmed state;
3. recruiter edit: crop, redaction, or edited selected text;
4. action: explicit submission of the currently previewed payload;
5. outcome: pending, received, failed, or unknown receipt state.

Fact confirmation and downstream action approval do not occur in the
extension. Local authentication is browser-session handoff: the extension
opens the local Web flow and uses browser-managed credentials without reading
or displaying a token.

## Chosen approach

- Ship plain local JavaScript, HTML, and CSS under a directly loadable folder.
- Open the Side Panel from the toolbar action so `activeTab` is granted by the
  user gesture.
- Capture only on a second explicit panel action; the temporary grant is
  invalid after cross-origin navigation and denial is visible.
- Render screenshot edits to a canvas; the canvas output is the submitted
  asset.
- Use one idempotency key per reviewed draft and reuse it across retries.
- Treat a timeout after dispatch as unknown, not failed or received.
- Keep fixture transport conspicuously synthetic and deterministic.

## Rejected alternatives

- Broad host access or persistent content scripts: violates intentional
  capture and least privilege.
- Reading cookies or tokens: unnecessary; browser-managed session credentials
  are sufficient for localhost handoff.
- Writing candidate facts from the extension: the browser surface does not own
  truth or extraction policy.
- Building a production backend inside this worktree: outside ownership and
  the overnight scope.
- Styling the extension as an AI assistant: obscures evidence review and the
  user's decision.

## Milestones

1. Architecture and fixture contract.
2. Complete load-unpacked implementation and deterministic checks.
3. Persistent-context browser exercise with direct screenshots.
4. Up to three correction loops driven by failed evidence.
5. Frozen surface commit, final manifest, and local handoff.

## Decision-changing unknowns

- The current repository does not expose a localhost browser-extension
  session or capture endpoint. The extension therefore implements and
  documents a narrow protocol, exercises it deterministically in fixture mode,
  and reports a real localhost connection as unavailable unless an owned
  backend supplies observable receipt evidence.
- Automated Playwright side-loading must use bundled Chromium, because current
  Google Chrome does not accept the required command-line side-load flags.
