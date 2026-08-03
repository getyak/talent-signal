# Architecture decision record

Use a shared, auditable domain model behind an iOS-first client. Keep OCR, LLM, contact, and calendar integrations behind adapters.

## Architecture diagram

![Talent Signal architecture and data flywheel](talent-signal-architecture.png)

- Solid shapes and connections are the 48-hour V1.
- Dashed shapes and connections are evidence-gated follow-on work.
- The editable source is [`talent-signal-architecture.excalidraw`](talent-signal-architecture.excalidraw).

```text
apps/ios       SwiftUI client, import, card review, candidate brief
apps/web       future desktop workbench
packages/domain Candidate, Evidence, ActionCard, Insight contracts
services/api   authentication, orchestration, audit log
services/ai    OCR and structured extraction adapters
```

## Core entities

- `Candidate`: identity, stage, confirmed attributes, interaction timeline.
- `Evidence`: source, excerpt, import time, deletion state.
- `ActionCard`: type, patch, evidence, status, user edit history.
- `Insight`: verdict, rationale, confidence, recommended next action.

## Safety decisions

- Save source evidence only with explicit consent.
- Record confirmations and edits in an audit trail.
- Do not infer sensitive demographic attributes.
- Delete source evidence and derivative data together on request.
