# Scoped native source compatibility: build 2 to build 5

Observed: 2026-08-31T17:35:00Z  
Classification: synthetic-only release evidence

## Why this bridge exists

The media under `visual/rc3-staging` is provenanced to `TalentSignalMac 0.1.0-rc3 (2)`, not build 3. This audit compares that exact frozen source to build 5. It supersedes an earlier build 3 comparison that did not match the media provenance and is not retained as release evidence.

## Artifacts compared

- Media-source archive: `system/frozen-rc3/TalentSignalMac-source-0.1.0-rc3-build2.tar.gz`, SHA-256 `982f52784fb06d759dc8f5f78840cc29afdb864f3177032ad466bdfc58ac80d5`.
- Build 5 source archive: `system/frozen-rc7/TalentSignalMac-source-0.1.0-build5.tar.gz`, SHA-256 `43ca4ffa7be6b75cf3993c8254793446f4655c293046b87a510bf91cc08901e6`.

Both archives contain the same 22 Mac Swift paths. Fifteen are byte-identical. Their normalized, path-aware checksum manifest is identical:

```text
build 2  bc45723a37b54e1b1ed8b9b25d4c03bc496623bf2dd11352e1d1bb29800071d0
build 5  bc45723a37b54e1b1ed8b9b25d4c03bc496623bf2dd11352e1d1bb29800071d0
```

## Complete Swift delta

Exactly seven Swift files differ; three are test-only. Unified diffs were reviewed in full.

| Path | Build 2 SHA-256 | Build 5 SHA-256 | Delta and admissibility effect |
| --- | --- | --- | --- |
| `Sources/App/AppModel.swift` | `52d09f00e8f934c1f0b5e7482af7e3c8ccf7ce5b2e4f38db793d9cbc152855b4` | `7f546ef0aa59640043e46e8f238d0a794e76a945cfc227d41f2efc604b1e49d4` | Adds a fail-closed branch that maps `staleAuthority` to the existing stale presentation, clears pending decisions, and labels projections stale. All other failures still use the unchanged failed presentation. Old media cannot prove that new handler; build 5 TTL/readback and build 5 tests must prove the behavior. It may still show the unchanged stale and failed visual states when cited with those current runtime tests. |
| `Sources/Features/RelationshipWorkspaceView.swift` | `2198d9e54e6deac479cab69bf975850508b20cb3c552b7dee7646378ce8f9fff` | `b4f5f58140c161ce03b8017f7fd84888b19b4906fc2fef5457a8ea4fd3c8d5fa` | Replaces only `CanonicalProposalItemView`'s segmented decision Picker with explicit Buttons carrying the complete VoiceOver context and a UI-test focus probe. Old media cannot prove the new control. Build 4 direct keyboard, VoiceOver, and 200% media covers it, and build 4→5 is 22/22 byte-identical. Other workspace composition, state rendering, and Reduced Motion logic are unchanged. |
| `Sources/Services/MacRelationshipServing.swift` | `3180d320c84f8792cc9986d7dc5a05d2678497fee4a9c783375fd32332eb6153` | `34ff5ebce2812be3a608b78714e738aeaf2441d34ad996cb3c11e1bee6a0d50e` | Adds the typed `staleAuthority` error and its safe description. It does not change normal, no-action, ambiguity, lifecycle, local draft, pause, stop, clear, failure, or unknown-outcome service contracts. |
| `Sources/Services/URLMacRelationshipService.swift` | `8d0be4fefa344f5525a653dff59c539d8b1c39bda662601024e4c134235b8272` | `5f83914f18cd400a391c5f656676d832d857e5fcc7e088fd0c696aa734597023` | Reclassifies only the already fail-closed revoked/expired/deleted/purged/changed-evidence decision error as `staleAuthority`; it still clears pending resolution and sends no decision. Current build 5 revoked and TTL readbacks prove the changed route. |
| `Tests/AppModelSafetyTests.swift` | `8c885d1a8c59e1f5eb162678bc76b84b3e1e48da55259fcbcf34abffeb240374` | `2be0c12d91f53787aae19917146cd14cae9eb77bb2bc1e1703597013cc844bbe` | Test-only additions for stale authority and menu-bar privacy. |
| `Tests/LiveBackendRelationshipServiceTests.swift` | `ebe5a4d072552822691410f28b8815fe544c2df5d35c23ddc03cbc3c980b0bf2` | `f5b7b61d2462971810bc037ac857504bc36f77c70365e45735ffac042d0214ee` | Test-only additions for stale-authority mapping and current backend behavior. |
| `UITests/TalentSignalMacUITests.swift` | `5890874ab113afa6faaaa07b3230a99db5dd1ecf933ddf3ea181e40d765cdf31` | `5ee42162cb6ca1c14ba9ce66572976113685615a376b291fec996f2c5567a881` | Test-only update for the new decision Buttons plus a menu-bar privacy test. |

