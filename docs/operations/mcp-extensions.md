# MCP extensions operations

The MCP extensions surface has two directions with different trust models.
It lives at `/workspace/extensions`. The legacy `/workspace/plugs` route
redirects there and keeps captures and meeting drafts reachable through the
page's utility links.

## Inbound: Talent Signal as MCP client

A user adds a friendly name, an HTTPS Streamable HTTP server URL, and an
optional bearer secret. Saving a URL is not a connection. A record becomes
`verified` only after a real `initialize`, `notifications/initialized`, and
`tools/list` handshake succeeds. Other statuses are `disconnected`, `failed`,
and `unauthorized`.

Rejected URLs: non-HTTPS origins (except an exact deployment allowlist entry),
embedded credentials, query strings, fragments, single-label or internal host
names, and any hostname that resolves to a loopback, private, link-local,
carrier-grade NAT, documentation, multicast, or cloud metadata address. IPv6
mapped, NAT64, and 6to4 forms are unwrapped before classification. Every
connection resolves the hostname once, requires every returned address to be
public, and pins the chosen address for the request so a later DNS answer
cannot rebind the API call into a private network. Redirects are refused.

The stored bearer secret is encrypted with AES-256-GCM. The API never returns
the secret; it returns only `credential_configured`. Disconnecting clears both
the credential and the cached discovery. Changing the endpoint without
supplying a new secret also clears the credential, so an old origin's secret
is never sent to a new origin. A concurrent edit or disconnect wins over a late
handshake response through a revision guard.

Handshake bounds: 10 second total DNS/handshake budget, 1 MiB response, 240,000-byte normalized directory, 100 tools, 5
tool-list pages, 20 000 character input schema per tool, and 2 000 character
descriptions. Error codes and their messages are owned locally: remote
JSON-RPC error text and transport exception text are never returned or
persisted, so a hostile server cannot make Talent Signal store or echo its own
request credential. Tool names and descriptions are stored and displayed as
inert text. Tool discovery never registers an agent, executes a tool, or grants
broader access. Unsupported OAuth returns an explicit requires-auth state;
Talent Signal never opens an arbitrary authorization link.

## Outbound: Talent Signal as MCP server

The published endpoint is a stateless Streamable HTTP MCP server. It supports
`initialize`, `notifications/initialized`, `ping`, `tools/list`, and
`tools/call`. `GET` returns `405` because there is no server-initiated stream.
Protocol versions `2025-11-25` and `2025-06-18` are negotiated; a follow-up
request that declares another `MCP-Protocol-Version` is rejected with `400`.

Grant tokens are random, prefixed with `tsmcp_`, workspace-scoped, and stored
only as a SHA-256 hash. The raw token is revealed exactly once at creation and
is never written to storage, URLs, logs, or browser localStorage. Expiry is at
most 30 days. Revocation is checked on every request, so a revoked or expired
token returns `401` immediately. A grant is also rejected when its issuing user
is no longer active, when the account is outside the deployment audience, or
when a lab issuer's test workspace is no longer active and unexpired. Browser
login session tokens are not accepted because only the grant table is
consulted. Creating a token re-locks the account and then the issuing user in
the same transaction as account suspension, and requires the issuing browser
session to still be live, so a request authenticated before a suspension
cannot insert a grant that a later reactivation would revive.

Each grant carries an explicit scope set:

- `workspace_metadata_read`: workspace name, slug, and active people count.
- `people_directory_read`: a bounded projection of active people (display
  name, user-authored headline and summary, activity counts, context labels).
  Contact handles, raw evidence, and messages are excluded.

`tools/list` is filtered by the grant, and `tools/call` fails closed for
unknown or unauthorized tool names. Tools are read-only; there is no arbitrary
query and no write. The people-directory tool returns at most 20 rows from the
canonical directory. Request bodies are bounded to 128 KiB and the route is
rate limited.

Origin validation accepts a request with no `Origin` (native clients) or an
`Origin` exactly equal to the configured public origin. It is not a CORS
opt-in for arbitrary sites.

## Configuration

- `TALENT_SIGNAL_MCP_ENCRYPTION_KEY`: 32-byte base64 key for credential
  encryption. Without it, saving a bearer secret is refused with
  `MCP_CREDENTIAL_UNAVAILABLE`; connections without a secret still work.
- `TALENT_SIGNAL_MCP_ALLOWED_ORIGINS`: comma-separated exact origins for
  trusted local developer servers. Each entry must be a bare origin, HTTPS
  except for an HTTP loopback origin, with no userinfo, path, query, or
  fragment. This is deployment configuration and is never browser-controlled.
- `TALENT_SIGNAL_MCP_PUBLIC_ORIGIN`: the absolute public web origin used to
  render the published endpoint as `https://<origin>/api/mcp`. It comes from
  configuration, never from a request `Host` header, and is rejected unless it
  is a bare HTTPS origin (or an HTTP loopback origin) with no userinfo, path,
  query, or fragment. Until it is set, the UI shows a deployment notice and
  refuses to create a client token.

Rotating `TALENT_SIGNAL_MCP_ENCRYPTION_KEY` makes existing stored credentials
unreadable. The affected connections fail closed; disconnect and re-add them
with the secret to recover.

## Data model

Migration `072_mcp_extensions` adds `mcp_connections` and `mcp_client_grants`,
both account-scoped and covered by the lab test-workspace write guard.
`mcp_connections` stores bounded discovery output and the encrypted credential.
`mcp_client_grants` stores the token hash, hint, scopes, expiry, and revocation.

## Deadlines

Every outbound leg is bounded: DNS resolution 5 seconds within a shared 10
second DNS/handshake budget, the Web management adapter 12 seconds, the Web workspace
snapshot 8 seconds, and the published `/api/mcp` proxy 15 seconds including the
response body read. Incoming request bodies are also bounded: reading a stalled
body stops after 10 seconds and is answered `408`, while an oversized body is
answered `413` (64 KiB on the Web management adapter, 128 KiB on the published
endpoint). A timeout is reported as a timeout (`504` for an upstream leg); it is
never reported as success.

## Web boundary

The web app exposes same-origin management routes under `/api/extensions`;
they forward only an allowlisted set of paths with the signed-in workspace
token and never become a generic proxy. The published endpoint is
`/api/mcp`. Its route accepts only MCP transport headers (authorization,
content type, accept, session id, protocol version) and deliberately does not
attach browser login cookies. The Next middleware admits only the exact
`/api/mcp` path outside the workspace session guard.

## Explicit non-goals

OAuth, dynamic client registration, stdio transport, sampling, prompts,
resources, agent registration, and tool execution are not implemented. The
published surface is read-only.
