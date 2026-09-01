# RC7 build 5 verification

Observed through: 2026-08-31T17:24:00Z  
Classification: synthetic-only engineering release evidence  
Environment: Mac mini, arm64 host, macOS 26.4 (25E246), Xcode 26.6

## Frozen release identity

| Item | Identity |
| --- | --- |
| App | `TalentSignalMac 0.1.0 (5)` |
| Release archive | `TalentSignalMac-0.1.0-build5.zip` |
| Release SHA-256 | `0101fd702e594d03517d9ac1b9dd9c11ab5799a1676049ced6634a5d7d42002b` |
| Mach-O SHA-256 | `1be69aaca5c1d1d8e29fca42c1c046a80445292a8f77d4b481e058e8adc7519e` |
| Architectures | `x86_64 arm64` |
| Source archive | `TalentSignalMac-source-0.1.0-build5.tar.gz` |
| Source SHA-256 | `43ca4ffa7be6b75cf3993c8254793446f4655c293046b87a510bf91cc08901e6` |
| Repository revision at freeze | `d3389da3f048d7f52532540dc52a8b0dc52a95dc` plus the explicitly archived dirty-worktree source |

The source archive, rather than the repository revision alone, is the authority for this uncommitted local candidate. It contains the native target, backend modules, migrations, backend evaluation code, contracts, Mac scripts, validator, PRD, implementation plan, package manifest, and lockfile. The redundant nested generated Xcode project is excluded.

## Verification results

| Check | Result |
| --- | --- |
| Contracts build and backend typecheck | Passed |
| Agent unit tests | Passed: 49 |
| Backend unit tests | Passed: 215 |
| Full `pnpm backend:check` | Passed, including fresh database migrations, runtime evaluations, 15 failure-boundary checks, PRD04/PRD07 checks, and 30/30 Agent control-plane deterministic trials |
| `pnpm macos:check` | Passed for build 5: native unit and integration tests passed; UI test target compiled |
| Build 5 live native E2E | Passed: 4, failed: 0, skipped: 0 |
| Focused notification privacy test | Passed: 1, failed: 0, skipped: 0 |
| macOS validator contract tests | Passed: 4 |
| `pnpm docs:check` | Passed: 11 canonical documents, 330 Markdown files, wiki check, and all three architecture diagrams |
| JavaScript syntax for release-boundary probe | Passed |
| Changed-source whitespace check | Passed |

The macOS UI test host could not establish runtime automation authorization on this machine. No UI test execution is claimed. Real build 4 Release interaction evidence remains the direct keyboard, VoiceOver, zoom, and menu-bar proof for build 5 only because `native-source-diff-build4-to-build5.md` establishes path-aware byte identity for all 22 Mac Swift source and test files. The `visual/rc3-staging` media is build 2; it is admissible only for the unchanged claims enumerated by `native-source-compatibility-build2-to-build5.md`. Fifteen of 22 Swift files are byte-identical. The four production deltas are confined to the decision selector and a fail-closed stale-authority route; build 4 direct decision evidence plus current build 5 TTL, revoked-authority, and live tests separately prove the changed behavior. No older recording is relabeled as build 5. The build 5 live integration tests execute natively against the shared backend and are separate from both visual-evidence bridges.

## TTL expiry and derivative-accounting proof

The final exact-source proof is `ttl-expiry-before-relaunch.json`, SHA-256 `e075654eb45ff49984221175d696337f46cd76662bec7e46abed735e7a4b0c55`.

Before expiry, the synthetic Task was `waiting_for_domain_decision`, revision 2, with one authorized evidence fragment and zero external effects. After `retention_deadline_elapsed`:

- source access is `purged` and source authorization is `expired`;
- source locator is null and fragment and claim arrays are empty;
- Task is `needs_rebase`, revision 3;
- the Artifact is `stale` and contains only the safe expiry explanation;
- the decision bundle is `cancelled`;
- Run context evidence and input artifacts are empty;
- no external effect exists;
- the receipt contains 43 unique entity dispositions across 25 entity types;
- the ledger distinguishes 29 `content_purged`, 6 `access_revoked`, 5 `audit_reference_retained`, and 3 `confirmed_state_retained` entries;
- all 23 release-probe-required derivative classes are present; and
- a unique private sentinel scan across all 93 public base tables reports zero matching rows and no matching table.

After restarting the backend API process, `ttl-expiry-after-relaunch.json`, SHA-256 `cc79756fc09936a77347c69c00da627fdb89b9ed0b166347bf128056985f8e23`, reads back the same safe Task, Run, Resource, and retention states. The normalized derivative ledger SHA-256 is `2ac8abf14b9a660c6dc20970ed92a11780d12c991c0b4e3ce902a67749416a5e` before and after restart.

The proof's global contract version remains `2026-08-24.10`. `derivative_lineage` is an additive response field for existing clients; changing the exact global version literal would unnecessarily invalidate unrelated iOS and evaluation clients. The contract schema now requires the field in the current build and its focused source-retention tests cover persistence and readback.

## Live shared-backend proof

The final build 5 live test bundle is `system/live-e2e-20260831T170857Z-60163`:

- `native-live-e2e-summary.json`: `02797659005e2f589bda2eba19c1a8e80dab478d0d05ad16f207d05c1939362f`;
- `canonical-task-readback.json`: `35d65d4b14645275b93135b6bf012973f48af5911bd45771acbe8e6a73567ceb`;
- `revoked-evidence-readback.json`: `fda922878cbca6920913c2c6ffcf811b04b1072fb3796ce34fcf1cbfa22d7289`.

These tests prove the native client creates and reads the canonical Task path, executes the review-only internal Proposal path, rejects revoked authority, and reconciles response loss without an unconfirmed external effect.

## Notification boundary

`notification-privacy-summary.json`, SHA-256 `9ce3055cbcaf52ae7195a1f09ccf27735cb698558c31e3b8fb7f185691754a54`, binds the focused test to the frozen build 5 archive and binary. The app source has no `UserNotifications`, `UNUserNotification`, or `NSUserNotification` use; the universal binary links no UserNotifications framework and exposes no matching undefined notification symbol. The test injects synthetic private content and proves the generic menu-bar projection excludes it.

## Scope limits

This is an unsigned, unnotarized local engineering candidate using synthetic data and a loopback backend. It does not prove App Store packaging, hardened-runtime and signing behavior, real-candidate retention operations, production observability, design-partner frequency, or product-market fit. It includes no ambient capture, Accessibility automation, message send, Calendar write, Contacts write, ATS write, or CRM write.
