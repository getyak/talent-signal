# Browser extension surface evidence

## Verdict

**Pass with declared integration gaps** for the bounded overnight browser
extension slice.

The load-unpacked Manifest V3 package is real, deterministic checks pass, all
eight shared cases render on the Side Panel review surface, `TS-CORE-01` was
submitted through the actual extension page in fixture mode, and permission,
offline, retry, duplicate, stale-session, unknown, ambiguity, no-action, and
prohibited-inference behavior is directly observable.

This is not proof of OCR quality, recruiter value, production privacy, a
working Web/backend integration, backend retention/deletion, or a positive
toolbar grant in headed Chrome.

## Frozen behavior

```text
explicit browser gesture
→ visible viewport or selected text
→ source URL / title / time
→ exact reviewed pixels or text
→ crop / redact / edit / remove
→ localhost session check
→ target / effect / retention preview
→ independent Submit
→ pending / received / failed / unknown
```

The extension does not confirm a candidate fact or approve any downstream
contact, calendar, message, ATS, or CRM effect. Fixture assertions remain
visibly synthetic and proposed.

## Direct critical path

The `TS-CORE-01` review shows:

- the fixture source, capture time, candidate and assignment;
- the exact candidate message;
- four proposed assertions with individual quotes;
- one `prepare_question` proposal;
- the acceptance, meeting-consent, and confirmation boundaries.

Evidence:

- [full TS-CORE-01 review](ts-core-01-review.png)
- [focused fixture contract](ts-core-01.png)
- [explicit synthetic receipt](ts-core-01-received.png)

The receipt is explicitly fixture-local. It proves the Side Panel state
transition, not a network or backend effect.

## Eight-case matrix

| Case | Direct behavior |
| --- | --- |
| `TS-CORE-01` | Four proposed claims remain source-linked; one question is proposed; no acceptance or consent inference |
| `TS-CORE-02` | `no_action`; no assertion or follow-up task |
| `TS-CORE-03` | Relative date and timezone remain ambiguous; clarification blocks action |
| `TS-CORE-04` | Prior state stays visible; new value is conditional and superseded |
| `TS-ID-01` | Candidate/assignment remain unresolved; both same-name options remain visible; no persistence |
| `TS-ID-03` | Forwarded manager statement stays third-party; thanks is not agreement |
| `TS-ACT-01` | Availability remains proposed; exact date/timezone question replaces calendar action |
| `TS-BOUND-01` | Culture-fit score request is blocked; no assertion, ranking, or action |

The machine-readable observations are in
[`fixture-surface-results.json`](fixture-surface-results.json). Direct images
are named after each case ID in this folder.

## Blocker and recovery evidence

| Behavior | Observed surface truth | Evidence |
| --- | --- | --- |
| Permission denial | No draft or upload; asks for a new toolbar gesture | [permission-denied.png](permission-denied.png) |
| Offline | Failed, reviewed packet retained, same packet retry offered | [offline-failed.png](offline-failed.png) |
| Retry | Same idempotency key reaches received on the second attempt | [offline-retry-received.png](offline-retry-received.png) |
| Duplicate | Prior receipt reused; no new capture claimed | [duplicate-safe.png](duplicate-safe.png) |
| Stale session | Submission blocked until local session refresh | [stale-session.png](stale-session.png) |
| Unknown | Resubmit disabled; receipt check is the available action | [unknown-receipt.png](unknown-receipt.png) |
| Reconciliation | Receipt check changes unknown to received without resubmit | [unknown-reconciled.png](unknown-reconciled.png) |

## Capture editing evidence

The worker path uses `chrome.tabs.captureVisibleTab` for only the current
viewport and `chrome.scripting.executeScript` for only the current explicit
selection. The real denial path was observed without an `activeTab` gesture.

Because headless Playwright cannot click browser toolbar chrome, the positive
editor surface was fed a synthetic fixture response inside the loaded
extension page:

- [edited selected text](selected-text-reviewed.png)
- [redacted final canvas](screenshot-redacted-preview.png)
- [keyboard-accessible crop/redaction controls](screenshot-edit-controls.png)

The screenshots demonstrate the shipped UI. They do not claim a positive
toolbar grant. Crop/redaction geometry and exact bundled fixture equality are
also covered by deterministic tests.

## Accessibility and craft observation

A 320px Playwright viewport using dark color scheme and reduced motion found:

- no duplicate IDs;
- no interactive element without an accessible name;
- no horizontal overflow (`scrollWidth = clientWidth = 320`);
- keyboard activation of the approval checkbox enabled Submit;
- no color-only candidate score or candidate-ranking visual.

Evidence: [TS-ID-01 at 320px dark](ts-id-01-dark-320.png).

## Data and action inventory

| Field or asset | Source | Purpose | Location | Downstream effect |
| --- | --- | --- | --- | --- |
| Visible screenshot | One user-invoked active tab | Evidence review | Side Panel memory; final canvas in one handoff | Capture upload only |
| Selected text | Explicit current selection | Evidence review | Side Panel memory; edited text in one handoff | Capture upload only |
| URL/title/time | Active tab returned after gesture | Provenance | Side Panel and capture envelope | None |
| Crop/redactions | Recruiter edit | Minimize payload | Side Panel and envelope edit metadata | Changes submitted pixels |
| Retention mode | Recruiter choice | Backend retention request | Envelope | Request only; not proof |
| Session version | Local session check | Stale-session control | Memory/header/envelope | Backend may reject stale request |
| Idempotency key | One reviewed draft | Duplicate prevention | Memory/header/envelope | Reused on retry/check |
| Receipt ID | Backend or fixture response | Outcome evidence | Status surface | No candidate-state effect |

No password, token, cookie, tab history, browsing history, message stream,
contact, calendar, ATS record, real candidate data, or ambient private payload
was accessed or recorded by this run.

## Correction loops

### Loop 1 — incomplete review render

Direct evidence showed title and URL but no fixture body or session state.
Cause: an invalid `Intl.DateTimeFormat` option combination threw while
formatting captured time. The formatter was changed to explicit date/time
fields. Fresh persistent-context evidence then showed the complete case and no
console error.

### Loop 2 — target and stale-session invalidation

Safety review found that changing the localhost target after session check did
not invalidate session or approval, and the session version was not sent. The
target now appears in the exact-effect preview; changing it resets approval and
requires a new check; the version travels in the envelope/header. A malformed
2xx response now becomes `unknown` rather than a definitive failure.

No third correction loop was needed after the final deterministic and surface
checks.

## Platform evidence

The manifest and flow follow current official guidance:

- [`activeTab` temporary access after invocation](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
- [`captureVisibleTab` with `activeTab`](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-captureVisibleTab)
- [Side Panel action and user-gesture behavior](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
- [localhost match patterns](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns)
- [Manifest V3 local-code requirement](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
- [Playwright persistent-context extension loading](https://playwright.dev/docs/chrome-extensions)

Playwright Chromium loaded the service worker at a
`chrome-extension://…/service-worker.js` URL and opened the packaged
`sidepanel.html` from the same installed extension ID.

## Remaining gaps

1. Perform one headed manual toolbar invocation on an ordinary synthetic page
   and observe the positive `activeTab` → `captureVisibleTab` flow.
2. Integrate an owning localhost backend and observe session readiness,
   receipt, duplicate readback, stale-session rejection, timeout
   reconciliation, and local sign-in cookie behavior.
3. Prove raw/derived retention and deletion at that backend; an upload receipt
   is not deletion evidence.

These gaps block a production or privacy claim. They do not invalidate the
bounded load-unpacked fixture and recovery surface.
