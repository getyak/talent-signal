# Talent Signal browser capture

A Chrome Manifest V3 extension for intentional, evidence-first capture and a
user-approved handoff to a local Talent Signal session.

The extension is deliberately distinct from the repository's Codex plugin. It
does not extract candidate truth, confirm facts, contact anyone, schedule a
meeting, update an ATS, or observe a downstream effect. It submits one exact,
reviewed capture to a localhost Web session. Reviewed images enter the shared
Agent for source filing or an editable profile draft; profile screenshot drafts
require human confirmation before saving.

## Load locally

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked**.
4. Select `apps/browser-extension/load-unpacked`.
5. Pin **Talent Signal Capture**, open a source tab, then click the toolbar
   icon. The configured `Control+Shift+Y` shortcut is an equivalent explicit
   gesture on macOS.

Chrome grants `activeTab` only after that gesture and revokes it after
cross-origin navigation or tab closure. If access is gone, the extension shows
a denial and asks for a new toolbar gesture.

## Review flow

```text
toolbar gesture
→ choose a text selection or image review
→ inspect URL, title, and the supported source time
→ inspect exact reviewed pixels or text
→ crop, redact, edit, or remove
→ choose the supported retention mode for the reviewed asset
→ check one localhost session
→ preview target, effect, purpose, and retention request
→ explicit Submit
→ pending / received / failed / unknown receipt truth
→ open the exact Web capture or screenshot task after receipt readback
```

For a screenshot, the canvas shown under **Reviewed pixels in this panel** is
the exact local reviewed asset. A chosen file is labeled by import time because
its filesystem modification time is not evidence of when the conversation was
captured. For selected text, only the current textarea value is sent. The
original selection is omitted when the user edits it.

Visible-tab and chosen screenshots can be reviewed, cropped, and redacted before
submission. Images support **Keep reviewed evidence** (`evidence_crop`); unsupported
retention modes remain unavailable. After explicit submission, the extension opens
the exact local Web origin and requires the same authenticated session with the
contact Agent enabled. The shared Agent receives only the final reviewed pixels.
Public research is disabled for this browser image request. Selected text uses
the separate governed capture endpoint described below.

One idempotency key is created for the reviewed draft and reused across retry
or receipt reconciliation. A changed source, edit, retention choice, or local
target invalidates approval. A timed-out request is `unknown` until a receipt
check resolves it.

After a real receipt is confirmed, private pixels or text are cleared from the
panel. Fixture payloads remain visible because they are synthetic.

## Permissions

| Manifest declaration | Purpose |
| --- | --- |
| `activeTab` | Temporary access after the toolbar action or shortcut |
| `scripting` | Read the explicit selection and execute the handoff in the exact local Web page |
| `sidePanel` | Host the inspectable review surface |
| `storage` | Keep bounded, content-free image receipt recovery records |
| `http://localhost/*` | Development session and capture handoff |
| `http://127.0.0.1/*` | Equivalent loopback development handoff |

There is no `tabs`, cookies, history, messaging, `webRequest`, `tabCapture`,
content-script, external-connectability, broad-host, or incognito access.
There is no remote JavaScript.

## Local backend contract

The extension never reads a cookie or token. It opens the local sign-in page,
then uses browser-managed credentials with `fetch(..., { credentials:
"include" })`.

Selected-text capture endpoints:

```text
GET  /api/browser-extension/session
POST /api/browser-extension/captures
GET  /api/browser-extension/captures/:request_id
```

A ready session response is:

```json
{
  "status": "ready",
  "workspace_label": "Local Talent Signal",
  "session_version": "opaque-concurrency-version"
}
```

The upload receives `Idempotency-Key` and, when available,
`X-Talent-Signal-Session-Version`. A verifiable receipt response is:

```json
{
  "status": "received",
  "receipt_id": "backend-observed-receipt",
  "capture_id": "backend-capture-id"
}
```

`pending` is allowed but remains pending until the receipt endpoint confirms
the result. A 2xx response without `pending` or a receipt is `unknown`, not
success. A stale session is rejected and must be rechecked before the same
packet is retried.

