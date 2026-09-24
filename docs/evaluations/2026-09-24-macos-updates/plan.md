# macOS one-click update delivery

Outcome: make real update availability visible in the account footer, with one
click authorizing that offer's verified installation and relaunch on each Mac.

Scope: native updater/consent, additive Web chrome, update documentation, native
PR checks, and the dated synthetic fixture that currently blocks trusted main CI.
The user subsequently authorized completing signing, release configuration and
credential archival on 2026-09-25. Original checkout remains untouched. No real
workspace evidence is needed for release verification.

Completed: live readiness audit, custom user driver, offer-bound installation,
independent security review and fixes, 16 focused native tests, three Web
component tests, real native and WebKit footer old-to-new upgrades, synthetic-click
rejection, archive-tamper recovery and independent final review.

Active: [PR 245](https://github.com/getyak/talent-signal/pull/245) merged as
`9d8d72ca`; credential recovery guidance [PR 246](https://github.com/getyak/talent-signal/pull/246)
merged as `2bb4641d` after current-head checks passed. A subsequent prerequisite
check adds secret-free diagnostics and a regression for special-character paths.
Local disk remains below the heavyweight build threshold; no full local Xcode
build or Simulator is used.

Provisioned and read back: existing App Store Connect credentials bound to the
three `MACOS_NOTARY_*` names and authenticated successfully with Apple;
production Sparkle key pair stored in Infisical and cryptographically verified;
separate macOS OIDC identity restricted to the exact main release workflow and
eight staging release secrets, with its ID set in GitHub. OIDC configuration
readback is not a live GitHub exchange.

Remaining acceptance: Developer ID certificate creation and secure P12 storage,
live CI OIDC, signed/notarized release and feed readback, bootstrap of the
unconfigured preview, and a second physical Mac update. The logged-in Apple
portal confirms no Developer ID Application certificate and permits G2 creation.
A CSR and owner-only private key are prepared locally. Browser control reached
the file chooser but could not confirm the path; no certificate was issued.
The browser tool's action-time confirmation for a new signing credential was
requested and is pending. Do not recreate the notarization or Sparkle keys.

Source of truth: [verification report](README.md), [runtime evidence](runtime-proof.txt)
and [distribution contract](../../operations/macos-distribution.md).
