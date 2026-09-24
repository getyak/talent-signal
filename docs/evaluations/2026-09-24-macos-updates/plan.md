# macOS one-click update delivery

Outcome: make real update availability visible in the account footer, with one
click authorizing that offer's verified installation and relaunch on each Mac.

Scope: native updater/consent, additive Web chrome, update documentation, native
PR checks, and the dated synthetic fixture that currently blocks trusted main CI.
No real workspace data, signing-key creation, public feed or production install
is authorized by this implementation alone. Original checkout remains untouched.

Completed: live readiness audit, custom user driver, offer-bound installation,
independent security review and fixes, eight native session tests, three Web
component tests, and real synthetic old-to-new native-click upgrade.

Active: verify isolated WebKit trusted clicks and re-review final source; update
execution evidence, commit and open a draft PR for full remote checks. Local disk
is below the heavyweight build threshold, so no full Xcode build runs locally.

Remaining acceptance: remote exact-head CI, Developer ID/notary/Sparkle credential
configuration, signed/notarized public release and feed readback, manual bootstrap
of the current unconfigured preview, and a second physical Mac update. The user
has been asked where existing credentials are stored; no answer yet.

Source of truth: [verification report](README.md), [runtime evidence](runtime-proof.txt)
and [distribution contract](../../operations/macos-distribution.md).
