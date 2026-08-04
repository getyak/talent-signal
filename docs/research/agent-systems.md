# Agent systems research

> Reviewed: 2026-08-04
> Role: selective reference for Agent and Codex system decisions

## Research question

Which mechanisms from current Agent products improve Talent Signal's ability
to work safely over time, and which should remain outside the core product?

The goal is not to copy interfaces or vendor terminology. It is to identify
durable design patterns.

## Cross-system observations

| System | Mechanism | Durable lesson |
| --- | --- | --- |
| n8n | Visual workflows, reusable sub-workflows, execution history, and human review around tool use | Deterministic workflow is valuable where stages are known. Human review must surround consequential tools, not merely the final answer. |
| Cursor | Project rules, proposed memories, isolated background work, and MCP | Rules, recall, runtime isolation, and live tools are different concerns. Memory should be proposed or inspectable rather than silently becoming policy. |
| Claude Desktop | Local extensions, remote connectors, and a workflow-versus-agent distinction | Device-local resources and shared cloud state need different trust boundaries. Predictable paths should stay workflows. |
| Codex | `AGENTS.md`, Skills, MCP, Goals, worktrees, memories, and scheduled tasks | Persistent guidance, reusable method, live context, long-task state, isolation, recall, and cadence each need their own surface. |
| Manus | Plan, Branch, approved project learning, restorable context, and parallel research | Make plans reviewable, branch from immutable state, externalize large context, and convert learning into proposals. |
| OpenClaw | Channel gateway, sandboxing, skills, and session isolation | A chat channel is an adapter for capture and attention, not a production tenant boundary or system of record. |
| Durable runners | Checkpoints, interrupts, retries, replay, and waiting for external events | Long work needs explicit state and resumable decisions. Framework choice is secondary to the semantic contract. |

## Shared pattern

The strongest systems separate:

- durable instruction from current intent;
- static method from live tools;
- current context from long-term memory;
- predictable workflow from open-ended exploration;
- proposal from authority;
- runtime session from canonical state;
- model completion from verified outcome;
- parallel execution from merge responsibility.

Systems become fragile when one prompt, one chat transcript, one wiki, or one
agent session is expected to perform all these jobs.

## Synthesis for Talent Signal

### The Agent product is a control plane

The valuable Agent architecture is not a collection of personalities. It is the
governance surrounding replaceable model work:

- one authorized objective;
- the smallest relevant context;
- bounded capabilities;
- resumable state;
- review and approval;
- external observation;
- evaluation and learning.

The model can be intelligent without being authoritative.

### Continuity is externalized state

A large context window does not create durable continuity. Long work survives
when objectives, checkpoints, artifacts, decisions, and verification evidence
exist outside the conversation.

Compaction is safe only when omitted material has a restorable reference.

### Memory is plural

Source, episode, current understanding, procedure, and Agent-operating knowledge
have different authority and lifecycle. Flattening them into one memory layer
causes unsupported claims to become durable and makes deletion difficult.

### Learning should be proposed

Repeated corrections and outcomes may suggest a new rule or playbook. The
system should preserve the cases, exceptions, and next test rather than silently
changing future behavior.

This applies equally to recruiter learning and the repository's own Agent
instructions.

### Verification is the real autonomy multiplier

Agents improve when they can inspect their work, compare it with explicit
criteria, and continue until a bounded condition is met.

More permission without better verification increases risk. Better feedback
often increases useful autonomy without widening authority.

### Parallelism requires a fan-in contract

Parallel workers fit independent research units or review lenses. They do not
fit sequential truth transitions such as identity resolution, fact
confirmation, and action approval.

The parent task remains responsible for provenance, disagreement, synthesis,
and final verification.

### Automation should follow stability

First perform a workflow interactively. Then capture the method in a Skill.
Only after the method and stop condition are reliable should it become a
scheduled or proactive loop.

This prevents recurring automation from repeatedly amplifying an unclear
prompt.

## What to adopt now

- a deterministic capture-to-action workflow;
- explicit task, run, checkpoint, artifact, and proposal concepts;
- context compiled by purpose and scope;
- two independent human decisions for fact and action;
- one governed effect boundary;
- destination observation before success;
- repository-level Skills and verification standards;
- worktree isolation for independent Codex work;
- provider-neutral external Agent access.

## What to defer

- a general autonomous recruiter;
- multi-agent orchestration for the ordinary screenshot path;
- broad production browser, shell, or database tools;
- automatic outreach or stage movement;
- a shared chat gateway as the tenant boundary;
- a specialized Agent framework before durable-workflow pain is observed;
- parallel research before artifact and synthesis contracts are stable.

## Codex engineering implications

The repository should behave like an Agent-readable operating environment:

- `AGENTS.md` remains short and always relevant;
- the docs index routes tasks through progressive disclosure;
- foundational docs contain judgment, not current code detail;
- repeated methods become focused Skills;
- plans externalize long-task state;
- review standards and tests close feedback loops;
- repeated corrections become infrastructure;
- stale instructions are pruned rather than accumulated.

The workflow practices summarized by
[How Boris Uses Claude Code](https://howborisusesclaudecode.com/) reinforce
these ideas: invest in verification, write repeated corrections into durable
infrastructure, isolate concurrent work, and load context progressively. This
is a secondary synthesis site rather than vendor documentation, so individual
product claims should be checked against primary sources before adoption.

## Primary sources

- [n8n Tools Agent and human review](https://github.com/n8n-io/n8n-docs/blob/main/docs/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent/tools-agent.md)
- [Cursor memories](https://docs.cursor.com/en/context/memories)
- [Cursor background agents](https://docs.cursor.com/background-agent)
- [Claude Desktop local and remote connectors](https://support.anthropic.com/en/articles/11725091-when-to-use-desktop-and-web-connectors)
- [Anthropic: Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- [Anthropic: Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Anthropic: Agent evaluations](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [Codex best practices](https://learn.chatgpt.com/guides/best-practices)
- [Codex AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [Codex skills](https://learn.chatgpt.com/docs/build-skills)
- [Codex long-running work](https://learn.chatgpt.com/docs/long-running-work)
- [Codex worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees)
- [Codex memories](https://learn.chatgpt.com/docs/customization/memories)
- [Codex scheduled tasks](https://learn.chatgpt.com/docs/automations)
- [Manus context engineering](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus)
- [Manus approved project learning](https://manus.im/blog/manus-projects-self-updating)
- [Manus Plan Mode](https://manus.im/blog/manus-plan-mode)
- [Manus Branch](https://manus.im/blog/manus-branch)
- [Manus Wide Research](https://manus.im/blog/introducing-wide-research)
- [OpenClaw security](https://docs.openclaw.ai/gateway/security)
- [OpenClaw sandboxing](https://docs.openclaw.ai/sandboxing)
- [OpenClaw skills](https://docs.openclaw.ai/skills)
- [LangGraph persistence](https://docs.langchain.com/oss/python/langgraph/persistence)
- [LangGraph interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts)
- [Inngest wait for event](https://www.inngest.com/docs/features/inngest-functions/steps-workflows/wait-for-event)
- [Trigger.dev wait tokens](https://trigger.dev/docs/wait-for-token)
- [Temporal durable execution](https://docs.temporal.io/)

## Reconsider when

Repeat the scan when Agent runtimes materially change their authority,
checkpoint, memory, or verification models, or when Talent Signal has measured
failure modes that current abstractions do not address.
