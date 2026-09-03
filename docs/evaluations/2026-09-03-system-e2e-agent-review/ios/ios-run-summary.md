# iOS real Simulator E2E and mobile UX evidence

- Artifact: `TS-SYSTEM-E2E-2026-09-03-01`
- Frozen commit: `5ba505ae45e3df51b3339427da79c96fde42c137`
- Data: repository-owned synthetic fixtures and disposable local app state only
- External effects: none; device contact/calendar/message/ATS/CRM writes were not authorized
- Evidence level: 1 for the executed Simulator paths (real compiled app, direct XCTest interaction, native screenshots, and accessibility audits)

## Environment

- Xcode `26.6` (`17F113`)
- iOS Simulator `26.5` (`23F77`)
- Large device: iPhone 17 Pro, device ID `02B4F0C1-A92F-469D-9DCC-5ED13F119507`
- Small device: iPhone SE (3rd generation), device ID `526F80F9-01D6-4F46-8969-FC89EE198C89`
- Locales: English and Simplified Chinese
- Accessibility combination: AX5 / accessibility XXXL, dark appearance, and Reduce Motion

## Baseline-to-post-change regression

The first review found two medium mobile issues in direct Simulator screenshots:

- the iPhone SE Chinese AX5 Ask response could not be shown through its final line in the captured reading position above the fixed composer; and
- the default Today calendar reminder plus the People role/Pursuit context used unexplained ellipses for distinguishing context.

The regression assertions were added before the implementation. `prechange-regression-assertion.xcresult` records the expected **0 passed, 1 failed** Today baseline because the reminder did not expose its full Pursuit in the accessible label. The implementation then made three narrow layout changes:

- capped only the Ask modal navigation chrome at `xxxLarge`, kept the response text at the requested AX5 size, and added end-of-conversation reading clearance;
- gave People role/Pursuit copy two lines at normal sizes and unlimited height in accessibility layouts; and
- moved the Today reminder to a compact vertical composition, allowed two lines at normal sizes and unlimited lines at accessibility sizes, and included its full relationship context in the accessible label.

Final direct Simulator results after the change:

- `postchange-today-default.xcresult`: **1 passed, 0 failed, 0 skipped** on iPhone 17 Pro;
- `postchange-iphone17-people.xcresult`: **2 passed, 0 failed, 0 skipped** on iPhone 17 Pro; and
- `postchange-se-ax5-final.xcresult`: **3 passed, 0 failed, 0 skipped** on iPhone SE in Simplified Chinese, AX5, dark appearance, and Reduce Motion.

The new Ask assertion first verifies that `Agent · 预览` is reachable, then scrolls the real conversation surface and verifies the full final response text is hittable and its bottom edge is at least 8 points above the fixed composer. The final People assertion verifies the full `Candidate · Independent board director search` label and an expanded card height. Today verifies the complete Chief Product Officer Pursuit in both English and Chinese accessibility labels and a multi-line row height.

Post-change screenshots were inspected directly:

- `screenshots/postchange-iphone17/today/D0B49631-1963-4360-841D-E57C0462AE09.png` shows `Leila Hartmann · Interview` and `Chief Product Officer search · Singapore time` without ellipses;
- `screenshots/postchange-iphone17/people/9C301591-273C-4206-8901-A4993985C843.png` shows Nia Williams's complete `Candidate · Independent board director search` across two lines;
- `screenshots/postchange-se-ax5/final/1A9BE6AF-C4DE-475B-B7D8-03784AD44730.png` shows the same complete People context in the Chinese dark/AX5 configuration; and
- `screenshots/postchange-se-ax5/final/062462B8-A787-4AAF-9717-5F4BC61A9C01.png` shows the complete Chinese Agent response, including its final punctuation, above the composer after a real swipe.

One intermediate `postchange-se-ax5.xcresult` is retained for transparency: Ask and Today passed, while People failed only because the first test draft required an arbitrary card height greater than 100 points. The rendered complete two-line card measured 91.5 points. The assertion was calibrated to a non-truncated minimum of 88 points, and the clean three-test final bundle passed.

## Direct results

### iPhone 17 Pro synthetic journey

