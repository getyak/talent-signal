# Screenshot relationship eval

Deterministic boundary cases for the intentionally shared IM-screenshot
relationship assistant.

## What this is

- `inputs/frozen-cases.json` — synthetic, reusable cases. Each case has a
  visible transcript, declared expectations, one good candidate review package,
  and adversarial candidate patches that must trip a named boundary.
- `validate.mjs` — pure checker: `evaluateCase(caseDef, candidate)` for a
  candidate package, `validateFrozenCases` for set invariants, and
  `promptRequirementFailures` against the production prompt text.
- `validate.test.mjs` — executable regression (`node --test`).

Run:

```sh
node --test scripts/evals/screenshot-relationship/validate.test.mjs
node scripts/evals/screenshot-relationship/validate.mjs
```

## What this is not

- Not model-quality evidence. No model is called; the parent-run actual-model
  evaluator measures model behavior separately.
- Not a substitute for the backend production-path tests in
  `apps/backend/src/modules/workspaceConversationAgent.test.ts`, which exercise
  the real search/recall/stage gates, or for the queued-conversation card render
  test in `apps/web/components/conversation/`.

## Boundaries covered

Self vs other attribution, unknown relative time (no invented `valid_time`),
group/location as a research clue only, system fragments that are not dates,
transfer tiles that do not imply profession/closeness/completion, name-only
contact decisions that are never auto-bound, recall before stage, duplicate
re-upload suppression, image prompt injection, revoked sources, and a concise
reply instead of a generic or OCR-like recap.

All names, groups, messages, and amounts are synthetic. Do not add real user
images, names, or handles to this directory.

## Private actual-run receipt check

`node live-result.mjs /private/path/to/live-result.json` checks the actual
runner's successful tool receipt against the stored conversation proposal ID,
relative-time preservation, image locators and concise output. It rejects
claimed cards without tool calls, failed runs and incidental financial memory.
Run `node --test scripts/evals/screenshot-relationship/*.test.mjs` for both
fixture and receipt regressions. This still requires human semantic review and
browser save/reload verification; it is not a broad model-quality pass.
