# Browser extension behavior and craft rubric

Scoring applies only after the overnight hard gates. Each dimension is atomic:
it has current executable evidence for at least 98, or it is labeled an honest
gap instead of being averaged into a score. Scores are local product-craft
judgments, not compliance, field-value, OCR, privacy, or release claims.

| Atomic dimension | Result | Behavior anchor | Evidence |
| --- | --- | --- | --- |
| Intentional access | 100 | No source access occurs before a toolbar action or shortcut; denial produces no draft or upload | Exact manifest test; [real denial](permission-denied.png); no content scripts or tab listeners |
| Permission minimality | 100 | Only `activeTab`, `scripting`, `sidePanel`, and loopback hosts exist | `manifest.test.mjs`; load-unpacked package validation |
| Source provenance | 99 | Title, URL, capture time, capture kind, and exact reviewed asset are visible before Submit | [TS-CORE-01 review](ts-core-01-review.png); [selected text](selected-text-reviewed.png) |
| Pixel/text inspectability | 98 | Screenshot canvas or edited textarea is the submitted payload, with size/edit state visible | [redacted preview](screenshot-redacted-preview.png); [editor controls](screenshot-edit-controls.png); image geometry tests |
| Removal and minimization | 99 | User can remove the draft, edit text, crop/redact pixels, choose retention, and real received payloads clear locally | UI controls; handoff tests; received-state clearing code |
| State separation | 100 | Observed source, synthetic proposed understanding, user edit, Submit decision, and receipt outcome never share one truth label | [TS-CORE-01](ts-core-01.png); [receipt](ts-core-01-received.png) |
| Exact decision boundary | 100 | Target, effect, retention, exact payload, and a fresh checkbox decision are required; edits or target changes invalidate approval | Handoff contract tests; target-change correction loop |
| Receipt truth | 100 | Pending, received, failed, duplicate, stale, and unknown are distinct; malformed 2xx remains unknown | [offline](offline-failed.png); [duplicate](duplicate-safe.png); [unknown](unknown-receipt.png); receipt tests |
| Retry and reconciliation | 100 | Retry reuses one idempotency key; unknown blocks resubmit; stale session requires refresh | [offline recovery](offline-retry-received.png); [unknown recovery](unknown-reconciled.png); deterministic tests |
| Identity and ambiguity restraint | 100 | Same-name, relative time, forwarded statement, and availability cases abstain or preserve ambiguity | [TS-ID-01](ts-id-01.png); [TS-CORE-03](ts-core-03.png); [TS-ID-03](ts-id-03.png); [TS-ACT-01](ts-act-01.png) |
| Prohibited inference boundary | 100 | Fit, worth, personality, tone, acceptance, and protected-trait scoring are absent and the score request is blocked | [TS-BOUND-01](ts-bound-01.png); exact fixture and manifest checks |
| Keyboard and responsive behavior | 98 | Named controls, checkbox-to-submit keyboard path, no duplicate IDs, and no horizontal overflow at 320px | Direct DOM audit; [320px dark view](ts-id-01-dark-320.png) |
| Dark and reduced-motion adaptation | 98 | System dark palette preserves semantic labels and reduced-motion removes meaningful animation | [320px dark view](ts-id-01-dark-320.png); media-query inspection |
| Visual hierarchy and dignity | 98 | One evidence object and one Submit decision dominate; vermilion is scarce; there are no scores, generic AI decoration, or recommendation grids | [TS-CORE-01 review](ts-core-01-review.png); full eight-case screenshot set |
| Load-unpacked validity | 100 | Manifest V3 service worker, Side Panel, dependency-free local scripts, icons, and eight fixtures load in a persistent Chromium context | package validator; service worker URL and extension-page observations |
| Positive toolbar capture grant | Honest gap | The worker uses `captureVisibleTab` and explicit selection exactly as specified, but headless Playwright cannot click browser toolbar chrome to grant `activeTab` | Code and denial path are executable; one headed manual toolbar check remains |
| Real localhost session and backend receipt | Honest gap | Protocol, versioned session, idempotency, target invalidation, and receipt states exist, but this worktree owns no backend endpoint | Interface tests and synthetic transport pass; no destination readback exists |
| Retention and deletion propagation | Honest gap | The extension sends a retention request and clears the local payload after receipt, but cannot prove backend raw/derived deletion | UI says receipt does not prove deletion; backend evidence is required |

## Design read

- Surface: browser evidence review and signed handoff.
- Audience: independent recruiter intentionally capturing one current source.
- Canonical object: a future governed backend episode; the extension draft is
  temporary and non-canonical.
- Provenance order: source context → exact reviewed payload → proposed fixture
  meaning → explicit handoff → observed receipt.
- Attention hierarchy: reviewed evidence first, one Submit decision second,
  status/recovery third.
- Visual character: warm neutral notebook, evidence-instrument precision,
  restrained vermilion, low motion, side-panel density.

The `design-talent-signal` Skill led the decision to use whitespace grouping
instead of a card dashboard, keep evidence one step from every fixture claim,
and give visual weight to work attention rather than candidate value. The
evidence-safety review led to target invalidation, versioned local sessions,
unknown receipt handling, and honest backend/deletion gaps.
