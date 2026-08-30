# Agentic screenshot-to-contact E2E result

## Decision

**Release gate: BLOCK.** The current authenticated Web flow can complete from a
synthetic screenshot through reviewed contact and Wiki readback, but the person
picker can present indistinguishable duplicate identities. A human click is not
meaningful authorization when the recruiter cannot tell which subject will
receive the sensitive evidence.

## Exercised chain

1. Logged into the local authenticated workspace and opened an existing person.
2. Imported the repository-owned synthetic LINE screenshot as candidate-owned.
3. Exercised crop/mask affordances locally; the committed run used zero masks.
4. Observed disabled-provider and timeout states fail closed with no source saved.
5. Enabled the sensitive-AI gates and mapped the existing HTTPS proxy to the
   provider-specific OpenRouter proxy variable for this process only.
6. Reviewed four extracted messages and explicitly bound the result to Leila
   Hartmann and `Chief Product Officer search`.
7. Submitted two relative-time facts as `needs clarification`; neither became
   confirmed state, and the pre-existing confirmed availability remained intact.
8. Verified `no evidence-supported action`; no Contacts, Calendar, messaging,
   ATS, CRM, or other external write was executed.
9. Compiled the relationship Wiki through the assistant-field workaround and
   reloaded the page. Messages, reviewed ambiguity, no-action state, and Wiki
   snapshot `ffd7e0eb` persisted.

## Findings

### Blocker — ambiguous identity binding

The picker rendered four indistinguishable Leila Hartmann options. A read-only
query found 119 active `Leila Hartmann` subject rows in the exercised local
database. The flow can therefore attach a screenshot to the wrong person while
still recording a nominal human decision.

### High — live provider configuration is not ready from the current setup

Sensitive AI gates were disabled by default. After temporary enablement, Zhipu
and OpenRouter both timed out until the existing HTTPS proxy was explicitly
mapped to `TALENT_SIGNAL_OPENROUTER_PROXY_URL`. The failure behavior was safe,
but the successful path depended on an ephemeral shell-only override.

### Medium — Compile Wiki can silently no-op

The visible `Compile Wiki` control did nothing with an empty assistant objective.
Entering a compile objective in the assistant field and submitting it produced
the expected Wiki. The direct control needs its own objective or explicit guided
recovery.

## What worked

- The model extracted the four fixture messages with correct recruiter/candidate
  attribution.
- `Wednesday` and `Tuesday at 2:00 PM` remained visibly unresolved because the
  screenshot did not anchor an absolute date and capture time was unknown.
- The system proposed no calendar action even though the candidate requested an
  invite, because exact date and timezone were not supported.
- Existing confirmed state was not overwritten by the ambiguous proposals.
- Provider timeout states stated that no source was saved and retained local
  file/crop/mask state for retry.
- The product stated that the original image remained in browser memory; the
  final retained source contains reviewed text rather than a server-stored raw
  screenshot.

## Verification

| Check | Result |
| --- | --- |
| Focused Web screenshot/controller/analysis/receipt/gold tests | 7 files, 68 tests passed |
| Focused backend identity/people/resource/source-lifecycle tests | 4 files, 15 tests passed |
| Web TypeScript check | Passed |
| Live OpenRouter gold case | Passed, 1 test, 19.32 s suite duration |
| Full browser page reload | Reviewed facts, no-action state, and Wiki persisted |
| Specialist and panel JSON contracts | Validated |

The live gold case was
`line-relative-time-and-explicit-invite-request`. Its passing assertion requires
all expected checks and a score of 100.

## Limits

This was a local synthetic-data evaluation, not a production, legal, or field
validation. Source deletion/restore and derived Wiki invalidation were not run.
The duplicate-subject cause was observed but not repaired. Existing unrelated
iOS edits were preserved, and no product code was changed by this evaluation.
