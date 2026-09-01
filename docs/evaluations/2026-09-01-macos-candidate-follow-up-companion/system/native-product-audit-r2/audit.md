# macOS Candidate Follow-up Companion — Native product audit R2

Date: 2026-09-01

## Audit scope

Combined UX and accessibility inspection of the current native macOS build:
Today retrieval, Quick Panel first value, and Relationship decision review.
All evidence is synthetic and was captured from this audit run. No external
write or candidate data was used.

User goal: resume the most important relationship change and complete one
evidence-backed next step without first navigating an internal governance
system.

Accessibility target: the task order and state must remain understandable by
keyboard and accessibility text, without color dependence, at 200 percent text,
in dark appearance, and with Reduced Motion.

## Steps and findings

1. **Today before — needs structural change.**
   [`01-today.png`](01-today.png) showed three equally raised, vermilion-edged
   canonical cards before the conversation the recruiter had just reviewed.
   The current follow-up fell below the first viewport. Every item contained
   the right fields, but equal visual weight obscured which task to continue.
2. **Quick Panel first value — healthy.**
   [`02-quick-first-value.png`](02-quick-first-value.png) kept change, exact
   evidence, one unresolved dependency, one next step, and three bounded
   actions in the first viewport. Evidence preceded interpretation, the
   primary action was clear, and no identity or system-write gate interrupted
   first value.
3. **Relationship decision — healthy with dense fixture copy.**
   [`03-relationship-decision.png`](03-relationship-decision.png) used card
   materiality for one genuinely approvable change, kept exact evidence beside
   the before/proposed state, and placed the decision controls after that
   context. Synthetic expiry/revision language remains visually dense but is
   fixture-only and not the default entry surface.
4. **Today after, current conversation — healthy.**
   [`04-today-after.png`](04-today-after.png) promoted the active conversation
   to the only raised vermilion lead. Broader relationship work became neutral
   continuation rows inside one surface, while preserving unresolved, owner,
   due, next move, evidence state, and open action for every item.
5. **Today after, dark + 200 percent + Reduced Motion — healthy with expected
   vertical scroll.** [`05-today-dark-200.png`](05-today-dark-200.png) retained
   the same reading order and visible primary action without horizontal
   clipping. Lower fields continue vertically rather than shrinking.
6. **Today after, no current conversation — healthy.**
   [`06-today-canonical-only.png`](06-today-canonical-only.png) promoted the
   highest-ranked canonical item to the single raised lead and kept the
   remaining work as neutral continuation rows. No-action Pursuits remained a
   count rather than invented work.
7. **TextEdit selection Service — unavailable on this host.** The current
   TextEdit `Services` accessibility tree did not list `Review Selection with
   Talent Signal`, so no invocation was attempted and no macOS setting was
   changed. The capture tool did not provide a screenshot while the native menu
   was open; the exact menu tree was inspected live and this remains a named
   verification blocker rather than a claimed pass.

## Highest-impact correction

Today now assigns scarce visual weight to one attention item. The active local
conversation leads when it exists; otherwise the highest-ranked canonical
relationship item leads. Secondary items preserve semantic parity without
repeating shadows, vermilion borders, and full-size calls to action. Internal
language was also reduced from `Canonical relationship attention` to
`Relationship follow-ups`.

## Confirmed strengths

- Today, Quick Panel, and Relationship answer different user questions without
  becoming competing records.
- Work attention is ranked; people are not scored or visually ranked.
- Evidence availability has text and icon meaning in addition to color.
- The Quick Panel retains one-click evidence and control at consequence.
- Relationship review keeps evidence, interpretation, decision, and external
  effect authority distinct.

## Evidence limits

Screenshots and the accessibility tree do not prove VoiceOver phrasing quality,
contrast ratios, pointer target measurements, or authorized live-data
usefulness. XCTest UI execution, VoiceOver observation, a live multi-Pursuit
Today readback, an installed/enabled TextEdit Service invocation, and recruiter
field trials remain separate evidence.
