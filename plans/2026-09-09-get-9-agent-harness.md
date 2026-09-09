# GET-9: shared Claude Agent SDK harness

## Outcome and authority

Implement [GET-9](https://linear.app/getyak/issue/GET-9) across Web, iOS and
Chrome capture: Claude Agent SDK owns planning, tool iteration, multimodal
understanding and work continuation. Product services own account scope,
canonical contacts/Memory, approvals and observed effects. Natural conversation
does not require model-authored JSON; durable writes use typed product tools.

The issue was read from the authenticated Linear desktop application on
2026-09-09. Its embedded credential is deliberately excluded from this plan.
The requested gateway is `https://api.hao.ai/anthropic`, with the requested
model identifier `anthropic/claude-sonnet-5.0`. These are configuration inputs,
not verified capability, price, or provider-identity claims. Verify actual SDK
compatibility with synthetic inputs before admitting private evidence.

## Baseline and findings

- Isolated worktree: `/Users/cubxxw/data/talent-signal-get9`.
- Branch: `codex/get-9-harness`; initial upstream baseline: `56292d3c`.
- `apps/agent` pins Claude Agent SDK `0.3.260`. `claudeProvider.ts` disables
  images, SDK persistence, Skills, subagents and all built-in tools. It expects
  terminal JSON for every run and only selects pursuit/public-research schemas.
- Natural chat uses a separate Zhipu completion loop. Screenshot contact tasks
  always call `extract()` before their independent model/tool loop; subsequent
  decisions cannot inspect the original image.
- Existing product services already enforce account identity, reviewed writes,
  source deletion, idempotency, task leases and destination receipts. Preserve
  these boundaries while replacing model orchestration.
- Agent-host owns public search/profile credentials. Infisical is the canonical
  store; `/operations` contains the Linear integration credential.
- Both prototype browser-extension and integrated Chrome-extension directories
  exist. Validate the integrated product path, without mistaking fixture-only
  tests for cross-surface production proof.

## Scope and approach

Use one injectable SDK execution primitive, explicit server-owned configuration,
typed tool registration, cancellation/budgets, natural text output and image
inputs. Product adapters supply scoped tools and verify every effect at the
tool entry point. Curated Skills and focused subagents load by capability;
ambient user plugins, credentials and filesystem access do not become product
permissions. Tool errors return actionable observations to the SDK loop.

SDK continuation is account/session-bound working context, with invalidation
on revoked/deleted sources. Long-term product Memory remains provenance-aware
database state; a new Session can retrieve it without the old transcript.
Screenshot understanding starts with original images and user intent. OCR is
optional, and extraction remains an unconfirmed, reviewable artifact.

Reject a second planning loop around the SDK, a separate Memory platform,
unrestricted host shell/browser access, silent provider fallback and relaxation
of safety checks to improve evaluation scores. External messages and calendar
writes retain exact-effect human authorization.

## Milestones

1. **Complete — design and baseline:** map six issue scenarios to current paths,
   verify SDK/gateway interfaces, record a concrete design and evaluation rubric.
2. **Implemented, verification active — shared runtime/configuration:** SDK executor, scoped capability
   registration, original-image support, work continuation and provider probes.
3. **Implemented, surface acceptance active — product adapters:** migrate conversational and screenshot flows,
   connect Memory/research/calendar draft tools, verify Web/iOS/Chrome contracts.
4. **Active — evaluation and independent review:** execute synthetic adversarial
   and real-model cases, fix failures, review consequential boundaries and close
   all confirmed P0/P1 findings with reviewer readback.
5. **Pending — delivery:** PR linked to GET-9, latest-head CI and repository
   gates, merge/readback, local TestFlight backend deployment and applicable
   post-merge proof, then Linear completion/readback.

## Evaluation contract

| Case | Required observation |
| --- | --- |
| E01 | Natural supportive response using authorized history; no forced contact workflow or fabricated memory. |
| E02 | Original social-profile image reaches main Agent; editable contact draft accurately cites name/company/account. |
| E04 | Stable account clue resolves existing person; person count unchanged and relationship Memory preserved. |
| E05 | Autonomous search/read handles current official source, old interview and namesake; cited draft distinguishes time and identity, with no confirmed-state overwrite. |
| E07 | Fresh Session retrieves sourced commitment and response preference from durable Memory without old dialogue in the request. |
| E10 | Frozen reference date 2026-09-09 and Asia/Shanghai produce 2026-09-10 15:00–15:30 draft; no external write before confirmation; verified receipt after confirmation. |

Each scenario must pass deterministic state invariants and a repeated live-model
trial. Score task completion, grounding, naturalness and recovery independently
on a published 0–4 rubric, targeting at least 3 per dimension with no safety
failure. Report actual attempts, variance, failures and missing evidence;
synthetic fixtures and mocked SDK results are not live quality evidence.

Adversarial coverage: namesake ambiguity, injected image/web instructions,
unauthorized scope/tool, missing/revoked credentials, provider mismatch,
timeout/cancellation, malformed output, stale/deleted source, duplicate request,
resumption after interruption and unknown external result. Checks include
`pnpm eval:ci`, relevant agent/backend/client tests, `pnpm docs:check`, SDK
gateway probe and real-surface evidence. Additional checks follow changed paths.

## Open evidence

Full SDK gateway compatibility, persistent-session
retention/invalidation mechanism and cross-platform calendar projection must be
verified. No quality score, CI pass or completed acceptance is claimed yet.

## Implementation checkpoint (2026-09-09)

- `claudeHarness.ts` now owns one SDK loop with natural text or opt-in artifact
  schemas, original image blocks, curated plugin Skills, read-only subagent
  tool subsets, isolated temporary HOME/configuration/debug output, usage and
  tool budgets, cancellation and cleanup. Product request adapters are still
  being completed; this is not yet the sole deployed execution path.
- `claudeHarnessConfiguration.ts` validates endpoint and exactly one auth mode;
  its diagnostic receipt excludes credentials. The existing dev Anthropic key
  targets a different gateway. Staging `/shared` has no Anthropic/Claude key.
  The credential supplied in GET-9 was securely imported into the new
  `dev:/shared:HAO_ANTHROPIC_API_KEY` variable. The one-time loopback import
  helper kept the value out of commands/logs, removed its mode-0600 temporary
  file, and shut down. This dedicated key is required for the Hao endpoint;
  generic credentials from the other gateway are never reused there.
- `ClaudeChatProvider` is selectable with `TALENT_SIGNAL_CHAT_PROVIDER=claude`.
  It preserves the product's contact proposal/selection receipts while allowing
  model prose. Prompt/evaluation metadata and observation integration still need
  completion before production selection.
- `ClaudeContactAgentModel` plus the `runSDK` backend branch remove the external
  model planning loop and compulsory OCR pass. The Agent records per-image
  understanding through a tool; existing deterministic merging preserves
  cross-image identity conflicts. All product operations retain transaction,
  source and lease gates. Lease renewal is independent of slow public reads.
- Independent reviews found and fixed two primitive P1s (post-authority
  cancellation and terminal-only token-budget checks) and two screenshot P1s
  (flattened multi-image identity and lost execution signals in queued tools).
  Core and screenshot fixes independently rechecked and closed.
- New focused Agent tests: 13 passed across four files. Agent-wide tests at an
  earlier checkpoint: 108 passed, 1 skipped. Backend typecheck passed before
  latest regression additions. Re-run the relevant full checks at final head.
- Real PostgreSQL screenshot integration: **12/12 passed**, including SDK
  no-OCR/reuse, conflicting image/resume denial and queued write cancellation.
  Dedicated disposable database: container `ts-get9-harness-eval`, loopback
  port `32773`, synthetic `get9_eval` database. It uses tmpfs because the first
  disk-backed attempt timed out on initial schema creation. No production data
  or database was used. Remove this task-owned container after verification.
- `pnpm eval:ci` exited 0; its existing proof still reports
  `releaseReadiness=needs_review`. Log: `/tmp/get9-eval-baseline.log`.
  `pnpm docs:check` passed. Test-generated historical runtime timestamps were
  restored rather than included as a product change.
- Linear API credential in `dev:/operations` belongs to the DayPage workspace,
  not GetYak. GET-9 was read through the authenticated native Linear app; use
  that app for issue status/readback until a correct connector is available.

### Profile and client checkpoint

- Added profile-only understanding and an editable source-linked `contact_draft`.
  No contact/capture is written until the dedicated human
  `/profile-confirmation` route receives the exact current revision and decision.
  Agent tools cannot invoke that route. Explicit selected scope is preserved.
- Confirmed account matches are rechecked inside the save transaction. Existing
  people are reused; same-name ambiguity returns candidates; competing confirmed
  account owners block the write. Edits are recruiter-reviewed contact-field
  evidence; original image excerpts remain separate and no fake chat messages
  are created. Profile filing does not overwrite product Memory.
- Web and iOS now offer editable name/company/account fields and exact sources.
  iOS dispatch reuses existing task-owner/cancellation checks. Browser extension
  still blocks real image handoff; its fixture-only packaging is insufficient.
- Independent review found one profile P1: mixed-platform account namespaces
  could be flattened to the first image platform. Cross-platform batches are now
  rejected before drafting; UI shows the platform. Reviewer closed the P1 and
  independently passed the three pure provenance regression tests. No other
  P0/P1 found in this slice; this is not full GET-9 review.
- Latest local screenshot integration: **13/13 passed** after explicitly warming
  four test database connections. First Docker forwarded-port connection was
  measured at 8,204 ms while a query took 142 ms. Five-second business-test
  limits remain unchanged. Independent full runs still had timing failures
  (6/12 and later 9/13; assertions in the new profile case passed). The iOS
  compiler ran concurrently with the latest independent DB run. Re-run with
  exclusive machine resources; do not report the independent runs as green.
- Agent/backend/Web typechecks passed before the newest platform display change;
  rerun final-head checks. iOS localization check passed; `pnpm ios:check` is
  running with log `/tmp/get9-ios-check.log` (session 56297). It uses the standard
  machine-wide lock and disposable derived data. New localizations preserve the
  original catalog order. No production configuration or secret was changed.

### Remaining implementation gates

1. Profile screenshot drafts now have a dedicated human confirmation path and
   Web/iOS editing. Complete client visual/interaction proof, more conflict and
   source-lifecycle regressions, and the integrated Chrome image handoff.
2. Scoped durable SDK continuation requires an account/owner/session/provider
   configuration/source-generation mapping, an atomic tombstone, cancellation
   and physical cleanup of local, mirrored and subagent copies. Do not enable
   `persistSession` ahead of these gates. SDK SessionStore is dual-write.
3. Wire durable sourced Memory, account response preference and calendar draft
   tools, then verify their real client paths and destination receipts.
4. Complete evaluation metadata/Opik parity and actual gateway probes before
   selecting the new runtime in deployment; run all six live scenarios and
   cross-surface proof before PR delivery.

### Frozen quality rubric

Run each of E01/E02/E04/E05/E07/E10 three times against the same synthetic
fixture and configuration snapshot. For each dimension, 0 means absent or
contradictory, 1 materially incorrect/incomplete, 2 useful but requiring a
substantial correction, 3 correct with only minor friction, and 4 complete and
clear without material correction. Apply these anchors independently to task
completion, source grounding, conversational clarity and recovery. A scenario
passes only if every trial scores at least 3 in every applicable dimension and
all deterministic safety invariants pass. Mark non-applicable dimensions with
the reason instead of assigning free points. Report retries and all first-run
failures; no safety failure may be averaged away. An independent reviewer
checks the frozen inputs, tool receipts, responses and scoring rationale.

## Sources

- [SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)
- [SDK loop](https://code.claude.com/docs/en/agent-sdk/agent-loop)
- [SDK permissions](https://code.claude.com/docs/en/agent-sdk/permissions)
- Installed SDK TypeScript declarations are the version-specific API authority.

### Gateway verification checkpoint

- Linear GET-9 is now **In Progress**, read back from the authenticated native
  app. No issue completion is claimed.
- Hao credential import succeeded and metadata-only readback confirmed the new
  variable is available. Active production provider/model settings are unchanged.
- The issue's `anthropic/claude-sonnet-5.0` identifier returned HTTP 404
  `model_not_found` twice. [Hao's current catalog](https://hao.ai/models/category/chat)
  names the same Sonnet 5 model `anthropic/claude-sonnet-5`. This is an explicit
  identifier correction, not an automatic provider/model fallback.
- Corrected native Messages request returned HTTP 200, `model=claude-sonnet-5`,
  synthetic output `OK`, 52 input and 4 output tokens, request ID
  `msg_011Cesr7W4htgtUvCgt1Njuj`. No private source was sent.
- `scripts/evals/probe-claude-harness.mjs` now tests an unpredictable synthetic
  tool receipt through the real SDK loop, recording requested and reported model
  identifiers separately. The first run passed: one tool call, exact unpredictable marker returned,
  1,727 input / 63 output tokens, 32,655 ms, SDK estimated cost USD 0.004084
  (not the gateway invoice). Log: `/tmp/get9-hao-sdk-probe.log`. The SDK usage
  map labels its entry with the requested model alias; subsequent probes collect
  `assistant.message.model` separately instead of calling a usage-map key an
  actual provider model. The probe never exposes credentials or response prose.
- Official protocol reference: https://hao.ai/docs/api/anthropic/messages .

### Continuation and evaluation checkpoint

- Agent-wide regression: **120 passed, 1 skipped**. Lab configuration: **13/13**.
  Backend typecheck passed before the latest host-commit rollback addition.
- Natural prompts remove only the exact formal legacy JSON transport clauses;
  frozen Lab presets use the same effective text/hash as execution. Trials retain
  requested and reported model names separately, allow only the verified Hao
  namespace alias, reject substituted models, and report SDK transport attempts
  as unknown. SDK response count is not labeled request count.
- Policy-gated private observation now records each SDK assistant receipt once
  by message ID, preserves provider usage, and treats MCP `isError` as a tool
  failure. These are receipt-time events, not measured network latency; absent
  per-request inputs/retries/cost remain unavailable. Root and product source
  lineage use the existing outbox deletion mechanism. Independent review found
  no P0/P1 in this slice. Partial usage on nonterminal SDK interruption remains
  a P2 limitation; failed terminal results already retain usage/classification.
- Repeated real Hao SDK tool probe passed with reported `claude-sonnet-5`, one
  exact marker tool receipt, 1,728 input / 69 output tokens, 44,529 ms, SDK cost
  estimate USD 0.004146. Log `/tmp/get9-hao-sdk-probe-final.log`.
- Real two-turn SDK continuation probe passed: the second request contained no
  previous code, the same SDK Session recalled it exactly from 16 mirrored
  entries, and no task-owned resumed transcript remained on disk. Total 13,639 ms;
  runs used 340/5 and 459/27 input/output tokens. Log
  `/tmp/get9-hao-continuation-probe.log`. The mirror in this probe is synthetic
  in-memory storage; separate PostgreSQL lifecycle tests cover persistence.
- Added host-issued continuation leases and an account/user/product-Session/
  configuration/scope/generation-bound PostgreSQL SessionStore. Mirroring shares
  the product transaction; savepoints discard failed turns while preserving the
  last committed checkpoint. A transaction advisory lock permits one writer;
  short final source/session fences close the validation-to-commit race.
  SDK UUIDs are server-owned. Entry retries are deduplicated and conflicting
  UUID bodies rejected. Main/subagent copies share bounded retention and purge.
- Migration 058 conservatively invalidates account SDK derivatives on source
  correction/revocation/deletion; product Session deletion, old-turn removal,
  scope changes and expiry erase copies. No product Memory is deleted by this
  cache invalidation. A host-provided source expiry further limits retention.
  Dedicated PostgreSQL tests passed **4/4**, and combined with Lab **17/17**.
- Pinned SDK source inspection found resume materialization ignores subprocess
  TMPDIR and writes a parent-temp `claude-resume-*` copy. Resume now uses SDK
  `startup()` and its awaited async disposer, tracks this run's SessionStart
  path, and explicitly removes that copy before releasing the host lease.
  See the crash recovery checkpoint below for subsequent ownership/purge proof.
- Web/iOS text Chat host paths are being wired to this store; raw-image
  persistence remains unadmitted until full media lineage/cleanup proof. No
  deployed provider selection changed. Product-level rollback and independent
  persistence review have since passed; overall acceptance remains pending.
- `pnpm ios:check` remains running (session 56297). Three failures observed so
  far: AgentSourceImport contact-file review (line 27), authentication error text
  (line 63), and pending screenshot discard button (line 927). One AnswerFeedback
  test skipped because its owned proof server was absent. Preserve the full
  results and diagnose; do not call the suite green. Result bundles are under
  `/var/folders/qk/yyffbdsn4gz71wd9gf_3rb8r0000gn/T/talent-signal-ios-results.DYqvLK`.

### Identity, crash recovery and verification checkpoint

- Reviewer identified and closed the identity-lifecycle P1 after migration 059
  added handle/profile invalidation and every continuation capability checked
  dynamic person identity deadlines. Seven independent PostgreSQL tests passed,
  including clock expiry without a worker, rebinding purge and concurrent
  revocation before the final commit. Source deadlines only shrink.
- A successful SDK result rejected by the product no longer commits a checkpoint.
  The real product transaction regression passed. Claude failures use a local
  unavailable response; a second host-level remote fallback would bypass the
  SDK's source gate and reset its budget. Feedback receipts preserve unreported
  model identity and SDK transport counts as unknown. Combined backend focused
  result: **14/14 passed**, `/tmp/get9-session-focused.log`.
- SDK temporary workspaces now journal their owner, deadline and exact resume
  project before releasing mirrored data. Startup, per-Run admission and a
  service sweep reclaim owned crash leftovers. A live Hao probe SIGKILLed an
  isolated child after SDK resume materialization and before SessionStart:
  one Run directory and one resume directory were present, then zero remained.
  Latest probe: 24,730 ms, 274 input/5 output, SDK estimate USD 0.000598;
  `/tmp/get9-hao-crash-cleanup-probe-final.log`.
- Independent review then reproduced a partial-deletion P1: removing a project
  or owner marker before a permission error destroyed retry ownership. Resume
  roots now retain journaled device/inode identity, and the Run marker is removed
  only after all payload children. Two real permission-failure/recovery tests
  pass; focused Agent result **15/15**, `/tmp/get9-workspace-tests.log`.
  Reviewer independently passed the cleanup/continuation/authority 11 tests and
  unscoped Chat 5 tests, then closed this P1. No new P0/P1 in that slice.
- Real two-turn continuation still passes with ownership tracking: exact recall,
  16 mirrored entries and zero residual resume copies, 26,891 ms total;
  `/tmp/get9-hao-continuation-cleanup-probe.log`. Agent-wide result before the
  final permission-retry patch: **123 passed, 1 skipped**; subsequent full Agent
  rerun passed **125 with 1 skipped**. Backend build/typecheck and docs check pass.
- `project-knowledge-steward` routed the SDK/product ownership distinction,
  identity deadlines, derivative invalidation and crash recovery to the existing
  authoritative `docs/agent-system.md`, replacing the old extraction-loop claim.
  Deterministic counterexamples remain in tests; gateway values remain in this
  temporary plan and secret delivery, not foundational documentation.
- The initial iOS full suite is still running (session 56297), now with at least
  ten failures and one skipped proof-server test. Eight diagnosed test failures
  have patches for the current ephemeral backend port, renamed retention copy,
  stable seeded Session selection and native Back navigation. Contact-import
  fixture presentation now follows its actual import button after navigation.
  These fixes require a rebuilt UI rerun. Completed initial bundles are being
  preserved in `/tmp/get9-ios-initial-results`; the active runner removes its
  original temporary output when it exits. No full iOS pass is claimed.

### Live E01 checkpoint

- Added `scripts/evals/evaluate-claude-conversation.mjs`, using the actual
  workspace conversation core and shared SDK with synthetic dialogue. Each
  attempt retains prompt/configuration/usage/output and requires independent
  quality review. It is not database or client proof.
- First three trials: two deterministic envelope/tool checks passed, one failed
  after 37,023 ms. The failure is consistent with the 35-second workspace budget
  but its original generic error does not prove the cause. All three fail the
  frozen quality gate: independent completion/grounding/naturalness scores were
  3/2/3, 0/0/0 and 2/2/2. Recovery was not exercised, not awarded a fictitious
  score. Preserve [the complete first attempt](../docs/evaluations/get9-harness/e01-first-attempt.json).
- Revised the shared conversation/workspace prompts to honor a request for
  company, acknowledge only stated experience, avoid diagnosing motives/body,
  and ask at most one easy question. The budget remains unchanged. A separate
  second three-trial run is active: `/tmp/get9-e01-live-revision2.json`, log
  `/tmp/get9-e01-live-revision2.log`, session 12732. It records effective prompt
  hash and safe failure classification; first failures are not overwritten.
- The iOS initial full suite has additional canonical-path failures. Exported
  AX shows `INTERNAL_ERROR`; fixture backend logs independently show PostgreSQL
  `Query read timeout` in authGuard and Session retention sweeping. Readiness
  reports migration 057, as expected for the image built before Session work.
  Only one idle connection and no blocked SQL were visible in a later snapshot;
  sustained database contention is not established. Retain the failures and
  diagnose fixture timing before treating this as a product regression or
  increasing timeouts. Fourteen failures observed by test 084; suite still active.

Next implementation: durable sourced Memory/preference and calendar draft tools,
integrated Chrome image handoff, client profile proof, actual text streaming,
six scenarios with three live trials each, remaining review and latest-head
checks, PR/CI/merge, required TestFlight-local deploy and Linear acceptance.

### Source admission and live conversation checkpoint (21:58 local)

- Independent review identified and closed a P1 where source compilation preceded
  SDK continuation generation capture. `harnessSourceGuard.ts` now captures the
  account generation and Session context stamp before history/snapshot/image
  reads. The shared SDK checks that same admission before observation, startup,
  prompt delivery, tool use/result release and final output, with a two-second
  in-flight recheck. Host and database clocks both enforce source deadlines.
- The reviewer found an additional no-Session identity-expiry gap: observation
  ownership was incorrectly also the owner of dynamic source scope. Ephemeral
  contact reads now add people to a separate Run authority set, even when no
  observation can be retained. Actual product lookup plus clock expiry without
  a worker and shared SDK result withholding are covered. Reviewer closed both
  P1s after independent Backend **16/16** and Agent focused **9/9** checks.
  Root Agent full suite: **128 passed, 1 skipped**; backend typecheck passed.
- The third live E01 attempt passed execution checks but only 2/3 quality trials.
  The fourth passed all three measured quality dimensions in 3/3 trials, scores
  4/4/3, 4/4/3, 4/3/3 (completion/grounding/naturalness). Recovery remains
  `not_exercised`. All four attempts and independent reviews are retained under
  `docs/evaluations/get9-harness/`; no failed attempt was replaced by a rerun.
  Further shared prompt changes still need latest-release validation.
- Added `read_relationship_memory` to natural relationship Chat: it returns the
  already authorized current database snapshot with block status and evidence
  IDs, on demand, independently of Session history. Its fresh-Session unit
  passes. This does **not** complete E07: durable response preference, live
  database/client proof and repeated live-model trials remain outstanding.
- Stopped the owned initial iOS full run after 101 completed parts and an
  interrupted 102nd part (197 UI journeys in the full gate). Repeated canonical
  failures showed backend 500/Query read timeout. Completed results and bootstrap
  failures are preserved under `/tmp/get9-ios-initial-results`, full log at
  `/tmp/get9-ios-check.log`; helper processes/containers were cleaned by the
  runner. No full pass is claimed. Rebuilt focused UI checks remain necessary.
- Concurrent DB tests initially timed out at the unchanged five-second test
  boundary; retained `/tmp/get9-source-guard-backend-during-ios.log`. After
  stopping the failing iOS run, root Backend **16/16** and independent repeat
  **16/16** passed. This association is not proof of the exact infrastructure
  cause. A standalone host-to-DB probe measured 854 ms connect then 1–3 ms queries.

### Memory, preference and deployment checkpoint (22:38 local)

- Added user-owned response preference (migration 060, GET/PUT API, revision and
  idempotency checks, audit/readback, SDK invalidation on reset). Web and iOS
  expose save/reload controls. Only the configured Claude chat adapter admits
  this preference API; a legacy runtime cannot misleadingly report usage.
  Independent checks: DB 1/1, Web 3/3, chat provider 6/6. Real client proof remains.
- E07 now uses real HTTP routes, PostgreSQL, reviewed synthetic source, published
  Memory, persisted preference and three fresh empty Sessions per attempt.
  First quality scores: 2/2/2, 0/0/0, 2/2/2; second: 2/4/2, 3/4/2, 3/4/2.
  All fail at least one dimension. Third attempt has two execution passes and
  one failure; independent review pending. Preserve all artifacts under
  `docs/evaluations/get9-harness/`. Recovery remains `not_exercised`.
- A personal-note fixture variation was rejected by existing intake rules because
  it was proposed rather than explicitly reviewed on intake. No product gate was
  changed. The E07 reruns retain the original conversation source and its
  unconfirmed report status. Prompt changes answer what the record says before
  explaining uncertainty; they do not promote reports to confirmed facts.
- Deployment validation now imports the same configuration-only TypeScript
  authority directly using the repository's Node >=22.19 runtime. TestFlight
  API and person-research containers, and optional production API configuration,
  carry endpoint-bound Claude settings. Hao key is declared in Infisical's
  canonical shared manifest. Staging selection/key import and deployment remain
  pending; no production provider switch has occurred. Deployment/manifest 10/10.
- The artifact adapter now binds configuration at construction from the supplied
  environment; later ambient changes cannot redirect its credential. Original
  images are admitted only by an explicit vision capability. Agent-host uses the
  same validator and rejects ambient OAuth/another gateway's key. Independent
  configuration review found no P0/P1; final image test and typecheck pass.
- SDK interruptions retain unique observed token counts as a lower bound, use
  null for unknown cost/turns, and preserve a safe failure code. Chat Lab evidence
  reads this partial receipt. Related tests 26/26 and new interruption checks
  7/7. Other product aggregate usage paths still require final audit before
  claiming complete failure accounting.
- Focused iOS run (session 44416) passed Release build, completed its backend
  image build and is building Debug tests. The previous compile error used the
  iOS-17 onChange overload despite target iOS 16; corrected to the supported
  single-value overload. Do not claim UI tests have passed yet.
- E02/E04 runner and deterministic synthetic profile image added. Initial fixture
  run stopped before model work because its subject-count query referenced a
  nonexistent kind column (42703); corrected against the actual schema. Second
  run active (session 70318, /tmp/get9-profile-live-second.json/log). Current
  Docker-backed operations are slow during iOS setup; no latency cause is proven.

### Calendar and profile proof checkpoint (23:28 local)

- E07 fourth attempt passed three real HTTP/DB/SDK trials and independent quality
  review (4/4/3 each; recovery not exercised). All prior failures are retained.
- E02/E04 fourth profile attempt completed all six SDK runs. Earlier attempts
  exposed two evaluator sequencing bugs (waiting on SDK/product receipt before
  submitting the current draft revision); their partial results are not quality
  passes. Independent final review lives in
  `docs/evaluations/get9-harness/e02-e04-quality-review.json`.
- E04 supplemental current HTTP Memory readback passes in all three accounts:
  original reviewed source remains active and scoped, current published Memory
  contains the commitment with its same source dependency, and the historical
  snapshot content hash is unchanged after normalizing only the legitimate
  superseded lifecycle field and using the HTTP schema serializer. A complete
  before-row snapshot was not captured in this attempt; do not claim that audit.
  E02 scores 4/4/3/not_exercised; E04 scores 4/4/3/4, with recovery covering only
  the observed CONTACT_UNDERSTANDING_REQUIRED tool rejection and correction.
- Calendar draft tool now uses host reference time, client timezone and literal
  user excerpt; typed drafts carry no execution authority. Web exports only
  title/UTC time through an explicitly downloaded ICS; native confirmation uses
  the existing EventKit service. Title/start/end are editable; original evidence
  remains separate. Web rejects DST gaps/overlaps instead of guessing an offset.
- E10 first and second attempts each had one success and two interruptions. The
  second proves WORKSPACE_CONVERSATION_TIMEOUT at the legacy 35-second outer
  deadline. SDK workspace Chat now uses the existing shared 60-second ceiling;
  legacy adapters retain 35 seconds. Native Chat POST transport now admits 120
  seconds for execution plus cleanup/persistence, while ordinary requests retain
  their previous limits. Third live attempt is running; no repeated pass yet.
- Failed unscoped requests now say they did not complete, rather than replying
  with an unrelated greeting. Backend focused checks 33/33, Web Calendar 3/3 and
  Web typecheck pass. Backend build passes.
- A real Simulator Calendar proof passed using the first E10 attempt's successful
  draft and the production confirmation button/service: independent EventKit
  readback matches title, timezone and 15:00–15:30; count=1; only the owned local
  synthetic calendar was removed and cleanup verified. Artifact:
  `docs/evaluations/get9-harness/e10-native-first-proof.json`. This is component
  projection proof, not a full live Chat UI journey. First native attempt failed
  to handle the OS permission prompt; corrected test passed 6 native unit checks
  plus the real UI proof. Latest receipt/edit changes still need rerun.
- Independent review found and closed duplicate-write-after-unknown and false
  product-save text paths. The native gate now claims an exclusive durable file
  before EventKit; unknown/pending survives reconstruction and does not retry a
  create. Actual successful event payload is now persisted atomically and used
  by saved UI; legacy receipts without payload do not invent title/time. Final
  reviewer closure and latest native tests pending.
- Focused earlier native checks also passed contact-file import, welcome swipe,
  Session menu parity and exact Session delete confirmation. The initial full
  iOS suite remains incomplete; do not claim all iOS gates passed.
- Still outstanding: E05 live autonomous public research, integrated Chrome
  original-image handoff (current legacy path is synthetic/selected-text only),
  full profile/preference/client proof, final prompt reruns and failure usage
  audit, final independent review/CI/PR/merge, staging configuration and required
  local TestFlight deployment. No commit, PR, merge or Linear closure yet.

### Chrome and research checkpoint (2026-09-10 00:00 local)

- Native Calendar fourth verification passed 6 unit tests and the real EventKit
  UI proof after the latest durable receipt changes. Clean before-confirmation
  and independent-readback PNGs are retained with `e10-native-latest-proof.json`.
  This remains one model draft/component proof, not three complete E10 journeys.
- Chrome now explicitly hands reviewed image bytes to the shared screenshot
  task via a same-origin Web tab. Credentials stay in Web. An opaque HMAC binds
  the exact reviewed account/user/token/expiry; POST and readback recheck it
  against the same claims used for upstream authorization. Changed-account and
  same-user-new-login regressions pass 3/3. Old async receipts cannot overwrite
  a new review generation. Cancel/reset discards the retained retry envelope.
  Independent review closed the P1 and two P2 findings. Extension tests 40/40.
- Browser source title and locator are retained with the task; query/fragment
  and credential-bearing URLs are excluded, and saved resources carry the
  browser_extension channel and source locator. This addition still needs
  independent review and database provenance proof.
- E05 second attempt retained as `e05-second-attempt.json`: all three failed
  under the 80k aggregate token limit, despite useful internal filing/search.
  The first used 89,360 input tokens across seven responses before fetch. Fixed
  current-state feedback and preloaded tools reduce dead ends. Budget is now
  240k aggregate tokens, retaining 18 turns/24 calls/300 seconds/$2; third attempt
  is running. No previous failure has been reclassified. Controlled source pages
  are synthetic and do not claim real Exa responses.
- A separate live Exa staging search and fetch passed against public Anthropic
  documentation with vendor request IDs (`exa-staging-live-probe.json`). Dev
  shared and agent-host scopes have no Exa key. No secret values were exported.
- Harness now supports actual provisional main-session SDK text deltas through
  onText, checking source authority before each callback and excluding tool JSON,
  subagents and structured output. Independent 10/10 tests and review pass.
  Official source: https://code.claude.com/docs/en/agent-sdk/streaming-output .
  Client consumption of these deltas remains outstanding.
- Screenshot DB suite: 8 passed, 5 default-5-second timeouts plus shutdown hook
  timeout. Inspection showed idle ClientRead connections, not proven SQL locks;
  local Docker transport remains variable. Do not call this a product pass.
- Real Web proof uses only the owned synthetic DB and localhost Web 3344/API
  3345. Synthetic account registration succeeded; preference save is in flight.
  The new services must be stopped after proof. Existing other-task services and
  user tabs were left unchanged. No commit/PR/merge/deployment/Linear closure yet.

### Isolated database recovery (2026-09-10 00:14 local)

- Docker queries reached 77 seconds and login 57 seconds with only a 20 MB
  synthetic DB (29 accounts/122 screenshot tasks at inspection); no SQL lock
  cause was established. Downloaded Postgres.app 2.9.6 / PostgreSQL 18.6 from
  its official release, verified disk image and strict code signature, and ran
  only its CLI binaries from `/tmp/get9-postgres-mount`. No system installation.
  Source: https://postgresapp.com/downloads.html .
- Owned native instance: 127.0.0.1:32774, database/user get9_eval; data directory
  `/tmp/get9-native-pgdata`, server log `/tmp/get9-native-postgres.log`. Both host
  and local socket require SCRAM; max connections 40/shared buffers 32 MB.
  Restored only the owned synthetic Docker dump, leaving the original intact.
  Stop this instance with its pg_ctl and detach the image after acceptance.
- On native PostgreSQL, the same screenshot authority suite passes **13/13 in
  1.38 seconds**, including new persisted browser_source, changed-locator
  idempotency rejection, and exact chat/profile source channel/locator readback.
  Web/API proof now points to native DB; current API PID 87856, port 3345.
- Browser localhost cookies conflicted with parallel local app sessions. Moved
  GET-9 proof to http://127.0.0.1:3344 and signed into the same synthetic account.
  Preference save/re-read passed; unstyled form discovered through screenshot,
  corrected with shared scoped CSS and checked in light/dark themes. This is a
  small restoration of expected product styling, not a new design direction.
- Browser policy explicitly rejected chrome://extensions and forbids alternate
  workarounds. User input is pending to manually load the built unpacked bundle.
  No further extension-install attempt may bypass that policy.
- E10 sixth (native DB) and E05 fourth (native DB, 240k aggregate token budget,
  clearer exact-quote recovery instructions) are running. E05 third on Docker
  remains in flight; its first trial fetched/cited current and historical pages
  but incorrectly concatenated message quotes in finish; rejected correctly.
  Earlier failures remain failures. Person artifact output-schema regression
  now passes with the exact tool-returned person_research_artifact fingerprint.

- Native Session/source/preference checks also pass 12/12 (5.83 seconds). E05
  fourth first two trials pass all execution checks (~120/117 seconds); final
  trial and independent quality scoring pending.
- A new retry bug was identified: SDK failure fallback was committed as a 201
  idempotent answer, trapping client Retry on the cached failure. SDK product
  route now returns typed 503 and rolls back the failed intent; only a successful
  answer is cached. It does not retry automatically. Real DB regression passed:
  failure -> same-key explicit retry -> exact successful replay, two provider
  calls total. Independent review and live recovery trials still pending.
- Calendar evaluator now records at most one explicit simulated-user same-key
  Retry after that typed 503, preserving every failed attempt and its usage.
  This is a revised recovery scenario and cannot retroactively turn previous
  failed attempts into passes.
- Chrome upload also lacks the ChatGPT extension's file-URL permission; user was
  given the documented enablement steps. No file-upload success is claimed.
  A synthetic task created through the existing authenticated API is being used
  only to validate Web profile review. Task 11bd937b-cb3b-4913-b387-678efcdbd52d:
  edited company to LatticeWorks Studio while source quote stayed exactly
  "产品设计师 · LatticeWorks"; explicit UI confirmation submitted, readback pending.

### Cross-surface readback and independent quality corrections (2026-09-10)

- Real Web profile review confirmed the edited company and preserved the original
  quote, but the saved task omitted its reviewed fields. Added a separate
  `reviewed_profile` receipt snapshot on Web/iOS, labeled as this review's saved
  details rather than current canonical profile or original source text. Source
  revocation still removes it with the whole task response. New DB assertions
  read the saved value and original quote separately; 13/13 pass.
- E05 fourth independent quality: 1/3 passes. Trials 2/3 incorrectly attributed
  the owner's acknowledgment to the contact; trial 3 stored literal backslash-n.
  Added speaker-label verification to the SDK Skill and the existing candidate
  analysis skill; finish now rejects escaped newline text with a recovery hint.
  Fifth full live attempt is in flight. Do not call execution checks a quality pass.
- E10 seventh preserved: trial 1 passes, trial 2 exhausts one explicit retry,
  trial 3 incorrectly follows ambient SDK date. Calendar capability now explicitly
  supplies the server reference local date and its precedence over environment
  dates. Chat uses measured `medium` effort; continuation fingerprints include
  effort. Reference: https://platform.claude.com/docs/en/build-with-claude/effort .
  E10 eighth: all three draft checks pass; independent quality and corresponding
  three native confirmations remain pending. E01 sixth at medium: 2/3 pass,
  one timeout; no reliability claim or release approval follows from that result.
- Aggregate Agent artifact usage is now nullable when no provider receipt exists;
  public, person and pursuit runners no longer represent failure as free usage.
  Contracts updated; 36 targeted tests, Agent/host checks and Web types pass.
- Full backend first run: 471/472 pass, one old fallback expectation corrected.
  Isolated retry/Session test accounts avoid intentional generation invalidations
  racing across suites. Full second run during Xcode recompilation had resource
  and connection timeouts and is not a pass; rerun with two workers separately.
- Full iOS check is running with its machine-wide lock. TikHub credential probe
  was blocked by Infisical transport EOF before any TikHub request; retry pending.
  No commit, PR, merge, deployment, or issue closure has occurred.

### Live product entry-point verification (2026-09-10, 01:29 local)

- Backend rerun with two workers passes 55 files / 472 tests. Web prior suite
  passes 366 tests (one skipped); eval CI and secret contract checks pass.
  Full iOS Release build and 539 unit tests pass; the complete UI suite remains
  in progress with its owned Simulator/lock. No full iOS pass is claimed yet.
- TikHub staging credential and health checks pass; no live profile retrieval
  was exercised. Exa live search/fetch proof remains separate from E05's
  controlled fictional public-page responses.
- E01 seventh independent quality passes 3/3. E10 eighth exact live drafts now
  each have matching production-component confirmation and independent EventKit
  readback/cleanup. Combined independent review passes 3/3 within that composed
  boundary. It does not prove a full live Chat-to-device journey or manual human
  action, and the failed first SDK attempt in trial 2 remains retained.
- E05 seventh completes all SDK runs but passes quality only 1/3: two profile
  fields had incomplete citation coverage or contained excluded namesake details.
  Eighth fixes those completed-output findings (trials 2/3 quality 4/4/3/4), but
  trial 1 exhausts its unchanged token budget after separate per-field updates.
  Added a tool instruction to batch independently cited fields; no gate or
  budget was relaxed. Ninth live trial group has not started yet.
- Real Web profile review proves `LatticeWorks Studio` saved separately from
  the original `产品设计师 · LatticeWorks` source quote. Evidence is in
  `web-profile-reviewed-readback.json`; the task was API-created, not uploaded
  through Chrome. Extension installation/upload permissions remain pending.
- Real Web homepage inspection exposed a missed adapter: the unscoped input
  still rejected ordinary conversation. Added authenticated `/api/workspace-chat`,
  canonical Session task-reference persistence, same-intent retry, account/scope
  cancellation, natural response and editable calendar rendering. Empty accounts
  now retain their account identity when no default fixture capture exists.
  Fifteen targeted Web tests pass; real Web request and independent review pending.
- Scoped chat's remaining audit usage fallback now records null, not zero, and
  SDK timing explicitly means first completed assistant content-block receipt,
  not TTFB or whole-response completion. Independent reviewer closed both P2s.
- Predeploy host audit passes: existing Talent Signal Serve root targets loopback
  4317; `/ops-health` and HTTPS 8443 belong to other services and must be preserved.
  No staging provider cutover, commit, PR, merge, or deployment has happened.

### 2026-09-10 02:05 — Web account boundary and latest evaluation

- Added initiating-login HMAC checks to unscoped chat and preference GET/PUT,
  including save readback. Clients carry a non-authoritative binding; routes
  construct the backend client from the same verified claims. Independent
  review closed the chat P1 and found no preference P0/P1. Actual two-account
  browser journeys rejected stale requests before backend/SDK access; owned
  PostgreSQL readback preserved both preferences. Evidence: `web-stale-login-proof.json`
  and `web-preference-login-proof.json` in the GET-9 evaluation directory.
- Web full suite passed 387 tests with one existing skip. The subsequent
  preference boundary tests passed 10/10; TypeScript, lint and docs checks pass.
  Responsive empty workspace was inspected at 390x844 and viewport reset;
  latest responsive completed calendar and scope-return journeys remain pending.
- E02/E04 fifth medium-effort live run passed all six execution/readback checks;
  independent quality scoring is active. E05 ninth passed execution 3/3 but
  independent quality only 2/3: trial 2 mentioned m3 while citing m1/m2 and used
  an ambiguous speaker. Corrected misleading tool-description message examples
  to actual IDs, explicit speakers, and omission of immaterial exchange findings.
  Tenth run is active; ninth and all prior failed groups remain retained.
- iOS Release build and 539 unit tests passed. Full UI suite is still running
  with two observed failures: RTL Session-to-People paging at line 1400 and
  Session-open p95 3562.46ms against the existing 1200ms gate. Persistent original
  xcresult copies are `/tmp/get9-ios-rtl-failure.xcresult` and
  `/tmp/get9-ios-latency-failure.xcresult`; latency attachment is retained as
  `ios-full-first-latency-failure.json`. Do not classify as infrastructure or
  relax gates without isolated evidence. No Swift edits during this full run.
- Remote main advanced to `e9bbaa5b` (GET-25). Integration, latest-head review,
  production build/CI, provider cutover/deployment, PR merge and issue closure
  remain outstanding. Chrome manual unpacked-extension load remains pending
  user action due to browser URL security policy; no bypass is authorized.