The packet separates source metadata, exact reviewed asset, handoff target,
browser-managed session version, purpose, retention request, and the user's
specific approval timestamp. It contains no candidate-state confirmation or
downstream-action approval.

## Shared Agent image handoff

The service worker opens `/contact-agent` on the reviewed loopback origin, checks
`/api/browser-extension/session` again, and requires both the original opaque
session version and `contact_agent: true`. Cookies stay in Web; the extension
never reads them. It submits the final pixels to `POST /api/contact-agent/tasks`
with `x-contact-handoff-session`, then reads `GET /api/contact-agent/tasks/:task_id`
before reporting receipt. The returned task ID opens the exact Web review.

A received handoff means the screenshot task was read back. It does not mean
analysis is complete or profile changes are confirmed. Chat and profile paths
retain the shared Agent's evidence, identity and human-review boundaries.

A reopened panel uses `GET /api/contact-agent/tasks?handoff_request_id=<key>` in
the original authenticated Web session to recover the original receipt. This
lookup never resubmits pixels. See the recovery limits below.

## Deterministic fixture mode

Choose **Synthetic fixtures** in the Source control. All eight cases from
`evals/candidate-momentum-v1.json` are bundled byte-for-byte as JSON and
exposed without changing source code.

Fixture receipt behaviors cover:

- received;
- offline then safe retry;
- duplicate-safe receipt;
- stale session then refresh;
- unknown result then receipt reconciliation.

Fixture mode is visibly synthetic, makes no network request, and never claims
an external effect.

## Checks

From the repository root:

```sh
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
  --test apps/browser-extension/tests/*.test.mjs
node apps/browser-extension/scripts/validate-package.mjs
node apps/chrome-extension/scripts/build.mjs
node apps/browser-extension/scripts/capture-design-preview.mjs
```

This runs Node's built-in test runner and validates the load-unpacked package,
syntax, icon set, exact fixture copy, manifest permissions, and absence of
remote URLs. The design-preview script renders the unpacked extension into
`output/playwright/browser-extension-capture-lens/` using synthetic sources.
The optional preview command requires a globally resolvable `playwright` or
`@playwright/test` installation and its Chromium browser; the contract and
package checks do not.

## Platform references

The implementation follows current official guidance:

- [Chrome `activeTab`](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
- [Chrome `captureVisibleTab`](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-captureVisibleTab)
- [Chrome Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
- [Chrome permission declarations](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)
- [Chrome localhost match patterns](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns)
- [Manifest V3 local-code boundary](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
- [Playwright Chrome-extension loading](https://playwright.dev/docs/chrome-extensions)

## Honest development limits

- [GET-9 verification](../../docs/evaluations/get9-harness/pr-review-verification.json)
  records focused backend screenshot/recovery tests and extension contract checks.
  These establish their stated boundaries, not an installed-browser end-to-end pass.
- The installed extension's positive toolbar grant, reviewed-image submission and
  exact Web receipt still require the pending headed-browser acceptance check.
- Synthetic fixtures do not prove OCR quality, recruiter value, production
  privacy, or connector safety.

## Reviewed-image recovery

The extension keeps up to 20 minimal handoff records locally: origin, opaque
Web-session binding, request key, creation time and completion flag. Records have
a 30-day recovery lifetime; expired entries are removed when the journal is read,
not by a background deletion timer. It
never persists pixels, source titles, text or login credentials. Unknown operations
block another request in that same session until receipt recovery resolves the
pending operation;
capacity cleanup evicts completed records only. On reopening the panel, use the
recovery entry to look up the original task in its original signed-in Web session.
This is read-only and does not upload the image again. A missing receipt stays
unknown; it is not evidence that the original operation never happened.

The `storage` permission uses Chrome local storage restricted to trusted extension
contexts, as documented in the [Chrome storage API](https://developer.chrome.com/docs/extensions/reference/api/storage).
Successful records also survive a lost panel response. Expired or removed recovery
records cannot prove no prior write; inspect Web tasks before manually resubmitting.
