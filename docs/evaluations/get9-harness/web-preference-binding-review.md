# GET-9 Web preference login-binding review

Reviewed: 2026-09-09T17:52:58.269966+00:00. Independent reviewer: `design_review`. Scope: the new preference
page binding, GET/PUT/readback propagation, proxy admission and related tests.
Only this review artifact was written; implementation and prior evidence were
unchanged.

## Outcome

No confirmed P0/P1 was found in this bounded increment. The stale-login
preference access/write path is closed at code and route-test scope. This is
not new browser interaction proof or overall GET-9 acceptance.

## Identity and request boundary

- [PreferencesPage](../../../apps/web/app/workspace/preferences/page.tsx#L11)
  rejects missing/expired claims, computes the existing HMAC from exact
  account/user/token/expiry claims, and passes it as both component key and
  `sessionVersion`. A new login therefore remounts the component and resets
  its loaded value, pending mutation and success state.
- [AgentResponsePreference](../../../apps/web/components/agent-response-preference.tsx#L6)
  sends `x-workspace-session` on initial GET, reload, PUT and post-save GET.
  The binding is a digest, not an exposed access token. A stale tab retains its
  old binding and cannot silently adopt the replacement cookie's identity.
- [The proxy](../../../apps/web/app/api/agent-preferences/route.ts#L13) reads
  claims once, checks expiry and binding before a backend read or mutation,
  and creates the backend client from that same claims object's access token.
  Missing binding or changed account/user/token/expiry returns 409; invalid or
  expired authentication returns 401. There is no second credential lookup
  between admission and dispatch.
- PUT keeps the same-origin guard and 4096-byte streaming body limit. Responses
  remain `no-store`. Canonical backend preference access remains scoped by
  account and user, with expected revision and idempotency enforcement.

## Save, readback and retry

The component preserves its mutation identity after an uncertain failure and
only displays success after GET returns the same revision and style as PUT.
The same original login binding is used for both requests. If the cookie
changes after the accepted save, readback is rejected before accessing the new
identity's preference; the UI receives an error rather than confirming the new
account's state. The original save may already have completed and is not
claimed rolled back. Reload or an unchanged-intent retry remains explicit.

The keyed component prevents an old asynchronous completion from setting state
on the replacement login's mounted component. The initial GET also has an
active-effect guard. No new cross-account display or write path was found.

## Independent verification

The route suite passed **10/10** independently. It uses the real HMAC helper
with synthetic credentials and covers unauthenticated access, cross-origin PUT,
exact mutation revision/key, body bound, stale account/user/token/expiry on both
GET and PUT, missing binding, expired login, and a login change between accepted
save and readback. Rejected cases make no preference backend calls.

The component wiring and server-page key were inspected, but no React browser
interaction test or database integration test was rerun here. The test that
changes identity between save/readback exercises route admission rather than
rendered component success/error state. Documentation checks passed after this
artifact.

## Optional contact instruction review

The small `contactIntakeSchemas.ts` instruction change removes the misleading
restriction to m1/m2 and explicitly requires the actual ID for every message
mentioned, including later messages. It names recorded speakers rather than
relative “other party” language and omits routine-exchange findings when no
material event exists. This improves guidance without granting a capability,
changing budgets or removing source checks.

It is not proof that the semantic E05 defect has been fixed. The ninth-attempt
independent quality result stays **2/3**, including the failed Trial 2 finding.
No tenth-attempt score or acceptance is asserted by this review.
