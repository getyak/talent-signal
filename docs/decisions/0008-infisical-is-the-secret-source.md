# ADR 0008: Infisical is the canonical secret source

## Context

Talent Signal currently receives credentials from ignored local `.env` files,
host environment files, and GitHub secrets. That is convenient for individual
surfaces but creates several independently mutable copies of high-impact
credentials. Adding model providers increases the likelihood of drift, stale
keys, accidental cross-environment reuse, and incomplete rotation.

The organization already owns an Infisical Secrets Management project for
Talent Signal with development, staging, and production environments.

## Decision

Use Infisical as the canonical store for application and delivery secrets.
Applications continue to consume environment variables and do not depend on an
Infisical SDK. Infisical injects values into a process at runtime through:

- a human CLI session for local development;
- GitHub OIDC for CI and release workflows;
- separate least-privilege Machine Identities for staging and production.

The repository may commit project IDs, identity IDs, environment names, and
empty examples. It never commits provider keys, machine client secrets, access
tokens, or exported secret values.

## Alternatives considered

- Keep `.env` and GitHub as separate sources: simplest short term, but makes
  ownership and rotation ambiguous.
- Add an Infisical SDK to every application: supports dynamic reads, but couples
  domain code to one secret vendor and adds runtime failure modes.
- Export Infisical secrets to persistent `.env` files: preserves existing
  scripts but recreates plaintext copies and undermines one-source ownership.
- Use one organization OAuth Application or shared Service Token: reduces setup
  count but widens authority and leaves a long-lived credential with excessive
  blast radius.

## Consequences

- application configuration remains provider-neutral and testable through
  `process.env`;
- local and workload startup commands must perform secret injection before
  starting the application;
- each workload receives only its environment and capability paths;
- GitHub-held long-lived application secrets are migrated or removed only after
  OIDC readback and the relevant workflow pass;
- ignored `.env` files remain temporary offline recovery inputs, not canonical
  configuration;
- a secret change is complete only after destination runtime verification and
  revocation of the superseded credential.

## Reconsider when

Revisit the delivery mechanism if Infisical cannot provide the required region,
availability, audit, identity federation, or deletion guarantees. Replacing
Infisical must preserve runtime injection, least privilege, environment
isolation, and a single authoritative secret source.
