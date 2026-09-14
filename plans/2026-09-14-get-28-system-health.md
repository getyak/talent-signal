# GET-28 system health

## Outcome

Give a signed-in recruiter a quiet, evidence-bound answer to whether the current
Web request path can reach the required backend and database state. Healthy state
must not add dashboard noise; abnormal state must identify the narrow blocking
component and support an explicit retry.

## Scope

In scope: the Web request boundary, Backend API handler, PostgreSQL query, required
schema migrations, initial workspace observation, abnormal notice, dedicated
diagnostics page, tests, and operational documentation.

Out of scope: a generic infrastructure dashboard, incident paging, polling,
historical metrics, provider health, Opik export, browser execution, person
research, Tailscale exposure, and any candidate or account content.

## Evidence and decisions

- Existing `/health/live` and `/health/ready` endpoints already serve deployment
  probes and must remain compatible.
- The resident backend and its PostgreSQL readiness probe returned `200` before
  implementation, but that only proved the old readiness boundary.
- Kubernetes and GitLab separate cheap liveness/readiness probes from component
  diagnostics. Spring Boot restricts component detail. The selected design keeps
  public probes minimal and puts sanitized component observations behind the
  existing account session.
- The browser recomputes aggregate status from all four components. Missing,
  duplicated, stale, or malformed evidence never becomes healthy.
- Optional systems remain explicitly outside this observation instead of being
  inferred from backend availability.

Rejected alternatives: exposing raw dependency errors publicly; probing every
optional integration during startup; continuous browser polling; presenting four
independent KPI cards; treating a missing migration as a database outage.

## Milestones

1. **Complete** — define the versioned health response and backend component observer.
2. **Complete** — add the authenticated no-store Web proxy and safe failure mapping.
3. **Complete** — add the quiet workspace notice, diagnostics page, retry, and stale state.
4. **Complete** — focused and full tests, typechecks, lint, docs checks, and a
   production build passed. A browser run verified healthy, unavailable/unknown,
   retry, and recovery states against a temporary migrated database; the database
   and all local test artifacts were removed afterward.
5. **Active** — independent review passed with P0=0/P1=0 after its findings were
   fixed and re-reviewed. Create the PR, verify current-head CI, merge, then read
   back Linear and update the existing Notion operations page.

Independent review found two P1 lifecycle gaps: a 401 could retain an older
healthy observation, and stalled browser or server requests had no deadline. The
implementation now uses an atomic state reducer, clears evidence on session
expiry, offers callback-preserving login recovery, and enforces four-second
server and six-second browser deadlines. Timeout, cancellation, healthy-to-401,
and future-clock-skew regressions are covered; independent re-review confirmed
P0=0 and P1=0.

## Completion evidence

- Contract, backend, Web proxy, parsing, and stale/unknown tests pass.
- Backend and Web typechecks, Web lint, production Web build, and `pnpm docs:check` pass.
- A real authenticated diagnostics page renders the four required components and
  manual retry; abnormal state remains actionable without exposing raw errors.
- Independent review has no unresolved P0/P1 findings.
- The GET-28 PR is merged at a verified SHA, Linear reflects the merged delivery,
  and the existing Notion operations page contains the concise decision and links.
