# V1 experience correction — V11 frozen delta

## Review object

- Artifact ID: `TS-V1-EXPERIENCE-2026-08-25-11`
- Type: narrow iOS evidence-review terminality and draft-continuity correction
- Source base: commit `5fa53ecf272eef6722b46698a14c3bc8c22f0b4a`
- Frozen delta: the four source hashes in
  [`runtime-evidence.json`](runtime-evidence.json), frozen at
  2026-08-25 05:36 CST
- Correction input: the frozen V10 delta and independent failed panel in
  [`../2026-08-25-v1-experience-correction-v10/panel.json`](../2026-08-25-v1-experience-correction-v10/panel.json)
- UI baseline: the hash-matched V9 Simulator artifact in
  [`../2026-08-25-v1-experience-correction-v9/artifact.md`](../2026-08-25-v1-experience-correction-v9/artifact.md)

## Outcome and boundary

This delta resolves the V10 veto and two related terminal-state findings without
adding product surface or execution authority:

1. **Draft continuity.** “Ask with current evidence” seeds a suggestion only
   when the composer is empty or whitespace-only. A nonempty unsent draft is
   preserved byte-for-byte and focused; nothing is sent automatically.
2. **Fail-closed terminal persistence.** When an observed stale-authority state
   cannot be saved locally, the account-session store retains a transient
   terminal tombstone. The obsolete review key stays blocked for that process,
   the UI cannot offer reconciliation, and the notice does not claim relaunch
   durability.
3. **Terminal model invariant.** A persisted or current-session superseded
   operation cannot transition back to pending, be claimed, or be mutated by a
   normal review update.

The change does not make an old Agent answer current, execute a contact or
calendar write, or replace canonical backend authority. Relaunch after a failed
terminal save intentionally falls back to the backend-authoritative protected
pending operation; the transient notice is explicitly session-bounded.

## Verification

- 100/100 iOS unit tests pass, including exact draft preservation, successful
  superseded persistence, injected terminal-save failure, reverse-transition
  rejection, and claim rejection.
- The unsigned generic iOS Release build succeeds.
- `pnpm check` succeeds, including documentation and architecture checks,
  133/133 backend tests, 185 passing Web tests with one skipped, 24/24 Agent
  tests, and the production Web build.
- `git diff --check` succeeds.

The hash-matched V9 artifact remains the visual/full-stack baseline. V11 makes
no new direct UI-transition claim and does not use the concurrently edited UI
test or capture orchestration as evidence.

## Proof limit

V11 closes the V10 veto and high findings in source, deterministic unit, and
Release-build evidence. It does not prove the rendered delayed close/reopen,
kill/relaunch, terminal-save-failure, or real stale-authority transitions.
Complete AX5 critical paths, physical VoiceOver/Switch Control, production
Apple authorization, physical microphone behavior, production deployment, and
recruiter/candidate field outcomes remain missing. This is not a 99/100
experience or production-release claim.
