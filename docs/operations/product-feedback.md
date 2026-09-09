# Product runs and feedback

The Web workspace's **Run feedback** navigation opens `/workspace/monitor`.
Signed-in owners can inspect Web and iOS runs from the same account identity.
New requests are captured before execution, without requiring a rating. This
starts at deployment; historical answers without captured executions are not
backfilled or invented.

## User flow

- Thumbs up/down saves immediately. Reasons, a comment, selected passage (Web),
  and a correction are optional. Tapping the selected thumb withdraws it.
- Controls show the saved server state. Failed submissions retain their exact
  idempotency key; conflicting edits retain the intended rating but ask the user
  to review the current answer before retrying against its new version.
- The monitor separates helpful, unhelpful, and unrated runs, with platform,
  outcome, question search, paginated history, answer previews, original input,
  context/model calls, tool calls, and versioned feedback history.
- A changed screenshot answer has no inherited rating. Each historical feedback
  event retains the answer version it described.
- Web follow-ups pass the preceding task ID. The backend retrieves that owner's
  original question and answer in the same relationship using its bounded
  conversation-history policy; the composer contains only the user's request.

## Evaluation use

The detail pane exports the captured execution for review. Relationship text
runs with intact captured model inputs can also become development cases in the
existing Lab regression library. A reviewer writes an expected behavior, then
compares two admitted model/prompt configurations in Lab. The actual original
input is frozen; a thumb or correction is never silently treated as a gold
answer, a semantic pass, or proof of improvement. Unrated cases can be saved too.

Screenshot and person-research details can be inspected/exported, but their
end-to-end automatic replay is not implemented by this adapter. The UI names
that limitation explicitly. Existing Opik trace/experiment integration remains
available through its configured runtime policy; this local monitor does not
require Opik to capture admitted product requests.

`apps/eval-runner/src/promptfooProvider.ts` implements Promptfoo's JavaScript
provider interface and delegates to the existing Lab job service. Configure two
provider entries with `configurationIndex` 0 and 1, the same `backendURL`,
`runKey`, and two `configurations` (`model`, `prompt_preset`). Pass a JSON prompt
containing the saved regression's `id` and `content_hash`. Supply the signed-in
backend token transiently through `TALENT_SIGNAL_EVAL_TOKEN`.

Use `evaluateOptions.maxConcurrency: 1` and disable Promptfoo response caching
for fresh comparisons. Both provider entries reuse the same persisted Lab job;
reuse a `runKey` for a retry and choose a new one for a new experiment. The
adapter also waits within a bounded deadline if another Lab experiment owns the
account. Provider errors remain errors, not evaluable answers. The returned
metadata names the case input hash, attempt, actual model/prompt and existing
hard checks; semantic assertions remain independently defined by the reviewer.

## Runtime and lifecycle

Migration `058_product_run_monitor` is required by readiness. Capture covers
admitted relationship Chat, unscoped Chat, screenshot tasks and person research.
Request-local context keeps concurrent runs separate; queued span writes avoid
waiting for a second database connection inside a product transaction.
Screenshot resumes restore capture from the persisted task-to-run association.
Model and tool bodies have explicit content-size states; unrecorded details
must not be interpreted as evidence that no operation occurred.

Original content follows the existing canonical session, screenshot, source and
retention predicates, with a seven-day maximum here. Expired/withdrawn content
is hidden immediately; background cleanup removes payloads while retaining
run metadata and feedback counts. Regression and descendant rerun access follows
the same source availability. This preserves source/version meaning without
introducing another approval step.

## Verification

See [GET-23 delivery evidence](../evaluations/2026-09-09-get-23/plan.md). Focused
PostgreSQL tests run through `PRODUCT_RUN_TEST_DATABASE_URL` in an explicitly
owned `get23_proof` or CI `lab_regression_ci` database. Existing feedback tests
exercise a captured unrated product run through actual Lab admission and rerun.
Native tests cover conflict intent, response loss, note restoration and
withdrawal. UI evidence distinguishes genuine client/server interaction with a
controlled provider from a live external model execution.

API references: [Fastify hooks](https://fastify.dev/docs/latest/Reference/Hooks/),
[Node AsyncLocalStorage](https://nodejs.org/api/async_context.html),
[Promptfoo JavaScript provider](https://www.promptfoo.dev/docs/providers/custom-api/).
