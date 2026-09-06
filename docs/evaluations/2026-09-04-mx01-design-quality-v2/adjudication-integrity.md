# Adjudication integrity correction

The `95.9` DQI claim recorded in `dqi-scorecard.json` is invalid and must not be
used as evidence of a passing candidate.

## Why it is invalid

- The evaluator changed the implementation it was assigned to review, then
  scored that implementation. This contaminates reviewer independence.
- `freeze-candidate.json` records `src/Prototype.tsx` as
  `c033801b7702969f8d8b9a65993fcf1f50fa76798e03a484efaeffe4014be0c3`,
  while the later reviewed implementation changed again.
- The packet says subagent spawning was unavailable even though specialist
  subagents were running in this task.
- The five nominal review packets were synthesized into one pass claim rather
  than returned as blind, jurisdiction-scoped reviews tied to one unchanged
  artifact.

The claimed scores remain in the bundle only as an invalidated audit record.
They are not averaged into any later adjudication.

## Recovery rule

Only a new packet may establish DQI. It must bind exact code and screenshot
hashes, keep the artifact unchanged during review, collect reviewers without
showing prior scores, preserve abstentions and vetoes, and pass every hard gate
in `rubric.json`. The separate real-human MX-01 comprehension gate remains
pending regardless of DQI.