The project-setting delta changes the build number; marketing version remains `0.1.0`. A redundant nested generated Xcode project in the older archive is not an application source input.

## Per-media admissibility for build 5 claims

Build 2 media remains direct evidence of what build 2 rendered. It may support build 5 only for the following narrowly unchanged presentation or interaction claim, and only when the manifest also cites this audit plus current build 5 source/runtime evidence:

| Build 2 media group | Build 5 claim allowed | Changed code excluded or separately proven |
| --- | --- | --- |
| `close-workspace-process-stays.mov` | Closing the workspace leaves the native menu-bar process and explicit controls available | Native app/lifecycle files are byte-identical; no changed file participates |
| `frozen-release-quick-panel-zero-capture-boundary.png`, capture review portions of journey videos | Quick Panel starts empty; source, upload, retention, redaction, removal, and cancellation are visible before submission | Quick Panel, Capsule, domain, capture, and local-store files are byte-identical |
| `identity-unresolved-nonbinding-receipt.mov`, `identity-ambiguous-no-selection.png` | No identity is preselected; unresolved is visible and nonbinding | Identity, Capsule, and fixture paths are byte-identical |
| primary, zero-tag, Action Center, no-action, receipt, failure, outcome-unknown, pause/stop/clear, relaunch, and mixed-script captures | The cited static hierarchy, labels, distinct statuses, safe recovery affordance, or unchanged lifecycle control is visible | The decision control itself is excluded; stale handler behavior is excluded; current runtime/tests prove the underlying build 5 state where required |
| `frozen-release-reduced-motion-state-transitions-clean.mov` | Reduced Motion preserves progress/state/consequence while disabling the workspace's nonessential state animation | The root Reduced Motion expression and all state-layout code are unchanged; the new decision Buttons add no animation or transition; build 4 direct decision evidence covers the changed selector |
| stale-state screenshot | Only the unchanged visual treatment of an already-stale state | The new path that reaches stale is not inferred from the screenshot; RC7 TTL/readback and build 5 tests prove fail-closed transition and zero effects |

The build 2 keyboard, VoiceOver, zoom, or decision-control media is not used to prove build 5's changed decision selector. Build 4 direct evidence and `native-source-diff-build4-to-build5.md` own those claims.

## Non-admissible claims

This audit does not relabel any build 2 image or recording as build 5. It does not prove the changed stale-authority handler, backend behavior, exact pixels of the changed decision selector, or a new UI automation run. It expires if a future release changes production source involved in an admitted claim.

## Reproduction

1. Extract both named archives into separate empty directories.
2. Verify the 22 relative Swift paths and hash all files with SHA-256.
3. Recompute the path-aware manifest hash for the 15 unchanged files.
4. Run unified diffs for all seven changed files; verify the four production deltas match the table above.
5. For every old media citation, reject any claim that depends on the changed decision selector or the new stale-authority handler unless current build 5 evidence is also cited.
