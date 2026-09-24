# Independent review and retest

Status: ongoing; no overall quality or release acceptance yet.

## Backend Pi packet

Pi task `20260924-150856-73fa04ab` produced the first backend patch against
`159c640286c14fa3c1d0244db3f318bf9b30422c`. Its unit verification passed, but its
database regression was skipped. The parent applied the scoped patch to the audit
worktree, then ran it against an isolated PostgreSQL 18 container on loopback
55451 with synthetic fixtures. No resident database was used.

- Initial executed result: 45/45 tests in conversation queue integration,
  system health, and readiness passed.
- Review found a missing acceptance condition: recovery finalized a crashed
  stopped entry as cancelled and scrubbed its source text without first saving
  the admitted user message to Session history. A new destination-readback
  assertion failed with an empty turns array. This is a confirmed gap in the
  first patch, not an inferred risk or a green-test acceptance.
- Parent corrected recovery to use the existing governed cancellation path and
  read only the admitted image manifests. The stop marker, exact user message
  and attachment references now persist before queue scrubbing, with no provider
  replay. The strengthened regression includes an image attachment.
- Retest: the same 45 tests passed; backend typecheck also passed.

Further independent failure injection found and corrected two additional loss
or false-state paths:

- A real stop transaction rolled back after its operation receipt failed, but
  the live stop event had already been emitted. The regression observed the
  event while PostgreSQL correctly retained `cancel_requested=false`. Stop
  publication now happens only after the transaction returns successfully,
  and never when replaying an already recorded operation.
- If saving a recovered stopped message to Session history failed, the runner
  still finalized cancellation and erased its objective. A real transaction
  with an injected Session-write failure reproduced `objective=null` and
  `status=cancelled` despite empty Session history. Failed persistence now keeps
  the admitted content and pending stop under the existing retention boundary.
  Lease recovery retries persistence without calling a provider. The regression
  verifies the source survives the failure and exactly one turn is saved after
  recovery.
- Combined retest: 47/47 tests passed across the real PostgreSQL queue suite,
  system health and readiness. These tests use synthetic fixtures and do not
  mutate the resident database.

The audit branch then incorporated current `origin/main` at `88eb33b3`
(GET-49, PR #242). Its new prioritize operation used the same pre-commit stop
publication pattern. Extending the real rollback regression to both stop and
prioritize reproduced an emitted stop for the rolled-back prioritize operation.
Both operations now publish only after commit; prioritize retains its explicit
auto-continue behavior. Retest after migration 082: 52/52 queue, system-health
and readiness checks passed against the disposable database, and backend
typecheck passed.

The original [Pi report](backend-audit.md) describes its own frozen first patch.
Its F1 diff description is superseded by the correction above. F4 was reproduced
and fixed. F3 currently has no observed UI exposure: the external read route
returns scope rather than the inactive item body, and mutation rejects inactive
items. Health observation deadlines bound the
response, not the lifetime of the underlying pg query; connection-acquisition
cancellation remains a separate reliability concern.

## Conversation retention wording

The production prompt sources now share a narrow rule distinguishing domain
actions from conversation/audit retention. The rule is relevant when explaining
no_action or a no-save request; it does not mandate a disclaimer on every answer.

- Agent build and 43 existing prompt/provider/registry tests passed.
- Live synthetic experiment used the current runtime model route,
  `anthropic/claude-sonnet-5` through the configured Hao endpoint, with zero
  exposed tools and zero actual tool calls. Three replies were manually checked.
- The definition and correction cases both distinguish contact/Memory/calendar
  changes from separate conversation/run retention. The ordinary reply was only
  “测试完成。” No unsupported privacy or deletion promise was observed.
- This is bounded provider evidence for the source change, not a guarantee for
  all replies, and not proof that resident services have received the prompt.

The first harness attempt used a disallowed zero tool-call budget and failed
before network execution; the corrected harness has a positive budget and an
empty tool manifest. The failed harness run is excluded from model-quality
claims. Durable successful output: [retention live experiment](evidence/retention-live.json).

## Runtime diagnostic latency

The API and Agent host entry points now disable Node diagnostic-report network
lookups and environment inclusion before serving tasks. SDK 0.3.266 probes Linux
libc through a synchronous `getReport()` call. Its required glibc field remains
available with network collection disabled. Both entry points passed typecheck;
resident deployment and a new source-flow health probe remain required.

The disposable [probe](../../../scripts/evals/diagnostic-report-probe.mjs)
exposes `/baseline` and `/safe` in a process containing an active HTTP socket.
Only durations and libc availability are returned; no report, stack or
environment is printed or retained. The isolated Linux measurement was 3,118ms
versus 2.4ms. An empty process and a process with only a local PostgreSQL socket
were already fast, which is consistent with socket-dependent reverse DNS cost.
This evidence supports the mechanism but does not quantify the entire 35-second
resident stall or certify a production SLO.

## Frontend Pi packet: first review

The first packet passed web typecheck/lint and 1,229 tests (one skipped). It is
not yet accepted. Independent review returned two issues for repair:

- After first-source success and clue failure, correcting the clue resets the
  first source request identity while keeping `new_person` scope. The repair
  must retain the committed identity and only finish the unsaved clue, including
  when the user omits that clue instead. An unchanged-input retry alone does not
  prove this user-directed recovery path.
- Admission accepts a matching `draft_session` even alongside unrelated query
  parameters. Mixed and duplicate query parameters must preserve navigation.

Real browser acceptance of the revised packet remains pending.
