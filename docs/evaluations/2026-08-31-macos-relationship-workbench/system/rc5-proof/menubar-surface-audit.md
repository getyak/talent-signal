# RC5 menu-bar surface audit

Release candidate: Talent Signal macOS `0.1.0` build `4`.

- Frozen zip SHA-256: `2d125b26f0185a5094375678d2345ea410538202db9fbed938804a9d7f2f34b9`
- Frozen universal binary SHA-256: `7744ed9290495dd1d4a871de605ac76a4bb317fdd6fae06413d8c07362dfee98`
- Frozen source snapshot SHA-256: `a00c08c1c2bb4818ace44b454dbc193bde52771230b986bca0c96cdab3e85367`
- Direct menu-bar presence screenshot SHA-256: `b5dd8770300db0fef758050570fa211f385f200539cd056359d8ea343a093228`
- Data classification: synthetic fixture only.

The direct screenshot is a full-display capture of the exact extracted frozen
binary running in `needs-decision` state. It shows the native macOS status item
in the menu bar while the Relationship Workspace remains active. The item uses
the product state image (`diamond`) rather than relationship or evidence text.

The frozen source binds that item to the same `AppModel` as the workspace and
renders `MenuBarPresenceView` through `MenuBarExtra`. The menu exposes only:

- Open Quick Panel, Relationship Workspace, or Action Center.
- Pause or resume context intake.
- Stop local context intake.
- Clear local context.
- Sign out and clear local recovery.
- Generic privacy, status, and `Notifications: off in this MVP` text.
- Quit Talent Signal.

The native safety test `testMenuBarPrivacyCopyNeverContainsRelationshipOrEvidenceContent`
passes in the frozen-source test suite. The focused notification proof also
passes and confirms that the Release target has no system-notification API
symbols or linked notification framework. This audit proves native persistent
presence, same-model command wiring, generic copy, and the absence of a
notification delivery sink. It does not claim App Store signing, notarization,
or production notification behavior.
