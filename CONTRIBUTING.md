# Contributing

## Development checks

Install the toolchain declared by the repository, then run:

```bash
pnpm install --frozen-lockfile
pnpm check
```

For iOS changes, also run:

```bash
./scripts/ios/check.sh
```

Validate CI policy locally with:

```bash
./scripts/ci/check-actions-pinned.sh
./scripts/ci/check-secrets.sh
./scripts/ci/install-actionlint.sh /tmp/talent-signal-bin
/tmp/talent-signal-bin/actionlint
```

## Pull requests

Keep a pull request focused on one outcome. Describe the product impact, the
evidence and safety implications, and the checks you ran. Never add real
candidate data, access tokens, signing certificates, or private conversation
content to source, fixtures, screenshots, logs, or artifacts.

The `main` branch requires the stable `CI required` and `Security required`
checks. iOS TestFlight publication is a separate protected deployment and is
not performed by pull-request code.
