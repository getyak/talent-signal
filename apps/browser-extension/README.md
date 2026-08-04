# Talent Signal browser capture

A Chrome Manifest V3 extension for intentional, evidence-first capture and a
user-approved handoff to a local Talent Signal session.

The extension is deliberately distinct from the repository's Codex plugin. It
does not extract candidate truth, confirm facts, contact anyone, schedule a
meeting, update an ATS, or observe a downstream effect. It submits one exact,
reviewed capture packet to a localhost backend boundary.

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
→ choose visible viewport or explicit selection
→ inspect URL, title, and capture time
→ inspect exact reviewed pixels or text
→ crop, redact, edit, or remove
→ check one localhost session
→ preview target, effect, purpose, and retention request
→ explicit Submit
→ pending / received / failed / unknown receipt truth
```

For a screenshot, the canvas shown under **What will be submitted** is encoded
as the submitted asset. For selected text, only the current textarea value is
sent. The original selection is omitted when the user edits it.

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
| `scripting` | Read only the user's explicit current selection |
| `sidePanel` | Host the inspectable review surface |
| `http://localhost/*` | Development session and capture handoff |
| `http://127.0.0.1/*` | Equivalent loopback development handoff |

There is no `tabs`, cookies, history, messaging, `webRequest`, `tabCapture`,
content-script, external-connectability, broad-host, or incognito access.
There is no remote JavaScript.

## Local backend contract

The extension never reads a cookie or token. It opens the local sign-in page,
then uses browser-managed credentials with `fetch(..., { credentials:
"include" })`.

Expected endpoints:

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
  "receipt_id": "backend-observed-receipt"
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
```

This runs Node's built-in test runner and validates the load-unpacked package,
syntax, icon set, exact fixture copy, manifest permissions, and absence of
remote URLs.

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

- This worktree does not own a Web/backend endpoint, so the real localhost
  session and receipt protocol is implemented but not integration-proven here.
- Backend source retention, derivative deletion, and receipt reconciliation
  need destination evidence from the owning backend.
- Automated Playwright Chromium loaded and exercised the extension package,
  fixture surfaces, and denial path. Headless automation cannot click browser
  toolbar chrome, so the positive `activeTab` toolbar-to-visible-page grant
  still needs one headed manual check before broader release.
- Synthetic fixtures do not prove OCR quality, recruiter value, production
  privacy, or connector safety.
