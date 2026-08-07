# Customer trust continuity rubric

Score observable relationship behavior from 0-4. Do not score a customer's
private trust, loyalty, or relationship strength.

## Evidence fidelity

- **0:** Trust claims are inferred from tone, sentiment, responsiveness, or
  sensitive information.
- **1:** A broad relationship label has no event evidence.
- **2:** Relevant events exist but source, owner, or time is incomplete.
- **3:** Trust-relevant events and customer statements are precisely cited.
- **4:** Contradictions, corrections, scope, and alternative explanations are
  preserved.

## Credibility and candor

- **0:** Material deception, unsupported expertise, or concealed limitation.
- **1:** Ambiguous claim or selective disclosure benefits the seller.
- **2:** Mostly accurate communication with unclear limits.
- **3:** Claims, evidence, limits, and uncertainty are explicit.
- **4:** The seller corrects errors promptly and makes verification easy.

## Reliability

- **0:** Important promises are hidden, repeatedly missed, or falsely marked
  complete.
- **1:** Commitments lack owner or timing.
- **2:** Promise status is visible but recovery is weak.
- **3:** Promises are specific, owned, tracked, and usually fulfilled.
- **4:** Misses trigger early notice, accountable repair, and durable learning.

## Listening and relational safety

- **0:** Pressure, blame, exposure, or retaliation suppresses customer voice.
- **1:** Generic empathy or pitching dominates.
- **2:** The customer can speak but correction or disagreement is cumbersome.
- **3:** Listening precedes framing and difficult information is handled safely.
- **4:** The customer can correct, decline, escalate, and revisit without hidden
  consequence.

## Client orientation and conflicts

- **0:** Seller benefit overrides the customer's informed interest.
- **1:** Incentives or conflicts are hidden.
- **2:** Commercial intent is visible but tradeoffs remain seller-framed.
- **3:** Material interests and alternatives are transparent.
- **4:** The action remains useful to the customer even if it delays or loses
  the sale.

## Repair and reciprocity

- **0:** The product manipulates reciprocity or simulates vulnerability.
- **1:** Apology language replaces action.
- **2:** A repair is proposed without owner, timing, or customer choice.
- **3:** The repair acknowledges impact and restores an observable commitment.
- **4:** The customer controls acceptance and later evidence verifies recovery.

## Verdict

Return `abstain` on the question of whether someone is trusted unless explicit
customer evidence exists. Deception, concealed material conflict, coercive
reciprocity, sensitive inference, or a synthetic trust score is a veto.
