# Account management verification

## Outcome and scope

Web account/security, existing member management, explicit personal-workspace
ownership and isolated internal test access. Existing iOS admin/member session
contracts are preserved. No invitations, provider linking, Passkey or global
membership migration is represented as implemented.

## Verified

- Backend TypeScript check passed.
- Backend unit suite: 375 passed, 71 pre-existing skipped tests across 3 files.
- Web lint and TypeScript checks passed.
- Final Web unit suite: 363 passed, 1 pre-existing skipped test.
- Production Web build passed with transient Infisical development configuration.
- Documentation, generated Wiki and architecture checks passed.
- Disposable PostgreSQL integration: ownership bootstrap and transfer, own profile
  readback, secret redaction, idempotent replay, stale revision conflict,
  cross-account target denial, current-owner protection, member suspension,
  old-session invalidation after reinstatement, Lab entry and verified cleanup.
- Encrypted test-session tests: valid round-trip, explicit return, tampering,
  expired envelope, and primary-session mismatch.
- Two additional transport tests passed: retain the rendered workspace identity
  and caller headers on API requests; never disclose workspace scope externally.
- Full Lab lifecycle evaluation passed: empty creation, credential replay without
  echo, child logout, parent revocation, physical media deletion, zero residual
  account data, preserved original rows, schema-drift and unknown-media blocks,
  in-flight drain, late-write rejection and expiry cleanup. No external model
  calls or business writes were made by that evaluation.

## Review decisions

- Default configured Web accounts are development-only; production cannot enable
  the shared fixture identity by setting a flag.
- An explicit owner column avoids changing existing mobile role enums. Only
  unambiguous sole-user personal workspaces are backfilled.
- Every administrative mutation reloads current authority and serializes on its
  workspace. No JWT role is accepted as mutation authority.
- Account mutations carry the visible workspace identity. Product requests carry
  a rendered scope header so another tab's workspace switch cannot silently
  retarget an old request. Test cookies never silently fall back on expiry.
- Lab cleanup was fail-closed due to known post-045 tables missing from the
  manifest. An explicit migration classifies those tables and installs write
  guards; unknown future tables remain blocked.

## Runtime and destination readback

- Notion home updated and fetched back on 2026-09-10 (Asia/Shanghai): added only
  the compact account/testing entry section. Existing product notes, native page
  references and all embedded databases remain present.
- Destination: https://app.notion.com/p/3d3a444a6c00814b8a11f4ae419c23e6
- Rebuilt and deployed the local TestFlight backend from `90763636`. Read back
  that exact container revision and ready migration `059_lab_account_cleanup`.
  Deployment probes passed, including Apple challenge and voice/chat providers.
- The current Google login remained usable at `http://localhost:3000`.
  Browser inspection verified the configured Google method, absence of a
  password method, current session and personal-workspace owner status.
- Browser flow created one empty one-hour workspace, entered an isolated Test
  user with zero work items, and returned to the original account twice.
- Visual inspection found the Lab launcher covered the return button. Grouping
  the button beside its workspace label fixed the overlap; a second screenshot
  verified the visible return action and correct child-workspace account title.
- The empty workspace cleanup confirmation is awaiting manual browser dismissal:
  CUA lost access to the JavaScript dialog. Backend cleanup is independently
  covered by both disposable integration evaluations above.
- CI caught an unregistered evaluation database environment variable. It is now
  owned by the existing Infisical manifest and its policy tests pass.
- The overloaded 6 GB Colima VM needed a temporary 1 GB swap file during the
  build (`/tmp/talent-signal-account-build.swap`). It is not persisted in boot
  configuration. Retained at handoff because almost all swap remained in use
  and available RAM was below that amount; forced removal could disrupt other
  running services. Remove with `swapoff` only after resource pressure subsides.
