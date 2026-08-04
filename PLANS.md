# Execution plans

Use an execution plan when work spans several domains, contains meaningful
unknowns, changes architecture or product behavior, or may continue across
multiple sessions.

The plan is external working state. It should let another capable agent resume
the task without reconstructing the whole conversation.

## Plan contract

A useful plan states:

- the outcome and why it matters;
- what is in and out of scope;
- the current evidence and important unknowns;
- the chosen approach and rejected alternatives;
- a small sequence of independently verifiable milestones;
- how completion will be demonstrated;
- decisions or user input that could change the direction.

Keep one milestone active at a time. Update the plan after evidence changes the
approach, not after every mechanical action.

## Long-running work

For work that may survive context compaction or a handoff:

- record durable progress in the repository, not only in chat;
- link artifacts instead of pasting large observations into the plan;
- record material deviations and the reason for them;
- distinguish completed evidence from intended next work;
- leave the worktree in a resumable state;
- pause when a missing decision would materially change the result.

Do not use a long plan to compensate for an unclear goal. Resolve the goal
first.

## Completion

A plan is complete only when:

- the requested outcome exists;
- relevant checks have passed;
- consequential boundaries have been reviewed;
- temporary artifacts are removed or clearly classified;
- durable learning has been routed to the correct knowledge surface;
- the final handoff names remaining uncertainty without presenting it as done.
