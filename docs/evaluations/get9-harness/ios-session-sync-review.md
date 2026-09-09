# GET-9 iOS authenticated Session sync review

Date: 2026-09-10. Reviewer: independent design_review agent.

## Scope and decision

Read-only review of the four-file patch in `PursuitWorkspaceClient.swift`,
`PursuitWorkspaceStore.swift`, `RelationshipArchiveView.swift` and
`SessionConversationClientTests.swift`, plus narrow inspection of the existing
Session sync implementation and its chat call sites. **No new P0/P1 confirmed.**
Only this review artifact was written. No Simulator, Xcode build, native test,
backend process or product implementation was controlled by the reviewer.

## Correctness and authorization

The former `synchronizeAgentSessions` guard returned success when the view's
initial access token was absent. A loopback client can establish its login
later, so that guard did not establish whether a product Session existed before
chat. The supplied `/tmp/get9-ios-native-api.log` contains three unscoped-chat
POSTs and no `/v1/agent-sessions` request. This agrees with the identified
missing-sync path; it is pre-fix evidence, not proof of the repaired UI.

At `RelationshipArchiveView.swift:986–998`, only noncanonical preview state
continues to bypass remote synchronization. Canonical state now requires the
actual workspace service to implement `AgentSessionSyncServing`, waits for an
existing synchronization to finish and returns its result. A missing service
returns false. Existing chat call sites gate submission on that result
(`RelationshipAskView.swift:3485`, `3915`, `4352`), so a failed sync does not
silently become permission to submit the Session.

At `PursuitWorkspaceClient.swift:650–667`, list/put/delete derive their token
from the same actor's cached `WorkspaceLoginResponse` and pass the same base URL
and URLSession into the established `AgentSessionSyncClient`. Expected revision,
idempotency UUID and Session ID/payload pass through unchanged. The adapter does
not add a separate login identity, credential store or account selector.

The remote-endpoint guard runs before `loginIfNeeded`: an unauthenticated
nonloopback endpoint cannot receive simulated login. Production callers already
populate all authenticated-session fields in the view initializer; those clients
reuse their supplied token. Authentication failures from the sync client remain
errors rather than triggering simulated login or a different credential path.

`PursuitWorkspaceStore.swift:268` exposes only the sync protocol through a cast
of its existing private service. Preview initialization with no service still
sets `isCanonical=false`; injected canonical services must now implement sync
or fail closed. This is an intentional compatibility requirement for test
adapters, not an added external authorization.

Existing `AgentSessionStore.synchronize` retains pagination validation,
revision-aware writes, local tombstones, generation/cancellation checks and
required-Session availability checks. The patch does not remove those gates or
change account/user persistence namespace construction.

## Validation limits and necessary follow-through

The new tests at `SessionConversationClientTests.swift:94–135` establish the
intended **sequential** list-then-chat token reuse and reject unauthenticated
remote login. They use an injected ephemeral URLSession; the loopback test
expects exactly one simulated-login request and the same Authorization value
on both subsequent requests. Their Xcode execution was still pending when this
review was written; code inspection is not a test pass.

The first test does not PUT a Session: it mocks an empty list and then directly
calls chat with a generated ID. Thus it proves client login reuse, not the
original end-to-end missing-Session regression. Retain the planned native
verification showing an actual Session PUT and successful readback **before**
the unscoped POST, with the same Session ID and authenticated principal. Cover
PUT/delete forwarding and supplied production-token behavior in focused client
checks when extending this adapter's tests.

`loginIfNeeded` is existing actor-reentrant code, not a coalesced in-flight
login task. The new test cannot establish a one-login guarantee for simultaneous
first calls. The standard initial view load is sequentially awaited before
revalidation, and no new cross-account or source-authorization failure was
confirmed here. Do not extend the sequential test claim into a concurrency
claim without exercising that schedule.

The patch is code-review acceptable at this boundary. Native build/test and
actual repaired Session creation/chat behavior remain separate pending evidence;
this review does not close the interrupted full iOS suite or GET-9 as a whole.
