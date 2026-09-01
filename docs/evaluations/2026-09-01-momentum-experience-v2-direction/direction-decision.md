# MX-01 direction decision

## Selected: Direction 2 — Decision Lens

The product owner selected Direction 2 on 2026-09-01 after reviewing both
source renders. Direction 2 makes the fact decision a temporary, source-local
focus layer and preserves a structural break before exact-effect approval.

The selected implementation uses one information order across Today, Session,
Person, and Pursuit:

`identity/context → change/dependency → evidence → next move → history`

It also applies the following constraints:

- no `AI INSIGHT` or internal governance language in the default attention
  layer;
- vermilion is limited to the causal seam and consequential attention;
- material cards are limited to comparison, selection, approval, and temporary
  focus;
- fact confirmation cannot authorize an action;
- executing, unknown, failed, reconciled, verified, insufficient-evidence, and
  no-action states remain visibly distinct;
- reduced motion, dark mode, AX5, long mixed-script identity, and semantic
  object parity are part of the selected source set.

## Rejected tradeoffs: Direction 1 — Causal Rail

Direction 1 has a stronger persistent visual explanation of causality. Its
continuous rail makes source → fact → next move unusually easy to scan.

It was rejected because that strength creates three costs:

1. the rail and repeated containers remain visually present after the user
   understands the relationship, producing more audit-flow weight;
2. the composition loses more vertical capacity at AX5 and under long mixed-
   script content;
3. the rail makes vermilion and approval-adjacent material too persistent,
   increasing the chance that interpretation and authority feel continuous.

The selected direction accepts a different tradeoff: temporary trays require
careful scroll anchoring, safe-area handling, and accessibility testing. The
runnable prototype and state matrix explicitly test that cost.

## Decision boundary

This selects the rendered experience direction only. It does not authorize
production implementation, external writes, retention changes, model changes,
or MX-02. Human first-use comprehension remains the MX-01 blocking gate.
