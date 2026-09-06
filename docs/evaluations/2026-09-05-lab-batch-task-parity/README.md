# Image and Workspace Agent batch parity

## Outcome and boundary

The durable Lab batch lifecycle now covers relationship text, relationship
image understanding, and the Workspace Agent. Each task uses a registered
synthetic suite, an admitted task-specific model catalog, immutable inputs,
repetitions, a reserved-call budget, cancellation and unknown-result handling,
typed review, regression save/rerun, and the existing read-only CI consumption
contract.

The image case stores only a registered fixture identifier and SHA-256 digest
in the frozen job. The backend verifies the digest and materializes the PNG at
provider dispatch, so image bytes and base64 do not enter the job definition,
regression snapshot, or CI artifact. The Workspace Agent runs the same
`executeWorkspaceConversationAgentCore` used by the product, against a closed,
read-only synthetic contact directory. Its only admitted tool is
`contact_workspace`; business writes remain zero.

Execution receipts distinguish remote requests from product logic that resolves
locally after a tool read. A local-only Agent attempt reports `local_only`, zero
remote requests, and no actual model or prompt. A remote attempt reports the
actual admitted model and prompt revision. The client rejects contradictory
receipts.

## Product-service evaluation

The machine-readable [proof](proof.json) was produced against a disposable
PostgreSQL 18 database migrated through `046_lab_feature_overrides`. It used the
real Fastify services, Zhipu provider adapter, vision request shape, Workspace
Agent executor, regression service, and shared evaluation consumer. A local
deterministic upstream answered eight provider-adapter requests. This verifies
the product adapter and lifecycle without claiming an external provider or
real-model result.

The evaluation completed image and Agent source jobs, saved one immutable
regression for each task, reran both, consumed both through the CI evaluation
contract without new calls, and rejected a cross-task regression rerun. It also
verified the image digest boundary, the Agent's remote and local-only paths,
and zero business writes. The evaluation removed its job, attempt, regression,
and session rows after readback.

## Native evidence

Device: iPhone 17 Pro Simulator, iOS 26.5, Xcode 26.6; deployment target iOS 16.

| Surface | Evidence |
| --- | --- |
| Vision task, admitted model, and selected case count | [Image configuration](image-configuration.png) |
| Registered image suite | [Image cases](image-cases.png) |
| Workspace Agent task, model, and read-only directory boundary | [Agent configuration](agent-configuration.png) |
| Development and held-out Agent cases | [Agent cases](agent-cases.png) |

`LabJobTests` passed six focused state-contract tests, including local-only
Agent receipt validation. The signed task-picker journey passed one test and
recorded the four screenshots above after navigation settled. The backend job
runner tests include an actual vision-adapter request-shape check and an exact
Workspace Agent unique-contact tool path. The [source proof](source-proof.json)
records the reviewed file hashes and focused gate counts.

## Remaining release evidence

An internal backend with configured provider credentials can execute the same
admitted tasks against external models. This local evaluation did not use those
credentials and does not claim external model quality, provider availability,
hosted CI execution, TestFlight delivery, or production rollout. A hosted CI
verification still requires a published trusted revision and retained run,
artifact, source, and attempt identity.
