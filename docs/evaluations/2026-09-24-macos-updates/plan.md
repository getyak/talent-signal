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

Active: [draft PR 245](https://github.com/getyak/talent-signal/pull/245) is open;
await final-head remote CI. The first full macOS check passed on 2396ab6a. Local disk
is below the heavyweight build threshold, so no full Xcode build runs locally.

Remaining acceptance: remote exact-head CI, Developer ID/notary/Sparkle credential
configuration, signed/notarized public release and feed readback, manual bootstrap
of the current unconfigured preview, and a second physical Mac update. The user
has been asked where existing credentials are stored; no answer yet.

Source of truth: [verification report](README.md), [runtime evidence](runtime-proof.txt)
and [distribution contract](../../operations/macos-distribution.md).
