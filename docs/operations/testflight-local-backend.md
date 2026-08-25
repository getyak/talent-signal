# Internal TestFlight backend on Tailscale

## Purpose

Run the account-scoped iOS backend on an operator-owned Mac for owner-only or
small, explicitly authorized internal TestFlight testing. Tailscale Serve
terminates HTTPS and forwards only to the API on Mac loopback. PostgreSQL stays
inside the Docker network and has no host or tailnet port.

This topology is an internal release bridge, not the production backend
decision. It requires the Mac, Docker, the API containers, and Tailscale to stay
online. Every testing iPhone must run Tailscale and join the authorized tailnet.
Use the public production topology before external TestFlight or App Store use.

## Configure

Copy `deploy/testflight/environment.example` to the ignored
`.env.testflight`, replace the PostgreSQL value, and set
`TALENT_SIGNAL_API_BASE_URL` and `ALLOWED_ORIGINS` to this Mac's exact Tailscale
MagicDNS HTTPS origin. Generate a URL-safe PostgreSQL password such as
`openssl rand -hex 24`, set the runtime file to mode `0600`, and do not commit
it.

The TestFlight Compose boundary differs from synthetic development:

- simulated authentication is always disabled;
- Sign in with Apple is enabled for `com.talentsignal.app`;
- no synthetic seed runs;
- PostgreSQL is internal-only;
- the API publishes only on `127.0.0.1`;
- Docker logs rotate locally.

## Start and verify

With Tailscale connected and Docker running:

```bash
TS_TESTFLIGHT_ENV_FILE=.env.testflight \
  ./scripts/deploy/testflight-local.sh
```

The script validates that the configured URL exactly matches the Mac's current
MagicDNS hostname, builds one API image, starts PostgreSQL, applies migrations,
starts the API, configures Tailscale Serve, and verifies the Apple authentication
challenge through HTTPS. It stops before GitHub or TestFlight configuration if
any boundary fails.

For an ordinary restart with an already verified local image, skip the network
build without changing the runtime boundary:

```bash
TS_TESTFLIGHT_REBUILD=false \
TS_TESTFLIGHT_ENV_FILE=.env.testflight \
  ./scripts/deploy/testflight-local.sh
```

Rebuild after backend or contract code changes.

Only after that probe succeeds, store the same HTTPS URL as the
`TALENT_SIGNAL_API_BASE_URL` variable in the GitHub `testflight` Environment.
It is a build-time value, but the endpoint remains tailnet-only.

GitHub-hosted runners are not tailnet members by default. Create a dedicated
Tailscale OAuth trust credential with only `Devices > Core > Write` and
`Keys > Auth Keys > Write`, restricted to an admin-owned `tag:ci`. Store its
client ID and secret as `TS_OAUTH_CLIENT_ID` and `TS_OAUTH_SECRET` in the same
GitHub Environment. The release workflow joins each runner as an ephemeral
`tag:ci` node, proves tailnet reachability, probes the Apple authentication
contract, and logs out the node when the job finishes. Never store those values
in repository variables, files, or logs.

Changing backend code does not require a new iOS archive while the origin and
API contract remain compatible. Changing the origin requires a new archive.

## Operating boundary

Keep the Mac awake and on power, start Docker after login or reboot, and verify
`tailscale serve status` plus the HTTPS health endpoint before testing. Docker's
`unless-stopped` policy restarts the database and API after its runtime starts;
Tailscale stores the Serve configuration on the node.

If the Mac uses a local HTTP proxy, exclude the MagicDNS hostname when probing
from the Mac. The deployment script already bypasses process proxy variables
for its tailnet health and Apple challenge checks.

To pause access without deleting PostgreSQL data:

```bash
tailscale serve reset
docker compose --project-name talent-signal-testflight-local \
  --env-file .env.testflight \
  --file compose.testflight.yaml down
```

The database volume remains candidate-data storage subject to the repository's
authorization, retention, deletion, and access boundaries. Never use Funnel for
real candidate evidence without a separate public exposure and security review.
