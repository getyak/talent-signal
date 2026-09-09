# Account management and access clarity

## Outcome

Give authenticated Web users a truthful account/security page, workspace management,
and discoverable isolated test workspaces; summarize actual administrator/default
account access on the existing Talent Signal Notion home. Preserve iOS session
contracts and other active development.

## Scope and decisions

- Worktree: `codex/account-management`, based on `56292d3c`.
- Backend owns profile, workspace ownership, member administration, session
  revocation, and audit records. New endpoints never use Web fixture fallback.
- Add an explicit workspace owner without adding a third role to existing iOS
  session contracts. Backfill only unambiguous single-user personal workspaces.
- Keep provider linking, membership migration, invitations, SSO, Passkey and
  password recovery out of this slice; do not advertise them as available.
- Reuse Lab workspace isolation, expiry and cleanup. No production default login
  or new shared administrator credential.
- Preserve current root `next-env.d.ts` and concurrent GET-9/GET-23 worktrees.
- Notion destination: `3d3a444a-6c00-814b-8a11-f4ae419c23e6`; edit only an access
  summary near existing operational links, preserving databases and product notes.

## Milestones

1. Complete: backend authority, typed account readback and mutations, focused tests.
2. Complete: Web account controls, settings and isolated test workspace lifecycle.
3. Complete: local backend deployment, account and isolated-session browser
   verification, documentation, Notion update and destination readback.
4. Active: final CI, temporary runtime cleanup, and browser handoff.

## Proof

Verify cross-account denial, owner protection, stale revision conflicts, own-session
revocation restrictions, credential redaction, disabled test access, expiry and
replay where relevant. Run backend integration checks against a disposable DB,
Web typecheck/lint/tests/build, and `pnpm docs:check`. Inspect authenticated real
browser behavior and read back Notion. Do not reset or seed the shared backend.

## Sources

- Next.js bundled 16.3.4 documentation: Server Functions, cookies and data security.
- https://react.dev/reference/react/useActionState
- https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/
- Existing `labWorkspaceRoutes.ts` / `labWorkspaces.ts` lifecycle contracts.

## Verification record

- PostgreSQL integration evaluation passed: ownership bootstrap/transfer,
  credential redaction, replay/stale revision, cross-account denial, member
  suspension/reinstatement, and isolated Lab entry/verified cleanup.
- Final Web suite: 363 passed, 1 skipped, including request-scope tests.
- Backend suite: 375 passed, 71 pre-existing skipped tests. TypeScript, Web lint,
  production Web build and documentation checks passed.
- Full Lab lifecycle evaluation verified physical media deletion, parent
  revocation, expiry, zero residual data, preserved original rows and fail-closed
  behavior for unknown tables/media and late writes.
- Inspection found missing Lab table coverage for post-045 migrations; an explicit
  migration now covers the known account tables and two global Google tables.
- Local backend deployed from `90763636`; migration 059 and revision read back.
- Browser verified the real Google login/owner, created a one-hour empty test
  workspace, entered it and returned to the primary account twice. A visible
  banner overlap was corrected and rechecked.
- Notion access summary updated and read back without replacing existing page
  content. Draft delivery: https://github.com/getyak/talent-signal/pull/169.
- Empty workspace cleanup currently awaits a native browser confirmation that
  CUA cannot access. Its one-hour expiry remains active.
