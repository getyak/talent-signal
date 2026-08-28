# Production backend operations

## Purpose

Run the smallest production backend that can support account-scoped iOS Sign
in with Apple without reusing the synthetic localhost topology. The production
stack contains PostgreSQL, one migration runner, the Fastify API, and Caddy for
TLS. It intentionally contains no seed service and never exposes PostgreSQL on
a host port.

## Host contract

The host needs Git, Docker Engine, Docker Compose, public TCP ports 80 and 443,
and enough persistent disk for PostgreSQL and Caddy certificate state. Point the
API hostname at the host before expecting Caddy to obtain a public certificate.

Create `/etc/talent-signal/production.env` from
`deploy/production/environment.example`, replace every placeholder, restrict it
to the deployment owner, and never copy it into the repository. The database
password must be URL-safe because Compose constructs `DATABASE_URL` from the
three PostgreSQL fields. `API_DOMAIN` and the host in
`TALENT_SIGNAL_API_BASE_URL` must identify the same endpoint.

## Deploy

Use a clean checkout of the verified `main` revision:

```bash
git pull --ff-only origin main
TS_PRODUCTION_ENV_FILE=/etc/talent-signal/production.env \
  ./scripts/deploy/production-backend.sh
```

The script validates configuration without printing interpolated secrets,
builds one backend image for both the API and migration runner, starts
PostgreSQL, runs forward migrations exactly once, and then starts the API and
TLS proxy. It does not seed data. A failed migration stops before the API or
proxy is replaced.

## Verify

Verify both internal state and the public boundary:

```bash
docker compose --project-name talent-signal-production \
  --env-file /etc/talent-signal/production.env \
  --file compose.production.yaml ps
curl --fail --silent --show-error https://api.gettalentsignal.com/health/live
node scripts/ios/probe-auth-backend.mjs \
  --env-file /etc/talent-signal/production.env
```

Only after the public authentication probe succeeds should the same HTTPS
origin be stored as the `TALENT_SIGNAL_API_BASE_URL` variable in the GitHub
`testflight` Environment.

## Chat media object storage

Production uses a private S3 bucket for scoped Chat image content. Set
`CHAT_MEDIA_STORAGE_PROVIDER=s3`, the bucket and region, and optionally an
S3-compatible HTTPS endpoint and path-style addressing in the production
environment. Prefer the host's AWS workload identity; use
`AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` only when the deployment cannot
provide one. The principal needs only object read, write, and delete access to
the configured bucket. Keep public access blocked and enable bucket encryption,
versioning, access logging, and a lifecycle policy aligned with the future Chat
retention decision.

Local development defaults to the `talent_signal_chat_media` Docker volume.
That volume contains private task media and must not be copied into fixtures,
analytics, logs, or support bundles. Database restore without the matching
object-store version is incomplete; object restore without its account-scoped
metadata is unusable and should be quarantined rather than exposed.

## Updates and rollback

Record the deployed commit before every update. Pull only fast-forward `main`,
run the deployment script, then observe readiness and the authentication probe.
Application rollback uses the prior verified commit and the same script.
Database migrations are forward-only; take a provider snapshot or governed
PostgreSQL backup before a migration that changes stored data.

Docker logs are locally rotated. They must not be copied into analytics or
support systems without checking for private evidence. The database volume,
Chat media volume or bucket, and any backup remain candidate-data stores subject
to the repository's retention, authorization, deletion, and access boundaries.
