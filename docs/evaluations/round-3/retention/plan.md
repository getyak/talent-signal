# XS-RETENTION-01 execution plan

## Outcome and boundary

Resolve only `XS-RETENTION-01` from baseline
`a60c5aa86441ecd31110e37a73307515b0483685` by making browser-source
retention enforceable, inspectable, idempotent, account-scoped, and
fail-closed.

In scope:

- retention contracts and migrations;
- backend source-access enforcement and receipt readback;
- the localhost browser handoff adapter and receipt routes;
- browser-extension retention compatibility, copy, and tests;
- synthetic round-three retention evidence.

Out of scope:

- `XS-CAPTURE-01`, which remains active;
- frozen round-two and overnight evidence;
- iOS, Codex plugin, other Web UI, deployment, and external writes.

## Frozen before state

- Branch point: `a60c5aa86441ecd31110e37a73307515b0483685`.
- Frozen round-two receipt:
  `0c500a45-16c8-4d81-8798-15ede78e1b14`.
- Requested policy: `ephemeral`.
- Observed deadline: `retention_until=null`.
- Observed source access: available until a separate manual deletion.
- Active safety vetoes: `XS-CAPTURE-01` and `XS-RETENTION-01`.

## Safety inventory

| Asset or state | Purpose | Storage/read path | Required lifecycle control |
| --- | --- | --- | --- |
| Reviewed selected text | Compile inspectable evidence | Backend evidence item and account-scoped capture read | Purge on review completion for `ephemeral`; deadline for `evidence_crop` |
| Reviewed visible-tab pixels | Potential evidence source | Extension draft only in this slice | Reject localhost handoff because the backend cannot yet govern image assets |
| Source locator and capture ID | Receipt reconciliation | Capture metadata and receipt readback | Retain non-content lineage without widening account scope |
| Retention policy and timestamps | Explain and enforce handling | Capture lifecycle record and receipt | Return requested and effective policy, access state, and lifecycle times |
| Proposal and confirmed state | Keep interpretation and user decision distinct | Existing proposal/state tables | Never treat source purge as confirmation or action authority |
| Idempotency response | Safe retry | Account/user/operation-scoped record | Must not restore purged source content or create another capture |
| Manual deletion lineage | Explain later deletion | Existing deletion records | Preserve account scope and derivative deletion semantics |

## Supported browser handoff matrix

| Transport | `ephemeral` | `evidence_crop` | `full_source` |
| --- | --- | --- | --- |
| Selected text | Accept; purge submitted text when the analysis proposal commits | Accept; retain only final reviewed selection to an enforced deadline | Reject; a selection is not the full reviewed source |
| Visible tab | Reject | Reject | Reject |

Visible-tab handoff remains unsupported because the current localhost backend
has no governed image-asset store or image-to-evidence review path. The
extension must expose this before Submit and the Web boundary must independently
return a 4xx response.

## Milestones and proof

1. Add a forward migration and versioned contract for retention policy,
   source-access state, lifecycle timestamps, events, and receipt readback.
2. Enforce policy at capture creation, analysis review completion, due-source
   reads, and a production sweeper. Scrub idempotency replay bodies when source
   content is purged.
3. Make the browser adapter store only the reviewed selection, return the
   effective receipt, and reject unsupported combinations.
4. Make the extension default to `evidence_crop`, block unsupported
   combinations, and explain that `ephemeral` cannot continue Web source
   review after receipt.
5. Run focused contracts/backend/Web/extension checks, backend CI, both
   extension package suites, build/validation, core evaluation, and docs check.
6. Use an isolated Docker project plus authenticated localhost Web APIs to
   verify accepted modes, rejection, retry, cross-account isolation,
   automatic purge, readback, and lineage.
7. Re-run the evidence-safety rubric against the frozen after artifact. Apply
   no more than three evidence-driven corrections, then commit implementation
   and evidence without push, PR, deploy, or external writes.

## Completion evidence

The round is complete only if:

- every accepted policy reports requested and effective behavior;
- `ephemeral` source text is unreadable after the backend review-completion
  event without a second human delete;
- `evidence_crop` exposes an enforceable deadline and contains only the final
  reviewed selection;
- unsupported transport/policy pairs fail before Submit and again at the Web
  API boundary;
- duplicate and retry cannot restore purged content or create another capture;
- cross-account receipt and lifecycle access fail closed;
- deletion lineage, purpose, provenance, proposal state, confirmation,
  authority, and observed outcome remain distinct;
- `XS-RETENTION-01` has direct executable proof and `XS-CAPTURE-01` remains
  active.
