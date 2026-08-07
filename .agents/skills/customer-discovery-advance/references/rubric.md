# Customer discovery advance rubric

Score each applicable criterion from 0-4. Use `null` when the conversation or
customer-specific evidence is unavailable.

## Situation economy

- **0:** The seller interrogates, assumes, or ignores material context.
- **1:** Generic discovery repeats readily available facts.
- **2:** Relevant context is present but priorities or scope are incomplete.
- **3:** Situation evidence is concise, current, and tied to the decision.
- **4:** Preparation removes low-value questions and exposes changed context.

## Problem evidence

- **0:** A problem is invented or imposed.
- **1:** Product capability is mislabeled as customer pain.
- **2:** The customer names dissatisfaction without scope or context.
- **3:** A concrete problem is stated by the customer and precisely sourced.
- **4:** Multiple examples, boundaries, and counterevidence clarify the problem.

## Implication development

- **0:** Fear or urgency is manufactured.
- **1:** Generic cost language amplifies a weak problem.
- **2:** A plausible consequence appears but remains seller-authored.
- **3:** The customer confirms material downstream effects.
- **4:** Effects, dependencies, timing, and alternatives are explored without
  pressure.

## Need-payoff and explicit need

- **0:** Interest or politeness is misreported as buying intent.
- **1:** Seller benefits dominate.
- **2:** Customer value is present but not connected to an explicit need.
- **3:** The customer articulates the value of resolution and a relevant need.
- **4:** Priority, tradeoffs, conditions, and disconfirming evidence are clear.

## Solution timing and fit

- **0:** Premature or deceptive prescription.
- **1:** Generic pitch follows shallow discovery.
- **2:** Some claimed benefits match the problem.
- **3:** The solution is introduced after need development and tied to evidence.
- **4:** Limits, alternatives, proof, and customer correction remain visible.

## Meeting outcome

- **0:** Seller activity or CRM movement is falsely labeled customer progress.
- **1:** A vague continuation is celebrated as success.
- **2:** A customer step exists but its meaning or ownership is unclear.
- **3:** A new, meaningful customer commitment qualifies as an Advance.
- **4:** The commitment resolves a material uncertainty and has an observable
  completion condition.

## Verdict

Return `abstain` when no conversation or precise exchange evidence exists.
Invented explicit need, coercive implication, seller-only Advance, or an
unsupported close-probability score is a veto.
