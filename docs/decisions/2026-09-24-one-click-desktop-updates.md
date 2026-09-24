# One-click desktop updates

## Context

The owner requested a quiet account-footer indicator with one explicit click to
update and restart, without Sparkle's second application confirmation. A generic
check must not silently become consent when a newer native client meets an older
hosted Web page.

## Decision

Amend ADR 0017 only for installation consent. The custom Sparkle 2.10 user driver
holds a verified applicable offer with a one-use UUID. Display metadata includes
phase, version, progress and that UUID; the token identifies an offer, not a secret.
Generic `updates` links only check. `install-update?offer=<UUID>` can authorize only
the current offer and cannot be accepted by the navigation delegate.

An injected click listener in a named `WKContentWorld` accepts `event.isTrusted`
only. Its message handler exists only in that world, unavailable to page scripts.
Native code validates the configured source origin, main frame, exact command
shape and active offer. `.linkActivated` is not proof of a human gesture. The
listener is restored whenever display scripts are replaced for future navigation.
Native menu/settings buttons bind the same offer token directly.

That one click covers download, verified archive installation and relaunch.
Sparkle retains all signature, compatibility and installation responsibilities;
there is no automatic-download consent. Failures revoke authorization. Stale or
repeat offers cannot authorize another version. A staged update still needs its
own explicit click. No private WebKit API or Gatekeeper bypass is used.

## Consequences

Scheduled checks remain quiet and idle states hide the footer control. Progress
and recoverable failure stay in place. Older Web deployments retain native menu
and settings access; their generic check link never installs. A stopped app cannot
show its in-app indicator until it runs again. Another Mac must first install a
trusted build containing the same production feed and public key.

This supplies no capture, credentials, account, domain-action or configurable-feed
API. A compromised workspace still controls its page presentation; this change
specifically prevents script-only navigation from granting update consent.
Production signing, notarization and public-feed verification remain separate
release gates. Local synthetic rehearsal is not cross-device acceptance.

## Sources

- [Sparkle user driver](https://sparkle-project.org/documentation/api-reference/Protocols/SPUUserDriver.html)
- [Apple content-world message handlers](https://developer.apple.com/documentation/webkit/wkusercontentcontroller/add(_:contentworld:name:))