`iphone17-synthetic.xcresult`: **11 passed, 0 failed, 0 skipped**.

The direct app journeys covered:

- Today default attention and inline evidence/edit/add/dismiss/undo receipts;
- Today -> Agent -> Sources & imports, including persistence after relaunch;
- Today -> Sessions -> People retrieval continuity;
- the `TS-CORE-01` screenshot fixture from exact evidence through four fact decisions, a separate action preview, and a truthful local handoff receipt;
- unrelated-image zero-fact behavior;
- import cancellation and recovery;
- failed import with truthful no-change recovery;
- background/foreground preservation of an in-progress fact decision;
- arbitrary Text Signal through a manual/no-model review;
- queued screenshot shortcut recovery after creating the local Pursuit.

Exact test names and durations are in `results/iphone17-synthetic-tests.json`; the native summary is `results/iphone17-synthetic-summary.json`.

### iPhone SE Chinese AX5 dark reduced-motion journey

`iphone-se-ax5.xcresult`: **8 passed, 0 failed, 0 skipped**.

The direct app journeys covered:

- Agent and Sources & imports reachability in Simplified Chinese at AX5;
- Today inline decisions in Simplified Chinese, dark appearance, and AX5;
- Sessions and People in Simplified Chinese, dark appearance, AX5, and Reduce Motion;
- one-column Ask input and response at AX5;
- Audio Signal authorization, stop, protected local receipt, and deletion reachability at AX5;
- exact evidence before fact controls plus automated Dynamic Type, contrast, hit-region, and element-description audit on the critical fixture review;
- a long mixed Chinese/English Text Signal with keyboard exit, manual Proposal review, and recovered Today state.

Exact test names and durations are in `results/iphone-se-ax5-tests.json`; the native summary is `results/iphone-se-ax5-summary.json`.

### Deterministic state coverage

`ios-unit.xcresult`: **266 passed, 0 failed, 0 skipped**.

The passing unit set includes `no_action`, ambiguous date, stale preview invalidation, unavailable evidence, verified receipt/readback, response-loss lock and relaunch reconciliation, exact retry/idempotency, account-scoped draft restore, superseded evidence, deletion tombstones, screenshot queue deduplication, audio interruption, and failed-write recovery. Exact cases are in `results/ios-unit-tests.json`.

`pnpm ios:localization:check` passed for 1,025 catalog keys. Its output also reports remaining migration debt: 164 transitional inline bilingual calls and 209 raw SwiftUI literals; therefore the check is a boundary gate, not proof that every screen is fully localized.

`pnpm docs:check` passed after the evidence and review packet were written: documentation, Wiki, and all three architecture-diagram checks were green.

## Direct screenshot evidence

- `screenshots/iphone17-synthetic/manifest.json`: 11 screenshots with originating test identifiers and human-readable suggested names.
- `screenshots/iphone-se-ax5/manifest.json`: 13 screenshots with originating test identifiers and human-readable suggested names.
- `B8653C42-BDCB-4A9B-9F5F-C3204315FF50.png`: iPhone 17 Pro Today.
- `CE0ABABF-0D36-401F-9E82-294A170DF63A.png` and `868344A7-3C12-4D2D-9079-254F61553AF3.png`: Agent and Sources.
- `64F9D385-BF6E-4CD4-912F-474A95FA3BA4.png`, `5454918C-6C9D-4F8A-9A82-4332DEF79CBF.png`, and `F8C34161-3D34-456D-861B-010D0197EA64.png`: evidence, separate action preview, and no-external-change outcome.
- `9B6B56EA-C4AC-4EFC-8EEF-D8E3A23EDA3C.png` and `9571837A-19DB-490C-B8E7-59FDD37DE07D.png`: Sessions and People.
- `3CB8B92A-4939-4FC3-90A5-E2674626ADD7.png` and `96115A18-960D-4668-AA45-4C4D5F401B6C.png`: SE AX5 Ask before and after response.
- `B972498C-D44E-472C-B485-168AB7C3ABAD.png`, `CAF095D9-CA99-4F1E-A295-D136784688FE.png`, and `86BA6AD8-4453-4138-9DE9-038E13008DB3.png`: SE Chinese retrieval and Today decisions.
- `51331E7D-EB64-4883-AD6A-D388CE51D21F.png`, `777DA4DA-5AF9-48C8-AB7F-73E8A5DC7D3E.png`, and `6EF7520E-649A-4AEA-B474-FE0D7D5A24A8.png`: long mixed Text Signal, manual Proposal, and Today recovery.

