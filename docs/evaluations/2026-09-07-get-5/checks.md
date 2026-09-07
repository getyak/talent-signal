# GET-5 review checks

Twenty explicit review criteria; no defect quota. All fixture identities and conversations are synthetic. “Passed” applies to the named executable or inspectable boundary, not field reliability.

| ID | Behavior under review | Evidence and result |
| --- | --- | --- |
| G01 | Follow-up preserves Session and prior message identity | Passed: native continuity, screenshot follow-up, canonical save and receipt restoration. |
| G02 | Canonical previous turns influence the actual provider follow-up | Passed: [text trials](conversation-provider-proof.json) and [final screenshot trials](screenshot-provider-proof.v3.json); bounded unconfirmed summaries, no raw image/full OCR context. |
| G03 | Same-account device sync preserves concurrent messages | Passed: two-client native store conflict/union tests and real PostgreSQL integration; two physical phones were not exercised. |
| G04 | Other account/user/scope cannot read or extend a Session | Passed: PostgreSQL owner/account/scope admission and readback cases. |
| G05 | Pending intent and per-Session composer survive restart | Passed: native state isolation, pending-operation and actual response-loss relaunch. |
| G06 | Name plus stable clue prepares an editable contact draft | Passed: 41 native intake cases, actual provider draft trials and canonical native save. |
| G07 | Missing relationship purpose stays empty and blocks save | Passed: native missing-context draft and decline journey; actual missing-context provider trial. |
| G08 | Questions, quotations, name-only and multiple people avoid false drafts | Passed: native intake and backend agent regressions. |
| G09 | Field evidence and message ID survive editing and review | Passed: exact substring/client/backend checks; canonical native receipt retains original source. |
| G10 | Lookup is exhaustive; edit invalidates lookup; ambiguity has no preselection | Passed: focused identity tests and source review; formal save retains human confirmation. |
| G11 | Unknown save result reuses one intent and canonical receipt | Passed: [response-loss proxy](response-loss-runtime-proof.json), restart and original-operation retry; full unknown-result footer is visible and asserted in [final native proof](native-proof.v3.json). |
| G12 | Decline and expiry preserve original conversation | Passed: native state and actual ended/open-proposal and decline UI cases. |
| G13 | Screenshot results remain chronological with secondary details | Passed: completed screenshot production renderer and follow-up in the same Session, plus inspected capture. |
| G14 | Interrupted screenshot admission cannot replay as text or duplicate work | Passed: native interruption/relaunch, hash/type/order guards, admission/recovery/capacity and backend contract cases. |
| G15 | Existing Session supports native edge-back and preserves state | Passed: actual edge gesture returns to distinct original/fork rows. |
| G16 | Empty-input hold creates editable voice without sending | Passed: actual long press; transcript remains in the composer. |
| G17 | Text/IME/controls/attachments retain their own gestures | Passed: input policy, native empty tap and typed long press; physical-device dictation/IME combinations not exhaustively tested. |
| G18 | Markdown structures, safe links and accessible table/code are readable | Passed: AST tests and inspected native English light / Chinese dark AX5 with reduced motion; table stacks labeled fields, code scrolls horizontally. |
| G19 | Per-message controls retain quiet layout and 44pt targets | Passed: native controls/feedback/regenerate checks and source review; clipboard stays local with expiry. |
| G20 | Whole-Session share/fork excludes action authority and respects lifecycle | Passed: menu/fork native checks, native authority stripping and PostgreSQL deletion/source/retention cases. |

The final [evaluation report](README.md) identifies exact test bundles, revisions, panel resolutions and deployment evidence. Historical failed selectors/fixtures are preserved in the review trail and are not counted as passing runs. Simulator execution does not establish physical-device VoiceOver or TestFlight distribution.
