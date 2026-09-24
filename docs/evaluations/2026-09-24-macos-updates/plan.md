# macOS one-click update delivery

Outcome: make real update availability visible in the account footer, with one
click authorizing that offer's verified installation and relaunch on each Mac.

Scope: native updater/consent, additive Web chrome, update documentation, native
PR checks, and the dated synthetic fixture that currently blocks trusted main CI.
No real workspace data, signing-key creation, public feed or production install
is authorized by this implementation alone. Original checkout remains untouched.

Completed: live readiness audit, custom user driver, offer-bound installation,
independent security review and fixes, 16 focused native tests, three Web
component tests, real native and WebKit footer old-to-new upgrades, synthetic-click
rejection, archive-tamper recovery and independent final review.

Active: [PR 245](https://github.com/getyak/talent-signal/pull/245) was merged as
`9d8d72ca` during credential recovery. Native checks passed on `98050058`; the
original iOS check was still running at readback, so merge is not evidence that
all checks finished. Credential recovery guidance is in
[PR 246](https://github.com/getyak/talent-signal/pull/246). Local disk remains below
the heavyweight build threshold; no full Xcode build runs locally.

Remaining acceptance: remote exact-head CI, Developer ID/notary/Sparkle credential
configuration, signed/notarized public release and feed readback, manual bootstrap
of the current unconfigured preview, and a second physical Mac update. The user
identified the previously saved Apple credentials. They were recovered from
Infisical staging:/release and passed real notary authentication; see the
verification report. Do not ask for that location again. Developer ID Application
was not found in the checked stores; no new certificate has been created.

Source of truth: [verification report](README.md), [runtime evidence](runtime-proof.txt)
and [distribution contract](../../operations/macos-distribution.md).
