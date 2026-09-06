# First-party Claude product research: transferable interaction principles

Checked: 2026-09-04

## Scope

This research asks a narrow question: which currently documented Claude product
behaviors can improve the feel and clarity of the selected MX-01 Direction 2
prototype? It does not treat Claude's visual brand as a target, copy Claude UI,
or use product marketing as proof of Talent Signal correctness.

## Source-backed findings

### 1. Keep source verification adjacent to the decision

**Direct source fact.** Anthropic describes Research answers as having
easy-to-check citations and says connected-workspace results expose inline
citations so the source can be verified.

**Supported inference for MX-01.** The exact candidate fragment and its
provenance should open in place. The user should not lose the fact or action
context while checking it.

Source: [Claude takes research to new places](https://claude.com/blog/research)

### 2. Show tool state where the user is already deciding

**Direct source fact.** Anthropic describes interactive connectors as appearing
inside the conversation so people can see what is happening and collaborate in
real time. Its Slack example distinguishes generating a draft, formatting it,
and reviewing it before posting.

**Supported inference for MX-01.** Keep exact-effect preview, execution,
unknown-result reconciliation, and receipt in one continuous decision surface.
Never collapse them into a generic success toast.

Source: [Interactive connectors inside Claude](https://claude.com/blog/interactive-tools-in-claude)

### 3. Preserve context instead of restarting at each stage

**Direct source fact.** Anthropic says Claude memory carries preferences,
projects, and working style across conversations. It also frames Claude as
staying with a user through iteration and building rather than only answering a
single question.

**Supported inference for MX-01.** A compact progress map should preserve where
the recruiter is in the source → fact → effect → outcome loop, including after
failure or an unknown result.

Source: [Claude as a thinking partner](https://claude.com/blog/your-thinking-partner)

### 4. Use the real product system and make local correction direct

**Direct source fact.** The Claude Design help guide says work can inherit an
organization's design system, begin from linked code and existing components,
and use inline comments or direct edits for targeted changes.

**Supported inference for MX-01.** Preserve Talent Signal's selected type,
spacing, icon, and evidence-state language. Fix the currently inert evidence,
dependency, and fact-edit controls inline rather than adding a new visual
language or detouring to generic settings screens.

Source: [Get started with Claude Design](https://support.claude.com/en/articles/14604416-get-started-with-claude-design)

### 5. Let a changing artifact remain one inspectable object

**Direct source fact.** Anthropic says Claude Code artifacts are built from the
full session context, update in place, retain versions, and can be restored.

**Supported inference for MX-01.** Treat the review as one evolving Session.
Use stable operation identity, explicit revision/readback, and reversible paths
instead of replacing the context with unrelated modal pages.

Source: [Claude Code artifacts](https://claude.com/blog/artifacts-in-claude-code)

## Design consequence

The useful Claude reference is behavioral, not cosmetic: adjacent provenance,
visible tool state, continuity, direct correction, and one evolving artifact.
The implementation should remain unmistakably Talent Signal—quiet editorial
type, warm neutral surfaces, vermilion only for consequential emphasis, and
human approval before every effect.

## Limits

- These sources document Anthropic product behavior and positioning, not
  controlled UX studies.
- The supported inferences above must still be validated against the frozen
  Talent Signal scenario and human comprehension test.
- No claim is made that several model reviewers are statistically independent.
