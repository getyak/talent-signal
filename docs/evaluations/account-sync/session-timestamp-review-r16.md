# Narrow independent review: Session timestamp round trip

Current reviewed snapshot: `apps/backend/src/modules/agentSessions.ts` SHA256
`15467c1f3e1de50c9de2a70d260b78f3a3edde84bcf3890bbbf84278cf8108f5`.
Initial reviewed snapshot was
`b92a70400eaefe2d481def85c2b66b8819c0b049312d3fe955d481e79a7ee0a7`;
the parent repaired the finding below during this review. These are separate
snapshots, not one unchanged implementation.

Scope: only the parent-owned timestamp delta around lines 707–747 and its
immediately affected preservation consumers. No review of Pi's evolving email
identity code, no implementation edits, and no database/provider/test execution.

## Result

No P0/P1 remains in the narrowly reviewed current delta. The initial P1 below is
closed by source inspection of the new shared predicate. Runtime acceptance of
the helper correction remains pending: the existing parent's 9/9 receipt and
running backend preceded that correction and do not prove the image case.

Current source closure:

- `sameImmutableTurn` now compares parsed milliseconds (line 176) and still
  checks turn ID, objective, task ID and context manifest ID (lines 174–181).
- Image preservation already uses that predicate (lines 199–200). An omitted
  `images` field now matches the original turn and copies its manifest; an
  empty/forged manifest is compared with the stored manifest and rejected with
  `AGENT_SESSION_IMAGE_MANIFEST_CHANGED` before persistence (lines 203–213).
- Share preservation now uses the same predicate (lines 230–231). An omitted
  share classification is restored only for the same block ID and otherwise
  unchanged block contents (lines 237–247). Changed blocks do not inherit it.
- The final existing-turn validator uses that same predicate at each original
  array index (lines 724–728), preserving the order/identity invariant. It then
  restores the exact stored timestamp string (line 729). Session creation time
  similarly retains its stored string (lines 700–708).
- The helper calls may remain before validation: all three consumers now agree
  about immutable turn identity; subsequent invalid input still rejects the
  mutation. No database migration or precision reduction of stored history is
  introduced.

### Closed initial P1: equivalent native timestamps bypass existing image preservation

The following sequence and line references describe initial snapshot
`b92a7040...`, retained as the review audit. They are not an open finding against
current snapshot `15467c1f...`.

Primary changed location:
[agentSessions.ts:739](../../../apps/backend/src/modules/agentSessions.ts#L739).

Concrete sequence:

1. A stored turn has `createdAt = ...23.180281Z` and a nonempty server-owned
   `images` manifest.
2. An existing native client submits the same turn identifiers, objective,
   task/context and order with `createdAt = ...23.180Z`, omitting `images` as a
   legacy round trip, or explicitly replacing it with `[]`.
3. `mutateAgentSession` invokes `preserveExistingShareClassifications` and
   `preserveExistingTurnImages` at lines 984–988 **before** `validatePayload`.
4. Both preservation helpers still require exact `createdAt` string equality
   (lines 176 and 234). They fail to recognize this as the stored immutable
   turn. The image helper therefore neither restores an omitted manifest nor
   rejects a changed one (lines 199–213).
5. The new millisecond comparison at line 739 accepts the turn and line 747
   restores its timestamp string. The omitted/replaced image field remains in
   the incoming payload, which is serialized into the replacement payload at
   lines 1036–1047. The relevant SQL redactor does not recover old image fields.

Before this delta the string mismatch rejected the whole mutation. It now admits
a mutation that skips an existing data-preservation/immutability guard. This is
manifest loss/change, not a claim that attachment files or foreign image access
are deleted or authorized. The analogous share helper may also lose a prior
server classification; its fallback is conservative, but it should retain the
same immutable-turn definition.

Supporting source:

- [sameImmutableTurn:168–182](../../../apps/backend/src/modules/agentSessions.ts#L168)
- [image preservation:193–213](../../../apps/backend/src/modules/agentSessions.ts#L193)
- [share preservation:224–239](../../../apps/backend/src/modules/agentSessions.ts#L224)
- [consumer ordering:980–996](../../../apps/backend/src/modules/agentSessions.ts#L980)
- [optional image contract:214](../../../packages/contracts/src/agentSessionSchemas.ts#L214)
- [payload redactor:40](../../../apps/backend/src/database/053_agent_session_review_guards.sql#L40)

Minimal repair: use `Date.parse` equality in the shared immutable-turn predicate
and use that predicate in both preservation helpers, retaining every existing
ID/objective/task/context check. Alternatively canonicalize a fully validated
immutable turn identity before either preservation helper. Do not merely copy
images based on timestamp or ID alone, and do not remove image-manifest checks.

Required narrow regression: save a real existing turn with an image manifest and
high-precision creation string; round-trip the equivalent millisecond time with
images omitted and confirm the exact stored manifest and timestamp survive.
Repeat with `images: []` or a changed manifest and confirm rejection without a
revision/data change. Keep the existing +1 ms and identity/order tamper cases.
For an unchanged display block, a dropped `allows_static_share` field should
also retain the prior classification across the same timestamp round trip.

## Timestamp semantics otherwise accepted

- Session creation already compared `Date.parse` values. Reassigning
  `payload.createdAt = previous.createdAt` preserves its immutable original text.
- Turn timestamps now compare at JavaScript's supported millisecond precision;
  equivalent fractional precision or timezone representations retain the stored
  original string through `after.createdAt = before.createdAt`. Sub-millisecond
  differences cannot change the retained original value.
- No epsilon is introduced: a change to the parsed millisecond is rejected.
  Existing schema validation checks parseable finite timestamp values; invalid
  timestamp inputs are not newly authorized by the comparison.
- The delta preserves ordered turn IDs, objective, task/context checks and the
  existing relationship/fork invariants. It does not migrate historical rows.

## Evidence boundaries

The public [timestamp verification receipt](timestamp-final-r16-receipt.json) records the result. Original task-private artifacts remain available to the operator:

- script: `/private/tmp/ai-test-account-sync.umqxBi/parent-db/session-timestamp-boundary.py`
- before: `/private/tmp/ai-test-account-sync.umqxBi/parent-db/session-timestamp-boundary-before-fix.json`
- after: `/private/tmp/ai-test-account-sync.umqxBi/parent-db/session-timestamp-boundary.json`

The parent's after receipt reports 9/9 checks: equivalent native representation
accepted with original creation strings retained; +1 ms Session/turn changes and
ID/order/objective/task/context changes rejected. The script does not include
the precision-change-plus-image-omission/alteration cases above. I did not rerun
those tests; this P1 is established by the actual consumer ordering and source
branches, pending the parent's isolated HTTP/PG reproduction.
