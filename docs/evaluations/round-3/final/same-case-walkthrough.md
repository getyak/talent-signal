# TS-CORE-01 final cross-surface walkthrough

## Frozen source

- Fixture: `talent-signal-candidate-momentum-v1`, suite `2026-08-05.1`
- SHA-256: `b776e991861512b0de41a2c130a5f446e0f9f4aa418b26dd948d1f9468274b94`
- Synthetic message: “I have another offer and need to decide Wednesday. I can speak Tuesday afternoon, but remote matters a lot.”
- Candidate and assignment scope: Alex Chen · Staff Product Designer
- No live candidate data or external write was used.

## Boundary trace

| Surface | Evidence | Proposal | Confirmed state | Approval and authority | Outcome |
| --- | --- | --- | --- | --- | --- |
| Codex plugin | Four exact spans from `m1` | Four proposed workflow facts and one recruiter-owned `prepare_question` | `confirmed_state_changed=false` | `execution_authority=none`; no approval | `external_effect=not_attempted` |
| Browser extension package | Exact synthetic message and its source context remain visible | Proposed facts and one bounded question; never confirmed candidate state | No fact confirmation | Approval checkbox is separate; Submit remains disabled beforehand | Synthetic receipt only; no network handoff or external effect |
| Web + backend | One reviewed selected-text transcript message | Four new proposed assertions and a proposed question | Zero newly confirmed facts; historical confirmed version 114 remains separate | Latest approval and effect are both null | Same-account receipt and workspace readback; no external write |
| iOS direct Simulator | Exact `m1` evidence remains visible beside each fact | Four fact proposals and a separate local question proposal | Two confirmed, one dismissed, one edited and confirmed locally | Fact review does not authorize the separate action; “Keep as local handoff” records only a local demo result | “Local handoff is ready” and “No external changes” |

## Account-scoped receipt and readback

The authoritative persisted slice is the Web/backend handoff:

- account: `10000000-0000-4000-8000-000000000001`
- request: `round3-final-fixed2-001`
- capture and receipt: `acb23f40-ac0f-4a73-98c3-2e2821fd68b6`
- requested/effective mode: `evidence_crop`
- enforced source scope: `reviewed_selected_text`
- source state: available until `2026-09-04T01:31:57.358Z`
- duplicate result: the same capture and receipt were reused
- workspace readback: same account, same capture, exact source, four proposals, zero newly confirmed facts
- action preview digest: `5f77c5f4a8f763f5c87b22654071cfff638e8953e2e420b71c97d86211e92978`
- approval: none
- effect attempt: none

The plugin, automated extension, and direct iOS paths use the same frozen case
and preserve the same semantic boundaries, but they do not claim to share that
persisted receipt. A user Google Chrome selected-text submission must create and
read back its own matching account-scoped receipt before `XS-CAPTURE-01` can be
resolved.

## Retention truth

- A one-message reviewed selected-text request succeeds.
- Multi-message selected-text requests fail closed with
  `SOURCE_SCOPE_PAYLOAD_MISMATCH`.
- Every `reviewed_evidence_crop` request fails closed because the backend does
  not govern actual crop bytes or an image asset lifecycle.
- Ephemeral source is purged at review completion and retry does not restore it.
- Reviewed selected text is purged after its deadline while the non-source
  derived proposal remains.
- Legacy active rows migrate to `legacy_unknown`, are scrubbed, receive one
  truthful purge timestamp, and record `source_purged / legacy_unverified`.
- Legacy deleted rows retain deletion semantics.

## Remaining capture gate

Automated Chromium proves the built package behavior only. It does not prove a
user Google Chrome `chrome://extensions` load, a toolbar or selected-text
gesture, a positive temporary `activeTab` grant, a real pre-Submit network
trace, or an extension-originated same-account receipt/readback. Therefore
`XS-CAPTURE-01` remains active and the integrated release gate remains blocked.
