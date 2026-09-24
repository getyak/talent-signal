# Unified account and cross-device synchronization

## Outcome and ownership

User request: design one unique email account with multiple settings-managed
sign-in methods, default shared People and Session history, then delegate
implementation/testing to local Pi and independently verify iOS, Web and macOS.

Parent owns architecture, design, independent review, user interaction, source
integration and delivery. Pi owns implementation and local verification in its
isolated worktree; one active Pi writer. Other root-checkout work is unrelated.
Design authority: [ADR 0018](../docs/decisions/0018-unified-account-login-and-sync.md).

## Baseline and evidence

- Fresh origin/main: `6cad31f449aee8c9d905def7d30b339e1024ce5b`.
- Parent worktree: `/Users/cubxxw/data/talent-signal-account-sync`, branch
  `codex/unified-account-sync`. Original checkout remains dirty and untouched.
- Runtime inspected in preceding inquiry: backend/Web revision `973e7913`;
  same-email Google/password users have distinct account and user IDs. Only
  aggregate metadata was read; no conversation or contact content was accessed.
- Current password registration checks only password_human email duplicates;
  password login also filters that kind. Existing auth_identities already
  supports several provider credentials per user.
- iOS foreground refreshes Sessions but omits workspace/People refresh.
- macOS uses the Web product surface. Its cookie store remains device/origin
  scoped, while product data must be canonical and shared.
- Dependencies: React 19.2.8, Next 16.3.4, Auth.js beta.32, Fastify 5.12.5,
  jose 6.2.12, PostgreSQL 18. Official references are in the ADR.
- Storage audit: 150 GiB available, three allowlisted simulators. Unrelated
  registered artifacts remain untouched. Task artifacts:
  `/private/tmp/ai-test-account-sync.umqxBi`.

## Milestones

1. Complete: design and independent identity-safety review; review identified
   unverified password email claims and the design now requires verification.
2. Active: Pi implements uniqueness, settings binding and sync lifecycle; runs relevant
   TypeScript/PostgreSQL/Swift tests and documents exact limitations.
3. Parent performs independent security/correctness review and real UI
   acceptance on Primary iPhone, Web and macOS; fix and re-review confirmed bugs.
4. Integrate reviewed code, complete applicable CI/delivery gates and live
   runtime readback. Historical production reconciliation requires exact proof
   and review; no automatic database merge during implementation.

## Completion matrix

| Requirement | Required proof | Current state |
| --- | --- | --- |
| New email globally unique | PostgreSQL concurrent registration tests | pending |
| Password email ownership | real delivery plus challenge/replay tests | Resend configuration found; delivery unverified |
| Apple/Google/password same account/user | backend receipts and settings UI | pending |
| Safe conflict and relay behavior | hostile/replay/ownership tests | pending |
| Historical duplicates handled | classified inventory, preview, dual proof | pending |
| People sync both directions | real iOS/Web/macOS IDs after refresh | pending |
| Session history sync both directions | same session/message IDs and deletion | pending |
| Interrupted/offline recovery | preserved draft and no duplicate write | pending |
| Real Apple sign-in | provider callback and post-login readback | pending |
| Review and delivery | independent P0/P1 closure and exact-head checks | pending |

## Parent verification checkpoint — September 25

- The first migration draft failed on PostgreSQL 18 because `min(uuid)` is not
  supported. Pi repaired it; the actual migrate entry point then succeeded over
  three synthetic legacy users, including a case-insensitive duplicate pair.
- Seven independent database cases passed against that intermediate source:
  preserved legacy collision, each of three first-provider orderings, concurrent
  ownership, direct-insert rejection and atomic rollback. This is not final-head
  acceptance and does not prove OAuth or UI behavior.
- Empty-account classification failed because `harness_source_generations` was
  counted as product data. Independent review also found that credentials were
  misclassified and indirect Lab ownership was omitted. All findings were sent
  to Pi together; safe credential-baseline handling must not expose the missing
  historical-ownership check.
- Read-only production inventory found a deleted Lab workspace owned by the
  Google duplicate, with its target user retained. Zero ordinary product rows
  therefore do not establish that this account has no historical relations.
- Existing Resend configuration uses the sandbox sender domain `resend.dev`.
  Sending-only key scope prevents a domain-list check; no email was sent and
  delivery remains unverified. No user-supplied key is currently needed.
- The installed macOS wrapper loses OAuth continuity when it opens the system
  browser, and cancelling Apple leaves its login controls disabled. The separate
  reviewed [handoff design](../docs/decisions/0019-macos-system-authentication-handoff.md)
  will be a sequential Pi implementation after the shared account work.
- Parent artifacts are under the registered task directory's `parent-db/`;
  the isolated `account-sync-parent-pg` container is task-owned and must be
  stopped after durable evidence is saved. No resident database was migrated.

## Execution boundaries

Use synthetic accounts and records in isolated task-owned test infrastructure.
Never seed, migrate or repoint the resident production/TestFlight database during
Pi implementation. No secrets in contracts/logs/docs. No external messages or
Linear/GitHub writes from Pi. Parent retains delivery ownership.

Native build/test/interaction must use `/Users/cubxxw/.local/bin/dev-ios-session
run -- ...`, Primary iPhone selected by `dev-ios-session select`, and task-owned
DerivedData/results/screenshots. No new simulators, erase, shutdown-all or
cross-task cleanup. No backend Compose stack with permanent restart.

Real Apple credentials, verification and grouping may require owner interaction;
prepare the complete reviewable flow before asking for that specific step. Unit
verifier injection is not live provider evidence. Do not end the task just because
Pi reports ready_for_review. Unresolved historical collision or missing live
platform evidence remains explicitly incomplete.
