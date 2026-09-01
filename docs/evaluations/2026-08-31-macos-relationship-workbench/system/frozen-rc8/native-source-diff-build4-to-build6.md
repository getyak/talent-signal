# Native source delta: build 4 to build 6

This audit scopes which older native interaction evidence remains admissible for
the frozen build 6 archive. It does not relabel an older image or recording as
build 6 evidence.

## Frozen inputs

- Build 4 source: `system/frozen-rc5/TalentSignalMac-source-0.1.0-build4.tar.gz`.
- Build 6 source: `system/frozen-rc8/TalentSignalMac-source-0.1.0-build6.tar.gz`, SHA-256 `97c70441bde0d9bf332c1fec2e78a9956fb752bf44ce3989ba4b1b44177aab98`.
- Both archives contain 22 Swift production/test files. Fifteen are byte-identical.

## Changed Swift files

| File | Build 4 SHA-256 | Build 6 SHA-256 | Scoped effect |
| --- | --- | --- | --- |
| `Sources/Domain/WorkspaceState.swift` | `7e830fc4871a6edf86f96eb0e292fc8588f278c7cdccdf18a108765b1da56091` | `b816af72948cb8bd028170a5a2d38dd3cb4548ee48b19622b8a0b6793cc9de43` | Adds a distinct clarification mode and label; existing state values remain. |
| `Sources/Features/RelationshipWorkspaceView.swift` | `b4f5f58140c161ce03b8017f7fd84888b19b4906fc2fef5457a8ea4fd3c8d5fa` | `dba8091c6682bf4666f7a36eb95361b98c49a0b17c5fcda2c7399ca40a8313a7` | Adds the exact-time clarification view. Build 6 direct screenshot and AX evidence own this new view; older media cannot. |
| `Sources/Services/FixtureRelationshipService.swift` | `abb8ff2ddb3844cde54e711173cfd3b716816ed10833f2fdeb97addfb83e3d20` | `19920616f7422d4c363d3c8f3be873bc2d21c4b843f622ea7affba83229a06e3` | Adds deterministic synthetic clarification copy only. |
| `Sources/Services/MacRelationshipServing.swift` | `34ff5ebce2812be3a608b78714e738aeaf2441d34ad996cb3c11e1bee6a0d50e` | `6129c80aac13dfeb83e68679abd5e5e5ac0e6f284a34f999a55b46c8ca44e90c` | Adds typed canonical clarification and requires same-task clarification proof for that terminal state. |
| `Sources/Services/URLMacRelationshipService.swift` | `5f83914f18cd400a391c5f656676d832d857e5fcc7e088fd0c696aa734597023` | `7b17cddd6eb8e42469852debf7604082aba6d8b1da2e8a6742dd52c796b082b5` | Decodes artifact and clarification, renders `waiting_for_clarification` distinctly, and projects an existing owned action without creating a duplicate. Current live and cross-surface evidence own these changes. |
| `Tests/LiveBackendRelationshipServiceTests.swift` | `f5b7b61d2462971810bc037ac857504bc36f77c70365e45735ffac042d0214ee` | `abaff4f74645d4914efb21e80e14ec8b84389b97d9060f67037bf3dd2feecf28` | Adds live assertions for exact temporal clarification and existing-action projection. |
| `Tests/RelationshipServiceBoundaryTests.swift` | `cf59e3a4dc12447e0645d4dfe26b6bd00042322e66333d3a577dad3d997540cc` | `514b3de4a665c09c5b370b7423176fd54693578257e51571c23880cc28c83fc8` | Updates typed decoding and safe-readback boundary coverage. |

## Admissibility

Build 4 direct keyboard, VoiceOver, 200% zoom, decision-control, and menu-bar
evidence remains admissible only for the unchanged controls and accessibility
order it directly exercised. It does not prove build 6 clarification semantics,
existing-action projection, cross-surface continuity, or backend retention.

Those changed claims are instead proven by the build 6 clarification screenshot
and AX tree, the five-test native live suite, the current Mac-to-Web readback,
and the build 6 deletion/TTL probes. The build 2 media remains scoped by the RC7
build-2-to-build-5 compatibility audit and this build-4-to-build-6 delta; neither
bridge turns old pixels into current pixels.
