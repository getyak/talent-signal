# r38 primary-login composition: independent design review

**Verdict: the composition is implementable and closes the major ownership ambiguities, but three P1 design gaps and one smaller specification gap should be clarified before implementation resumes.** The findings below concern the accepted contract, not an inspected implementation or an observed runtime failure.

Scope: only the new **Production composition contract** at lines 120–219 of `/Users/cubxxw/data/talent-signal-account-sync/docs/decisions/0021-primary-login-store-ownership.md`, read with the preceding decisions for consistency. No moving Pi source, native application, Simulator, registry, preferences, database or tests were opened or run. No product/design source was edited.

The design file was unchanged between the first and final reads. SHA256: `26b715a5d26af432677a16a928bb496a086face5d60f465a5cadfd01cb149303`.

## 1. P1 — a task-owned registry directory does not isolate the WebKit store

**References:** test bootstrap at lines 206–217; ordinary legacy adoption at lines 35–37; immutable store construction at lines 138–146.

The unit TEST_HOST contract requires an explicit task-owned registry root, but only the UI-test paragraph also requires an isolated Web origin. The root isolates the journal and lock. It does not change the identified WK store selected by a UUID. A fresh test journal that follows ordinary first-install adoption for a saved production origin can therefore adopt the same deterministic legacy UUID as the installed application and open its existing cookie store. This remains possible even when the production registry directory is never created or touched.

**Minimal correction:** define an explicit test launch mode before reading saved connection settings or constructing any host. In both unit TEST_HOST and UI tests, require injected task-owned origin/selection configuration or remain unavailable. Disable installed-state migration and legacy UUID adoption in that mode; allocate or restore only the task namespace's independently owned store identifiers. Tests must not read an installed selection or reuse an installed/legacy store UUID. Validate the canonical override root so a production-root alias or symlink cannot satisfy the task-root requirement.

**Acceptance:** task-only bootstrap with a simulated saved production origin and an empty test journal must refuse host construction or select a distinct test store without consulting installed state. Missing/invalid test configuration must stay unavailable. Assert the actual construction UUID/origin as well as the journal path; a temporary directory assertion alone is insufficient. Do not execute this acceptance against the real installed store.

## 2. P1 — automatic login redirects need an ownership rule before they can rotate all hosts

**References:** hidden-host prohibition at lines 154–159; automatic ordinary-workspace login transition at lines 163–168.

The first passage prohibits an automatic hidden-host callback from starting a fresh entry. The second says that an ordinary workspace navigating or redirecting to the primary login GET asks the coordinator to persist and publish a new entry, without specifying which host may do so. During ordinary workspace use there may be several registered hosts and no primary-entry lease yet. A hidden host's expired-session redirect can then be interpreted as authority to rotate the selection and retire the foreground workspace. Stable host IDs and a single coordinator serialize this event but do not decide whether it is allowed.

**Minimal correction:** distinguish `loginEntryRequested` from `loginEntryGranted`. A host may cancel its old login navigation and request resolution, but only the coordinator's current visible/interactive owner or an explicit foreground user choice can acquire a fresh entry. Hidden/passive hosts become waiting/unavailable without mutating the selection. Define initial startup's owner election and owner-window closure explicitly; do not let whichever asynchronous redirect arrives first silently win. A passive host must not revive a lease on reopening.

**Acceptance:** with two ordinary hosts on one selected epoch, a hidden host's automatic login redirect cannot rotate, retire or navigate the active host. A subsequent explicit visible recovery choice creates exactly one new lease/epoch and retires both old controllers. The already-owned entry's initial GET remains exempt from another rotation.

## 3. P1 — the before-input guarantee must cover login rendering that has no interceptable main-frame GET

**References:** before-input rotation at lines 163–168 and same-entry methods at lines 170–176.

The requirement is correct, but the sole specified enforcement event is a primary-login GET navigation. That is sufficient only if every route to an interactive login form is guaranteed to pass through that event before rendering. The contract does not currently constrain client-side routing, same-document rendering, history/BFCache restoration, or a retained page that reveals login UI after a fetch. Those are distinct from a fresh top-level document load. Merely intercepting the provider link still leaves password exposure too late, as the new section correctly states.

This is a coverage gap in the design; this review did not inspect product routes and does not claim that a particular bypass is currently implemented.

**Minimal correction:** choose and state one enforceable rule. Either require every capable-host primary-login entry and restored login page to take a host-mediated top-level entry transition, or add a bounded display gate that prevents login controls from becoming interactive until the host grants the captured entry lease. Any page signal is an entry request/display capability, never authentication authority. Native must still validate the exact origin, main frame and current host before granting. Do not copy or replay a form submission into the new store.

**Acceptance:** test the actual entry surface for server redirect, direct GET, client navigation, Back/Forward or restored page, and fetch-triggered authentication loss. In every supported case, no password field or provider control becomes interactive before selection persistence and replacement-host construction. Unsupported entry modes should remain passive or route through the explicit entry; they must not silently retain the old jar.

## 4. P2 — specify the status-result provenance and the observation-to-settlement transition

**References:** actual response plus authenticated readback requirement at lines 84–96; permitted fixed status fetch at lines 188–202.

The new section correctly excludes the Lab-aware client, cookie extraction, generic credential bridges and page-route success claims. Its allowed “fixed same-origin status fetch” still leaves the implementation boundary underspecified: a value supplied by page code or a page-overridable fetch function is not, by itself, evidence of the actual status response. A valid actor observation also cannot replace the earlier requirement for the corresponding primary write's actual completion signal.

**Minimal correction:** make the readback host-owned, fixed-route and isolated from page-supplied results. Require the actual response's exact final origin/route, expected HTTP status, no-store semantics, bounded schema and captured full context; redirects, HTML, malformed responses and stale callbacks cannot settle the lease. Keep its result type as an observed actor. Define a separate settlement operation that requires the correlated original write completion plus matching actor observation. If the password Action's completion is not observable, retain the conservative unresolved state and explicit new-entry recovery rather than clearing the marker from status alone. This does not require exporting cookies or adding a general-purpose bridge.

**Acceptance:** late status A after B, a login redirect returned to the status request, a page-supplied status value, and authenticated observation without the original completion signal must not resolve B or clear its uncertainty. The normal exact-store readback should expose only safe canonical actor metadata.

## Parts approved as written

- One injected main-actor application coordinator owns the registry and process-lock lifetime; per-browser registries and temporary fallback roots are explicitly excluded.
- A window's stable host ID lives outside the reconstructed subtree. WKWebView, browser/controller closures, anchors, observers and native representation are rebuilt together for the immutable store context.
- Epoch replacement reaches hidden hosts, and callbacks retain captured context instead of resolving a newer lease dynamically.
- Primary entry is separated from current/target credential settings; selected settings rounds retain their original logged-in store.
- Strict argument validation and TEST_HOST fail-closed bootstrap are the correct architecture, subject to the independent WK-store isolation correction in item 1.

No new backend schema, profile manager, provider authorization or store cleanup is needed to address these design gaps. The r36 report remains unchanged; this addendum neither accepts the cancelled repair9 draft nor substitutes design approval for production wiring and real app acceptance.
