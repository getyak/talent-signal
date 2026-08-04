# Proposal-only input and output contract

## Input

Provide one JSON object:

```json
{
  "authorization": {
    "kind": "synthetic",
    "purpose": "Evaluate a supplied candidate-momentum fixture."
  },
  "case_id": "optional-stable-id",
  "context": {
    "captured_at": "2026-08-03T10:00:00+08:00",
    "source_timezone": "Asia/Singapore",
    "candidate": "Alex Chen",
    "assignment": "Staff Product Designer"
  },
  "messages": [
    {
      "id": "m1",
      "speaker": "candidate",
      "text": "Exact supplied message text."
    }
  ]
}
```

`authorization.kind` must be `synthetic` or `user_authorized`.
`authorization.purpose` must describe the current bounded use. Messages need
unique non-empty IDs, a speaker label, and exact text. Missing context stays
missing.

## Output

The analyzer returns one JSON object with these independent layers:

- `source`: authorization and source scope; never interpreted truth.
- `evidence`: exact quotes with message ID and speaker.
- `proposed_temporal_state`: typed proposals with evidence and temporal scope;
  every item requires confirmation.
- `ambiguities`: unresolved identity, speaker, time, or scope that changes
  behavior.
- `action_proposal`: at most one recruiter-owned `prepare_question` artifact
  with no execution authority.
- `no_action`: present exactly when `action_proposal` is null.
- `outcome_handoff`: truthful current result. It always reports
  `confirmed_state_changed: false` and `external_effect: not_attempted`.

`disposition` is exactly one of `propose_action`, `no_action`, `clarify`, or
`block`. State status is `proposed`, `ambiguous`, or `superseded`; never
`confirmed`.

Every `evidence_quote` must be an exact substring of its cited message.
Every material action must cite existing message IDs. Generated content is not
confirmation, consent, or execution authority.

## Consequence boundary

The plugin has no generic browser, contact, calendar, ATS, messaging, or
production-database capability. An action proposal previews only a question
artifact for the recruiter to consider. Any later external effect requires a
separate product surface, exact current preview, independent human approval,
and destination verification; none of those are supplied by this plugin.
