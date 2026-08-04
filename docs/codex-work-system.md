# Codex work system

> Continuity comes from external state and verification, not from an endlessly
> growing conversation.

## Purpose

This project treats Codex as a collaborator that can improve with the
repository. The system gives each kind of context one job:

| Surface | Job |
| --- | --- |
| Current prompt | One outcome, its boundaries, and what done means |
| `AGENTS.md` | Small always-on project invariants and routing |
| Canonical docs | Stable product and architecture judgment |
| Skills | Reusable task method |
| Plan | Resumable state for one substantial outcome |
| Code and tests | Executable detail and verification |
| Memory | Helpful recall, never required authority |
| MCP or connectors | Current external context and controlled action |
| Worktree | Isolation for independent write work |
| Scheduled task | A stable method applied on a cadence |

This separation follows Codex guidance for
[repository instructions](https://learn.chatgpt.com/docs/agent-configuration/agents-md),
[skills](https://learn.chatgpt.com/docs/build-skills),
[long-running work](https://learn.chatgpt.com/docs/long-running-work),
[worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees),
[memories](https://learn.chatgpt.com/docs/customization/memories), and
[scheduled tasks](https://learn.chatgpt.com/docs/automations).

## The compounding loop

```text
define an outcome
→ retrieve only relevant context
→ expose unknowns and choose a plan
→ deliver the smallest complete slice
→ verify from the real surface
→ review with fresh judgment
→ encode repeated learning
→ prune stale context
```

The final two steps make the system compound. A correction in chat improves one
attempt. A focused Skill, test, review standard, or concise invariant improves
future attempts.

The approach is informed by the practices collected in
[How Boris Uses Claude Code](https://howborisusesclaudecode.com/): verification
loops, writing repeated corrections into durable infrastructure, progressive
disclosure, isolated parallel work, and turning stable workflows into reusable
automation. The project adopts the principles without copying
Claude-specific commands or assuming every task benefits from more agents.

## Start a task

For a small, clear task, state the outcome and let the normal agentic loop run.

For a substantial task:

1. define the outcome, boundaries, and observable completion evidence;
2. ask which unknowns could invalidate the approach;
3. read the smallest branch from `docs/README.md`;
4. create or update an execution plan;
5. choose one vertical slice that can be verified independently.

Use a goal when completion can be evaluated. Use a plan when the approach is
still uncertain. A longer prompt is not a substitute for either.

## Sustain long work

Long-running work should survive context compaction, restarts, and handoff:

- the goal stays stable unless the user changes it;
- the plan records milestones, decisions, and remaining uncertainty;
- source observations live in linked artifacts;
- the worktree contains inspectable intermediate state;
- checks provide feedback without requiring the agent to remember prior
  success;
- progress updates distinguish evidence from intention.

Pause for a decision when different answers would create meaningfully different
products. Otherwise, choose the safest reversible path and record the
deviation.

## Parallel work

Parallelism is useful when tasks are independent and their outputs can be
merged through a clear contract.

Use separate worktrees or non-overlapping scopes. Do not give several agents
write authority over the same files or the same external state. Keep the main
task responsible for synthesis and final verification.

More agents amplify both capability and ambiguity. Add parallelism only after
the task boundary and fan-in criteria are clear.

## Verification

Agent quality is bounded by the feedback it can observe.

Prefer, in order:

1. deterministic checks;
2. direct interaction with the product surface;
3. comparison with a known-good artifact or baseline;
4. an independent review against a rubric;
5. explicit user judgment where taste or strategy is irreducible.

A successful edit, model response, connector call, or build is not necessarily
a successful outcome. Verify the state that matters to the user.

When a verification step repeats, encode it in a test, script, Skill, or review
standard so future work can close the loop without additional prompting.

## Learning and memory

At the end of meaningful work, ask:

- What did the project learn?
- Is it stable or specific to this task?
- Did it reveal a repeated failure?
- Which future task should retrieve it?
- Can it be enforced instead of merely described?

Use `$project-knowledge-steward` to route the answer.

Do not treat generated memory as policy. Required guidance must remain in the
repository. Do not preserve secrets, private candidate evidence, or temporary
implementation state as general memory.

## Recurring work

Automate a workflow only after it succeeds manually and its stop condition is
clear.

A Skill defines the method. A scheduled task defines the trigger and cadence.
A worktree isolates changes. Verification defines completion. Review early
runs before increasing autonomy.

Good recurring maintenance asks whether there is important change and produces
a reviewable artifact. It does not mutate consequential external state merely
because a schedule fired.

## System health

The Codex setup is healthy when:

- `AGENTS.md` stays small and accurate;
- canonical docs remain decision-level;
- frequently repeated work has focused Skills;
- verification is executable where possible;
- inactive Skills and stale plans are removed;
- independent work uses isolation;
- memories aid recall but are not required for correctness;
- every autonomous loop has a bounded trigger, scope, stop condition, and
  review path.

The highest-leverage improvement is usually not a longer prompt. It is a better
interface, a better verifier, or one less source of ambiguity.
