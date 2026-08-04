# Output contract

```json
{
  "facts": [{"field": "decision_deadline", "value": "2026-08-06", "evidence": "I need to decide by Wednesday", "confidence": "high"}],
  "action_cards": [{"type": "update_contact", "target": "Alex Chen", "patch": {"decision_deadline": "2026-08-06"}, "evidence": ["I need to decide by Wednesday"], "requires_confirmation": true}],
  "insight": {"verdict": "at_risk", "kind": "inference", "rationale": ["An external offer and a near-term deadline are confirmed."], "next_step": "Confirm the employer's remote-work policy before the deadline.", "timeframe": "within one business day"}
}
```

Omit unsupported fields. Use low confidence and request review when identity, date, or action intent is ambiguous.
