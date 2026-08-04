# Review standard

Review the outcome, not just the diff. A change is acceptable when it improves
the intended user loop while preserving truth, control, and recoverability.

## Product loop

- Does the change help the recruiter understand what changed and what deserves
  attention now?
- Is the smallest useful next step visible without creating extra
  administration?
- Can the user inspect, correct, decline, and recover?
- Does the ordinary path remain calm and lightweight?

## Evidence and safety

- Can every consequential claim be traced to authorized evidence?
- Are observation, confirmation, interpretation, action, and outcome distinct?
- Are identity, speaker, time, and assignment ambiguity represented honestly?
- Can any path write externally without exact-effect approval?
- Can any partial or unknown result be misreported as success?
- Do retention and deletion propagate to derived material?
- Does the change avoid judging personal worth or inferring prohibited traits?

## System integrity

- Is canonical state owned by the domain rather than a model, channel, wiki, or
  connector?
- Are generated views rebuildable?
- Are retries, duplicates, stale decisions, and conflicts safe?
- Does the design preserve a provider-neutral boundary?
- Has accidental complexity been deferred until evidence justifies it?

## Evidence of completion

Prefer direct evidence:

- behavior observed on the relevant user surface;
- deterministic checks and focused tests;
- before-and-after state or rendered artifacts;
- destination readback for external effects;
- a clean diff with unrelated work preserved.

If the result cannot be directly verified, state what remains uncertain and
why.
