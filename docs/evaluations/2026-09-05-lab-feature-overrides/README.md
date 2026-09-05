# Lab feature override evaluation

This proof covers the first admitted Lab feature override: relationship evidence
preview. The server default shows a source card. An explicit, temporary override
for one authenticated session shows the already-authorized exact citation
excerpt inline. It does not change evidence review, authorization, provenance,
confirmed state, identity, ranking, or action authority.

## Persisted product proof

`runLabFeatureOverrideEvaluation.ts` ran against a disposable PostgreSQL 18
database migrated through `046_lab_feature_overrides` and a real Fastify app on
loopback. All source content was synthetic. The proof verified:

- the catalog exposes one named, revisioned feature with a closed value set;
- creation is exactly idempotent and conflicting reuse of an ID is rejected;
- replacement requires the exact active override ID and stops the prior record;
- another authenticated session for the same user cannot list or read the
  override;
- a new relationship Chat task freezes the active override adoption receipt in
  its context manifest;
- stopping the override returns later tasks to the server default while the
  earlier task keeps its original receipt;
- a backend revision change stops the active override with
  `configuration_changed`; and
- the override record contains no objective, evidence, citation, or answer.

The machine-readable result is in `proof.json`.

## Native product proof

The iPhone 17 Pro Simulator on iOS 26.5 completed the feature override UI path
against the same loopback backend: inspect the server value, apply the
session-only override, observe the effective value and expiry, then restore the
server default. `ProductLabUITests` passed and retained the screenshots in this
directory.

The native store tests also verified explicit-null concurrency intent, lost
start recovery, lost stop recovery, sign-in isolation, substituted-value
rejection, readback receipt admission, and saved-session receipt continuity.

## Cleanup

The proof backend, disposable database, temporary media directory, and loopback
listeners were removed after evidence capture. No external provider call or
business-system write occurred.
