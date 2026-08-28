# Security policy

## Supported version

Talent Signal is under active development. Security fixes are applied to the
latest revision of `main`.

## Report a vulnerability

Please use
[GitHub private vulnerability reporting](https://github.com/getyak/talent-signal/security/advisories/new).
Do not open a public issue for a suspected vulnerability and do not include
candidate records, credentials, private messages, or production data in a
report.

Include the affected component, expected impact, reproduction conditions, and
any safe remediation ideas. We will acknowledge a report as soon as practical,
coordinate validation privately, and publish remediation details only after the
risk is contained.

## Credential handling

- Store application and deployment secrets in the Infisical `talent-signal`
  project. Deliver them through human CLI authentication for local development,
  GitHub OIDC for Actions, and separate least-privilege workload identities for
  staging and production.
- Keep local values in Infisical. An ignored `.env` is an offline recovery path,
  not a canonical source. Commit only `.env.example` files containing empty or
  obviously non-secret placeholders.
- Never export a complete environment to logs or diagnostics. Verify only the
  presence of explicitly named variables.
- Rotate a credential immediately if it appears in a commit, log, artifact,
  issue, pull request, or chat transcript.

See [Secret delivery](docs/operations/secrets.md) for the runtime and recovery
procedure.
