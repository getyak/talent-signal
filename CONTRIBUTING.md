# Contributing

## Development checks

Install the toolchain declared by the repository, then run:

```bash
pnpm install --frozen-lockfile
pnpm wiki:build
pnpm wiki:test
pnpm check
```

`pnpm wiki:build` must produce no uncommitted generated changes after the
source and compiled wiki are committed. Install the local push gate once with
`pnpm hooks:install`; CI runs the same read-only wiki check.

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

New knowledge articles begin in `_index/inbox/`, and reviewed source pages live
in `_index/pages/`. Generated `docs/` pages must be changed through their
source and compiler.

The `main` branch requires the stable `CI required` and `Security required`
checks. iOS TestFlight publication is a separate protected deployment and is
not performed by pull-request code.
