# Lab runtime environment implementation evidence

## Outcome

The native Lab can select a build-approved deployment after unauthenticated
manifest and readiness checks, close the current runtime, restore the target's
separate session, survive an app relaunch, reject a mismatched deployment, and
return to the original environment. A switch receipt survives relaunch.

This is source and Simulator evidence. The native network endpoints below are
explicit synthetic loopback fixtures, without accounts or providers. This is
not a TestFlight install, production deployment, live Apple sign-in, or paid
model run. The earlier [real model evidence](../2026-09-04-lab-v2/README.md)
remains separate. The complete Lab goal still includes task model trials,
experiment suites and regression enforcement, diagnostics, appearance states,
reset orchestration, and Web review.

## Observable native flow

| Step | Evidence |
| --- | --- |
| Inspect B and compare its declared deployment, revision, and data domain | [Verified B](runtime-verified-b.png) |
| Switch, terminate the app, launch again, and assert the current environment ID is B | [B after relaunch](runtime-b-after-relaunch.png) |
| Inspect a target with the wrong deployment identity; assert no switch action remains | [Mismatch blocked](runtime-mismatch-blocked.png) |
| Verify A again, return, and assert the current environment ID is the build default | [Returned A](runtime-returned-a.png) |

`LabRuntimeUITests.testVerifySwitchRelaunchRejectMismatchAndReturn` passed on
an iPhone 17 Pro Simulator with iOS 26.5. The screenshots were inspected at
native aspect ratio. Target and failure controls remain reachable by scrolling.
The [request proof](native-request-proof.json) records route metadata and the
absence of authorization and cookie headers on these synthetic requests.
It contains no bodies or credential values. TLS and redirect denial are
separate client policies; loopback screenshots do not prove real TLS deployment.

## Focused checks

- The combined native run passed 41 unit tests plus the end-to-end UI test.
  Tests include genuine Simulator Keychain partitions and legacy migration,
  authentication failure and logout behavior, capture recovery, old response
  isolation, strict target validation, active recording blockers, durable switch
  receipt restoration, original session restoration, and profile isolation.
- The runtime configuration generator passed five Node tests, including HTTPS
  policy, pinned deployment identity, duplicate rejection, and exclusion of
  credential fields from the build directory.
- Backend runtime manifest and app tests passed eight checks. Backend typecheck
  passed after adding the loopback fixture server.
- An additional 19 focused recovery tests passed, including legacy directory
  conflict preservation, deletion tombstones, protected text recovery, and the
  existing account isolation checks. These overlap some of the 41-test run;
  they are not presented as 60 distinct cases.
- Release Simulator build passed with its default device-Lab gate disabled.
  Localization (1,407 keys), documentation, wiki consistency, architecture
  diagrams, and whitespace checks passed.

Local artifacts: `/tmp/talent-signal-lab-v2/runtime-native-final.xcresult`,
`runtime-native-final.log`, `runtime-recovery-final.xcresult`,
`runtime-backend-final.log`, and `runtime-release.log`. The initial unsigned
Simulator run failed Keychain entitlement checks; the signed Simulator run
passed. The first UI harness hit a duplicate accessibility match on the native
confirmation button; the corrected harness selects its first matching control
and stops on failure. Neither failed run is counted as successful evidence.

## Scope and recovery rules

Credentials and protected local recovery are separated by canonical endpoint,
account, and user. Legacy data moves only after its origin binding is known;
workspace aliases require that same bound account. Conflicting records are
preserved and block mutation. Deletion intent moves before content, and moved
legacy copies cannot later resurrect a deleted record. Text drafts, captured
screenshots, audio capture directories, profile references, Agent state, owned
action recovery, and experiment recovery retain their original context.

Endpoint directories are compiled metadata, not arbitrary URL entry. All API
clients deny redirects and use an ephemeral session without shared cookies,
credential storage, or URL cache. Active writes and recordings block the
transition; a generation change discards old authentication responses and
rebuilds the workspace root. Selecting another backend never installs a new
native binary, migrates its database, or copies user evidence to it.
