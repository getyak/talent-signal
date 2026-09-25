# Account settings design review

Date: 2026-09-25. This is prototype evidence, not a deployed feature or a
successful account/synchronization test.

[Interactive preview](design-preview.html) contains only synthetic identity
labels and demonstration states. It sends no credentials or product mutations.

## Adopted direction

Use one quiet reading column with a primary account identity, three provider
rows, automatic synchronization and device sessions. Direction A uses whitespace
and row dividers. Direction B encloses each method in its own card; it consumes
more vertical space and visually separates credentials that should read as one
account. A is the implementation reference. The existing product's components
and official provider symbols remain authoritative.

Normal settings expose actual method status and the next available action.
Binding review places the original account and verified provider identity
before confirmation. An authenticated historical conflict exposes one recovery
entry before showing any cross-account inventory. Offline status offers retry;
normal synchronization does not ask the user to enable a setting.

## Observations and corrections

- Rendered both directions at the browser's default narrow panel.
- Checked the adopted direction at 390 by 844 and 1280 by 900 CSS pixels.
- Opened normal, binding and conflict states visually; checked the offline
  message and retry action through the accessibility tree.
- Corrected a narrow-layout omission: `Connected` status remains visible beside
  Google rather than relying on the ambiguous `Manage` action to imply it.
- Replaced an unclear password glyph with a key symbol and removed a duplicated
  current-device label. Main controls have a minimum 44-pixel height.
- Reset the temporary browser viewport override after review.

Pending implementation-level craft evidence: dark mode, Dynamic Type, keyboard
focus through real authentication, error persistence, actual provider assets,
long provider hints and screen-reader behavior in native iOS. The prototype's
example success/last-checked labels must never be copied as unconditional live
claims. Follow the [parent acceptance plan](parent-acceptance-plan.md).