## Mobile UX observations

1. The evidence -> fact decision -> separate action -> outcome sequence is materially trustworthy. The exact source appears before interpretation, every fact starts proposed, the action states target/owner/due/effect, and the result explicitly says no external changes.
2. Agent is a calm control plane rather than a chat dashboard. Memory scope and action approval are visible in the first viewport, and Sources distinguishes a profile reference from authorization or background sync.
3. The baseline default iPhone 17 Pro screenshots truncated Today and Nia Williams's Pursuit context. The post-change screenshots show the full Today title/context and the full Nia role/Pursuit at both default and the SE accessibility configuration, while retaining a compact retrieval surface.
4. The baseline SE AX5 Ask screenshot ended before the response's final line. The post-change test performs the missing real swipe and proves both endpoints of the reading path: provenance is initially reachable, and the complete final line can be positioned above the fixed composer. The post-change screenshot shows the response end and punctuation unobscured.
5. Automated accessibility inspection found no unsuppressed issue on the tested fixture path, but no human VoiceOver spoken-order traversal was recorded. This run therefore does not claim VoiceOver release proof.

## Coverage status against the mobile test matrix

| Area | Status | Evidence |
| --- | --- | --- |
| Large iPhone portrait | pass | baseline 11 UI journeys plus 3/3 post-change Today/People regressions |
| Small iPhone portrait | pass | baseline 8 UI journeys plus 3/3 clean post-change Ask/Today/People regressions |
| Simplified Chinese + English | pass for executed paths | native screenshots and UI assertions |
| AX5, dark, Reduce Motion | pass for executed paths | combined SE journeys |
| Evidence before decision | pass | TS-CORE-01 and accessibility-order test |
| Fact decision separate from action | pass | TS-CORE-01 action preview |
| Truthful local receipt | pass | TS-CORE-01 and Today decision receipts |
| Cancel/failure/background recovery | pass for synthetic paths | direct UI journeys |
| `no_action`, ambiguity, stale, retry, duplicate protection | pass at deterministic model/store level | 266-test unit result |
| Canonical backend readback | pending coordinated backend run | not claimed by the synthetic UI results |

## Not run / not claimed

- physical iPhone ergonomics, performance, haptics, camera/Photos behavior, or field conditions;
- VoiceOver spoken labels/order/values/hints, Switch Control, or Full Keyboard Access;
- landscape, iPad, oldest deployment target, RTL, 200% pseudo-localization, increased contrast, reduce transparency, and Low Power Mode;
- Photos first ask, limited selection, denial, later revocation, or a real third-party screenshot share sheet;
- Contacts, Calendar, and notifications denial/revocation while open;
- any real Contacts, Calendar, message, ATS, CRM, or notification write;
- a remote model/provider, production backend, TestFlight build, APNs, or real-device Live Activity;
- measured render, network, or interaction latency budgets;
- direct UI for every unit-covered state such as expiry, supersession, duplicate destination write, and success-after-client-timeout.

## Logs and caveats

- `logs/iphone17-synthetic.log`, `logs/iphone-se-ax5.log`, `logs/ios-unit.log`, and `logs/localization-check.log` are the completed run logs.
- `logs/postchange-verification.log` records the test-first failure, clean post-change result bundles, direct screenshot checks, and localization result.
- `logs/iphone17-main.log` records an intentionally interrupted `ios:check` start (`exit 130`) after cross-Agent coordination requested that no new Docker/backend be started. It reached localization and Release compilation only; it is not counted as a completed check and started no backend compose project.
- Xcode emitted `IDELaunchParametersSnapshot` / missing LLDB version warnings during UI test launches. The native result bundles completed successfully with zero failures; the warnings are retained rather than silently removed.
