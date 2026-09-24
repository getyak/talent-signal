# ADR 0017: Bounded desktop maintenance controls

## Context

The shared Web workspace needs a quiet update indicator beside the account avatar,
while connection changes and software installation belong to the native host.
A separate native footer would duplicate account chrome and overlap a collapsed
sidebar. A general JavaScript-to-native bridge would grant excessive authority.

## Decision

The installation-consent portion is amended by [one-click desktop updates](2026-09-24-one-click-desktop-updates.md). Other capability and distribution boundaries remain unchanged.

Retain the Web product and separate native capability tools from ADR 0016. Permit
one narrow exception: the host injects only a protocol version and optional update
version into its exact-origin main frame. The Web renders a compact update link
and a connection-settings link. Unsupported hosts render neither.

Two exact navigation targets can open native settings or Sparkle's standard review
UI. The host rejects other targets, parameters, subframes, foreign origins and
non-link navigation. These links cannot set an origin, change a feed, retrieve
credentials, capture content, download arbitrary files or install an update.
Navigation type is a usability gate, not sufficient installation authorization;
Sparkle's native human decision remains required even for a compromised page.

Use pinned Sparkle 2 with signed feeds and archives. Only Developer ID signed,
notarized releases enter the production feed. Scheduled reminders do not steal
focus; the account indicator and native menu remain available until review ends.
Automatic installation is disabled. Test origins never become update sources.

Workspace settings accept an HTTPS origin or a workspace link, with explicit
loopback-only HTTP development mode. Each canonical scheme/host/port uses a
separate persistent WebKit data store. A service switch requires a native decision
and reload; probes use an ephemeral cookie-free session and reject off-origin
redirects. Diagnostics contain no account, origin, cookies or conversation text.

## Consequences

The first launch of this version needs a fresh Web login because existing default
WebKit storage is not silently copied into a new origin partition. Existing data
is not deleted. The host can update independently of the business service, and
older Web deployments retain native menu/settings access.

This supersedes ADR 0016 only for the display snapshot and two maintenance links.
Capture, OCR, Keychain and domain-action authority remain separately authorized.
A local signed-archive rehearsal demonstrates updater behavior but is not evidence
of Apple notarization, public feed publication or production workspace health.

## References

- [Sparkle gentle reminders](https://sparkle-project.org/documentation/gentle-reminders/)
- [Sparkle publishing](https://sparkle-project.org/documentation/publishing/)
- [Apple notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
