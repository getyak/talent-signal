# Talent Signal localhost integration result

Status: **BLOCKED**. The backend, real authenticated Web flow, iOS localhost
readback, and repository-local installed-copy analyzer form one coherent
synthetic TS-CORE-01 state after receipt. The integrated release gate cannot
pass because the authorized Chrome controller could not open
`chrome://extensions`, load the frozen MV3 build, or directly prove the
temporary capture grant and pre-Submit silence boundary.

## Frozen result

- Reviewed input baseline:
  `f66581cbf8a1b1154156fc25231a6ff82f11c61f`
- Preserved current-main base:
  `ef0f7b5e0fdb32f8ee3164b6893f3061bf083bc4`
- Base delta: exactly one commit, `Polish repository front door`
- Integrated evidence commit:
  `1c9c3f0f2866b2d4c3651d422f5d886dd796c996`
- Fixture suite: `talent-signal-candidate-momentum-v1`,
  version `2026-08-05.1`
- Fixture SHA-256:
  `b776e991861512b0de41a2c130a5f446e0f9f4aa418b26dd948d1f9468274b94`
- TS-CORE-01 source SHA-256:
  `640bb02fc4eb107cdbaf7661056f3ac99ff0c7c42298fe2378eb0abe36f4afa8`

The exact accepted cherry-pick mapping is in `integration-freeze.json`.

## Directly proven

- Compose PostgreSQL and backend reached ready health after migration and seed;
  the final run left no integration containers or volumes.
- Web signed into the local Alpha account in real Chrome, loaded the same
  backend receipt, edited and confirmed four source-bound facts, separately
  approved one local-only effect, and displayed verified only after matching
  destination readback. Offline and recovery preserved the same confirmed v13
  state.
- Backend, Web, and iOS matched account, episode, assignment, confirmed-state
  ID, version, four values, status, and evidence message ID.
- Two effect attempts reused one idempotency key and reconciled to exactly one
  local destination object.
- Offline, timeout-after-effect, revocation, deletion propagation, and
  cross-account denial passed without false success or a duplicate effect.
- iOS passed 13 unit tests, 12 UI tests, an AX5 dark correction rerun, and a
  Release simulator build against localhost.
- The disposable repository-local plugin copy passed 8/8 frozen fixtures and
  3/3 supplemental boundary probes with no external tools or effects.
- Tests, lint, type checks, production builds, package validation, schema
  validation, and documentation checks passed.

## Independent review results

Specialist scores retain their 0–4 meaning and are not averaged:

- recruiter workflow: 3, `pass_with_changes`
- evidence safety: 2, `fail`, active veto
- mobile UX: 3, `pass_with_changes`
- candidate experience: 3, `pass_with_changes`
- selection science: 4, `pass`

Craft dimensions retain their separate 0–100 meaning. No Web or extension
dimension reached the required 98. Each sub-threshold result has an exact gap
in its packet. The independent integrated-journey score is 0 because the rubric
assigns zero when a safety veto is active; this is not an average of craft or
specialist scores.

## Active veto

`XS-CAPTURE-01`: no direct proof exists that the exact frozen unpacked Chrome
extension reads only the user-invoked active tab or selected text, sends
nothing before explicit Submit, and creates one extension-originated
account-scoped receipt. Package tests, reviewed-slice screenshots, and the
localhost transport harness do not substitute for that proof.

## Highest-leverage remaining issues

1. Run the exact frozen MV3 build in a policy-authorized user-visible Chrome
   profile and capture the full permission, preview, pre-Submit network, Submit,
   and receipt trace.
2. Capture the authenticated Web journey at 390 px, 200% zoom, reduced motion,
   and with a screen reader; also capture loaded-popup keyboard access and iOS
   VoiceOver order.
3. Make the frozen repository-local plugin installable in an actual Codex host
   and prove TS-CORE-01 semantic parity there.

The completed manifest is `run-manifest.json`; the honest verifier output is
`verifier.log`; the panel decision is `panel.json`.
