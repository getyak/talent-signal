# Round-two final integration

## Decision

**Fail / release gate blocked.**

The four accepted commits integrate cleanly on baseline
`3ecb6ec3270a8070c5ddc1a437bd386bbed8954d`, and the frozen TS-CORE-01
compiler, test, backend, iOS, extension, and installed-plugin checks are
otherwise strong. Two evidence-safety vetoes remain active:

1. `XS-CAPTURE-01`: no policy-authorized user Google Chrome evidence shows the
   exact package visibly loaded, a toolbar or selected-text gesture, a positive
   temporary `activeTab` grant, pre-Submit network silence, and one matching
   localhost receipt.
2. `XS-RETENTION-01`: the real localhost handoff accepted
   `retention_mode=ephemeral`, but the same-account capture read back with
   `retention_until=null` and remained accessible until a separate deletion
   call.

The panel applies vetoes before scores. Web and browser-extension craft
dimensions remain direct 95–99 evidence, with every original gap preserved in
[`craft-score-preservation.json`](craft-score-preservation.json); they are not
averaged into the blocked integrated verdict.

## Frozen integration

| Order | Accepted commit | Local integration commit | Patch ID | Result |
|---|---|---|---|---|
| 1 | Web `665aabcbbaf0224714c938e2f664f85f04c24b2f` | `6f9912adb9e95501b69acce587f3f6146ffa775d` | `465849f2b744dafc0d67f2c1dc791f8eb3328b07` | Clean |
| 2 | Web evidence `33f9ab8799dfa78c58efe6013a91b69ebb8053a0` | `a1a73bcd3ad290a20a26f683ead2f26fd186e08e` | `0102dffb72eb558ba799e3ee86f91a4095ca9028` | Clean |
| 3 | Extension `e8c6af2aaab873abcd72ce429552662bd521a78c` | `d056d9dae221d9ef5c8b109d17b80b7af23422d7` | `8705cf518cbe323c93b70fc2f5e280aef8534b85` | Clean |
| 4 | Extension evidence `95ced7952367e6fdf968c4ecc1b0d73a920a6747` | `a803cf61fa810b0d043dbbc14ee3725a6dade410` | `0aa68dd3bf1ab6035a7a3bce3694134a7675ea3e` | Clean |

All source/local patch IDs match. The baseline-to-artifact diff contains only
Web, browser-extension, its integrated package test, their round-two evidence,
and this final directory. `docs/evaluations/overnight/final/**` is unchanged.

Frozen digests:

- fixture:
  `b776e991861512b0de41a2c130a5f446e0f9f4aa418b26dd948d1f9468274b94`
- TS-CORE-01 source:
  `640bb02fc4eb107cdbaf7661056f3ac99ff0c7c42298fe2378eb0abe36f4afa8`
- extension package:
  `4491ed23a7d236cb055987432a19309534594170b019f89dfb3f5e3aa2d8c416`
- backend API container:
  `sha256:ceb689d83248f1db2dcba2deae085c1042780a33d854dc96fbf0a39d82de4310`
- installed plugin analyzer:
  `01677116851f28ba7e1e592551cad2b658d8ccc53aa1034665bcef31c35c6ca1`

## Gate results

Passed:

- `pnpm eval:core`: 8 frozen cases, 6 review objects, 9 cross-surface
  assertions, 12 craft dimensions, 2 schemas, and 4 examples.
- Web lint, 7 files / 28 tests, direct `tsc6 --noEmit`, and the Next.js
  production build.
- Backend contracts/build/typecheck and 3 files / 6 tests.
- Unique Docker project `talent-signal-round2-final-f3fe`: healthy Postgres and
  API; 8/8 fixtures, 13/13 failure boundaries, 7/7 recovery checks, duplicate
  idempotency, cross-account isolation, revocation, reconciliation, retention
  observation, deletion, and zero external writes.
- iPhone 17 / iOS 26.1 with separate DerivedData: 13/13 unit tests, 12/12 UI
  tests, two real localhost fixture fetches, and a Release simulator build.
- Browser extension: 31/31 source tests, package validation, package build, and
  31/31 integrated built-package tests.
- Plugin: manifest, Skill, 11 local-boundary checks, installed/enabled host
  state, repository/cache byte equality, 8/8 frozen fixtures, and 3/3
  supplemental probes.
- Five specialist review contracts and the veto-first panel contract.
- `pnpm docs:check`: 11 canonical documents, 129 Markdown files, one published
  wiki page, and both architecture diagrams.

Failed prescribed command:

- `pnpm typecheck` exits 1 because `apps/web/package.json` invokes `tsc`, while
  this lockfile exposes the installed compiler as `tsc6`. The direct equivalent
  `pnpm --filter @talent-signal/web exec tsc6 --noEmit` passes. No unrelated
  implementation change was made to repair the wrapper.

The complete command ledger is
[`command-results.json`](command-results.json).

## Real localhost continuity

The authenticated browser session used account
`10000000-0000-4000-8000-000000000001`. Request
`round2-final-f3fe-001` returned capture/receipt
`0c500a45-16c8-4d81-8798-15ede78e1b14`; the duplicate reused the same
capture, receipt, and proposal, and receipt readback returned 200 for the same
account and source locator
`browser-extension-request:round2-final-f3fe-001`.

That same readback exposed `retention_until=null` despite the accepted
`ephemeral` request. Explicit deletion
`247d5830-37af-4c9b-b052-7b1242a2fd7c` removed seven derivatives, revoked
capture access, recorded eight lineage entries, and made the receipt return
404. The canonical backend evaluator separately verified one local simulated
effect and duplicate under attempt
`77e9b503-7ac5-431f-89f8-3c1d1de13c8e`; it is not misrepresented as the
browser handoff receipt.

See [`localhost-lifecycle.json`](localhost-lifecycle.json) for the complete
surface locators and identifiers.

## Panel

| Reviewer | Verdict | Score | Confidence |
|---|---:|---:|---|
| Selection science | Pass | 4/4 | Direct |
| Candidate experience | Pass with changes | 3/4 | Direct |
| Mobile UX | Pass with changes | 3/4 | Direct |
| Recruiter workflow | Pass with changes | 3/4 | Direct |
| Evidence safety | Fail | 1/4 | Direct |

The scores describe different rubrics and are not averaged. The final panel is
[`panel.json`](panel.json).

## Three highest-leverage next questions

1. Can the exact extension digest pass one visible user Google Chrome
   `chrome://extensions` → toolbar/selected-text → positive `activeTab` →
   exact preview → no pre-Submit POST → one receipt trace?
2. What executable backend lifecycle maps each accepted retention mode, and
   what event starts automatic disposal for `ephemeral`?
3. Can one uncoached recruiter and one VoiceOver traversal complete and explain
   the same receipt → confirmation → approval → effect → readback → deletion
   sequence?

No real candidate data, candidate contact, calendar, message, ATS, CRM, push,
pull request, or deployment was used.
