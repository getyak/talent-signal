# Native source identity: build 4 to build 5

Observed: 2026-08-31T17:22:18Z  
Classification: synthetic-only release evidence

## Artifacts compared

- Build 4 source archive: `system/frozen-rc5/TalentSignalMac-source-0.1.0-build4.tar.gz`, SHA-256 `a00c08c1c2bb4818ace44b454dbc193bde52771230b986bca0c96cdab3e85367`.
- Build 5 source archive: `system/frozen-rc7/TalentSignalMac-source-0.1.0-build5.tar.gz`, SHA-256 `43ca4ffa7be6b75cf3993c8254793446f4655c293046b87a510bf91cc08901e6`.

## Native UI identity result

Every one of the 22 Swift source, unit-test, and UI-test files under `apps/macos` has the same relative path and the same SHA-256 in both archives. The normalized, path-aware Swift checksum manifest is identical:

```text
build 4  dff8ef174054243ee44351bd88012692f576b6280e70cd109f9d9625bfe650e3
build 5  dff8ef174054243ee44351bd88012692f576b6280e70cd109f9d9625bfe650e3
```

The only intentional native project-setting change is:

```diff
- CURRENT_PROJECT_VERSION: 4
+ CURRENT_PROJECT_VERSION: 5
```

The generated outer Xcode project contains the same build-number change in its Debug and Release settings. Marketing version remains `0.1.0`. The build 4 archive also contained a redundant nested generated Xcode project; it is not an application source input and is excluded from build 5.

Therefore RC5's direct keyboard, VoiceOver, 200% zoom, and menu-bar visual evidence is admissible for build 5 only for native presentation and interaction claims. It is not presented as a new build 5 recording.

## Safety delta outside the native UI

Build 5's source archive adds the backend migration, retention implementation, contract schema, backend/evaluation coverage, and strengthened release-boundary probe used to close MAC-TX-007. Those changes are validated independently by the build 5 live E2E, backend check, TTL expiry proof, full public-table sentinel scan, and post-restart readback. This identity result does not claim that backend behavior is unchanged.

## Reproduction

1. Extract both source archives into separate empty directories.
2. Hash each `apps/macos/**/*.swift` file with SHA-256 using its relative path.
3. Sort the per-file lines and hash the resulting manifest.
4. Run a recursive diff over `apps/macos` and inspect `project.yml` plus the outer `project.pbxproj`.

The visual-evidence bridge expires on any future change to an `apps/macos` Swift file, resource, entitlement, Info.plist input, or behavior-affecting project setting.
