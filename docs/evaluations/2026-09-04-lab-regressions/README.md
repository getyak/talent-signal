# Saved Lab regressions and evaluation consumption

Date: 2026-09-04. Scope: working-tree source and iOS Simulator proof. This
milestone completes the saved-failure loop; the full Lab plan remains active.
No TestFlight, production deployment or hosted CI run is claimed here.

## Observed outcome

A tester can save a particular experiment output with typed issues and expected
behavior, restart the app, reopen the same case, rerun its frozen input against
current admitted configurations, review its JSON export, and delete the case
with its derived results. The final native journey verified a completed rerun
on screen and HTTP 410 for both the deleted case and its rerun.

- [Native API/readback evidence](regression-native-proof.json)
- [Saved case](regression-native-saved.png), [recovered case](regression-native-recovered.png)
- [Completed native rerun](regression-native-rerun.png), [export preview](regression-native-export.png), [deletion receipt](regression-native-deleted.png)
- [Authenticated evaluation readback](consumer-readback.json)
- [Local execution of the CI consumption path](consumer-ci-local.json)
- [Database integration checks](backend-checks.json)

All source material and provider responses in this milestone are synthetic.
The proof service uses the actual Chat adapter with a fixture fetcher; the
reported model ID is not evidence of a real glm-5.3 call. The final UI journey
issued two source and two rerun fixture requests. Its provider counter is
cumulative across harness development. There were zero external model calls
in this milestone. Real provider evidence remains in the earlier
[batch evaluation](../2026-09-04-lab-batches/README.md).

## State and lifecycle

Migration `043_lab_regressions` stores immutable case snapshots, content hashes
and parent lineage. Save, delete and rerun use stable identities. Deletion
shares the account lock with job creation, clears derived case snapshots and
attempts, expires linked jobs and removes their lease authority. A late
provider result cannot restore deleted output. Expiry uses database time.

| Data | Owner and scope | Retention and deletion |
| --- | --- | --- |
| Selected synthetic input, output, configuration and review | Backend account/user case | 90 days; explicit deletion cascades to derived cases and reruns |
| Original source batch | Backend account/user job | Independent seven-day lifetime; saving a case does not extend the batch |
| Pending save/delete intent | iOS environment/account/user protected file | At most seven days; review text removed after authoritative readback; excluded from backup |
| Confirmed native selection | Same protected recovery file | ID only; content read from authenticated backend |
| Export preview | iOS process memory | Cleared when closed or deleted |
| Explicit exported copy | User-selected file destination | Separate copy; disclosed independent removal requirement |
| Evaluation consumption report | Caller-selected local artifact | Metadata only; CI upload retention configured to seven days |

The model receives the original input and reference time. Expected behavior,
review notes and previous answers are not appended to that input. A rerun must
use a currently admitted model/preset; unavailable historical configurations
require a visible new selection rather than silent fallback.

## Evaluation and CI boundary

The evaluation runner consumes an exact saved snapshot plus a terminal rerun.
It checks their hashes, lineage, frozen input/time, complete unique attempt
matrix, actual configuration, output contract and authorized citations. It
uses `packages/evaluation` atomic gates. Failed checks veto; unavailable or
unknown attempts cannot pass. New output keeps semantic quality at
`needs_review`, regardless of earlier preference. An inspected failure is
development evidence even if its original source was held out.

Authenticated consumption rechecks source lifetime after fetching the run,
rejects redirects and bounds response size. Offline file consumption is
explicitly caller-reviewed historical evidence. Neither path calls a model,
asserts hosted CI verification, or grants release authority. The two reports
above were produced by the actual CLI; authenticated consumption left the
provider request counter unchanged. Usage is documented in
[Evaluation v2](../../../evals/v2/README.md#consume-a-lab-regression).

The backend CI job is now configured to create a disposable database, exercise
save/rerun/delete using a synthetic provider, consume the resulting records,
and upload only its metadata report. The same commands passed locally.
Workflow syntax and existing release-policy checks passed. An actual hosted
run and case-specific verified receipt have not yet been connected to the Lab
record. The native UI therefore continues to show **Not included in release
checks**. Fixture lifecycle coverage does not prove model quality or online
product benefit.

## Verification

- 23 isolated PostgreSQL lifecycle, scope, idempotency, expiry and deletion
  checks passed; final database evaluation issued seven fixture requests.
- 11 signed Simulator unit tests passed: six regression recovery/binding
  tests and five existing batch tests.
- The native save/relaunch/rerun/export/delete journey passed. Export preview
  preserved explicit JSON nulls; the client exports original bytes rather than
  a DTO re-encoding that would change the content hash.
- Nine evaluation-consumer and transport tests passed, including tampered
  input, changed clock, duplicate attempts, unknown results, citation/config
  failures, redirected-origin policy, oversized input and deletion readback.
- Backend and evaluation-runner typechecks passed. Localization passed with
  1,589 catalog keys. Actionlint and 14 existing CI release-policy tests passed.
- The Release Simulator build passed. Documentation checks passed.

The native harness now selects the exact source batch before reviewing output,
uses bounded directional scrolling and waits for visible completion. Export
close explicitly clears the presentation state. Failed persistence blocks a
new mutation until disk readback resolves whether the prior intent committed;
that correction has a focused recovery test. These are executable protections,
not additional global repository instructions.

Raw logs and xcresults are temporary under
`/tmp/talent-signal-lab-v2/regression-*`. Only selected synthetic evidence is
retained here. The owned fixture API was stopped and its tmpfs PostgreSQL container removed
after evidence export. Shared internal databases and APIs were untouched. Remaining work, including verified hosted CI
receipts, image/Agent batches, device tools, reset flows, internal observations
and Web review, remains explicit in the
[complete implementation plan](../../../plans/2026-09-04-lab-complete-runtime.md).
