# RC5 frozen verification

Release candidate: Talent Signal macOS `0.1.0` build `4`.

- Zip SHA-256: `2d125b26f0185a5094375678d2345ea410538202db9fbed938804a9d7f2f34b9`
- Universal binary SHA-256: `7744ed9290495dd1d4a871de605ac76a4bb317fdd6fae06413d8c07362dfee98`
- Source snapshot SHA-256: `a00c08c1c2bb4818ace44b454dbc193bde52771230b986bca0c96cdab3e85367`
- Architectures: arm64 and x86_64.
- Native check: passed; all macOS unit tests passed and UI tests compiled.
- Native live loopback suite: 4 passed, 0 failed, 0 skipped.
- Private notification canary: 1 focused test passed; the release target has no system-notification API symbols or linked notification framework.
- VoiceOver: direct frozen-binary screenshot, focused eight-second decision recording, 40.018-second complete journey, and complete AX labels captured with synthetic data.
- Keyboard and zoom: a 31.983-second pointer-free primary journey reaches the canonical receipt, and a direct build-4 200-percent capture covers the changed decision controls.
- Menu bar: a direct full-display frozen-binary capture proves native persistent presence in `needs-decision`; the source audit verifies same-model commands, generic privacy copy, and the disabled notification sink.
- TTL/deletion/relaunch: direct before- and after-relaunch readbacks prove expiry-driven purge and stale projections; a separate manual-deletion pair inventories 40 registered derivatives after relaunch.

Strict-gap evidence:

1. Every actionable decision button owns an ordered identity, relationship, claim, uncertainty, evidence, consequence, and choice label. No option is preselected, and resolve remains disabled until a human choice.
2. The frozen binary's real VoiceOver Caption Panel and keyboard focus are visible in `rc5-build4-frozen-voiceover-confirm.png` and `rc5-build4-frozen-voiceover-decision.mov`; `rc5-build4-frozen-voiceover-complete-journey.mov` continues from exact scope review through Capsule, attribution, Task submission, decision, and canonical receipt with VoiceOver active.
3. `rc5-build4-frozen-keyboard-full-journey.mov` completes the same primary route without a pointer, and `rc5-build4-frozen-zoom-200-decision-controls.png` directly covers the changed decision row at the product's 200-percent text preview.
4. Expired source authority projects the canonical Task as `needs_rebase`, the Artifact as `stale`, purges source access with `retention_deadline_elapsed`, exposes no source fragments or claims, and preserves zero external effects after backend relaunch.
5. Manual deletion redacts the artifact, cancels the decision bundle, removes run input/context references, returns `404` for the source, and preserves a 40-entry derivative lineage across backend relaunch.
6. The shared Web pursuit page and native loopback suite read canonical Tasks, revisions, decision bundles, receipts, and response-loss recovery from one backend contract.
7. `PRIVATE_NOTIFICATION_SENTINEL`, candidate identity, evidence text, and compensation terms are absent from generic menu-bar privacy copy; the current build has no notification delivery sink.
8. Capture deletion and revocation leave auditable stale/revoked projections while preventing supported readback of deleted source content.

The frozen binary does not prove notarization, App Store signing, real-candidate retention operations, production connector behavior, or real-recruiter usability. XCTest UI Automation is not authorized on this host; UI tests are compiled, while the VoiceOver proof uses the actual frozen Release app and macOS accessibility runtime.
