# Relationship conversation evaluation — 2026-09-24

Status: **functional paths verified; semantic quality incomplete**. Provider quota
recovered during the resumed work. This is a development evaluation, not release
acceptance or human gold. No production deployment occurred.

Delivery: [draft PR #239](https://github.com/getyak/talent-signal/pull/239).
The final full batch has **21 mechanical passes, 2 failures and 1 timeout**.
Independent AI semantic review has **14 passes, 9 failures and 1 unknown**.
These measures answer different questions; neither is human annotation.

## Dataset and projects

24 fictional mobile WeChat/WhatsApp conversations are saved in IMStage project
`prj_96018ae9a26a412c89b53a7f` and Eval Case Studio project
`23ad6d37-b09d-4280-8147-2c82cbdecb32` (Talent Signal · 关系对话评测 v1).
The twelve requested public authors are discussion subjects, never purported
private correspondents. Doubao actually generated a fictional avatar and cafe
photo; IMStage rendered the editable scenes into phone screenshots.

[Versioned PNGs and fixtures](../../scripts/evals/relationship-evaluation/fixtures/)
and [runner documentation](../../scripts/evals/relationship-evaluation/README.md)
are durable. Studio follows its existing seven-day retention. Human labels remain
pending. The standalone local review shows source images, actual replies,
mechanical verdicts and independent semantic findings separately. Each semantic
verdict is bound to the SHA256 of its original case receipt before Studio sync.

## Final selected-build batch

`full-v23` contains 24 actual Sonnet 5 attempts with real Doubao inspection and
Agent Host web research. Its harness stores artifacts through isolated adapters;
product persistence and UI acceptance are recorded separately below.

| Measure | Pass | Fail | Incomplete |
| --- | ---: | ---: | ---: |
| Mechanical contracts | 21 | 2 | 1 |
| Independent AI semantic review | 14 | 9 | 1 |

The mechanical failures are C01 (unsupported meeting origin and add-friend
initiator) and C02 (inferred gender). K04 timed out without a completed answer.
Independent review additionally found these concrete P2 discrepancies:

| Cases | Semantic discrepancy |
| --- | --- |
| C01, C02 | Unsupported meeting origin, add-friend initiator or gender. |
| C04 | Added finishing the book as a prerequisite to sharing thoughts. |
| C06 | Turned one speaker's “continue next time” into a mutual statement. |
| K02 | Offered to prepare a contact card after one had already been staged. |
| R01 | Added externally plausible author facts absent from the actually fetched pages. |
| R02 | Expanded a dated 2023 employment statement into unqualified employment duration. |
| R06 | Changed “grew up” into a birthplace claim. |
| R07 | Changed the assistant's identity uncertainty into a claim about the speaker's knowledge. |

No new P0/P1 was confirmed in the selected ID-handoff repair. K04 remains a
runtime reliability failure, not a semantic pass. The independent review is an
AI assessment with exact quotes/source hashes, not human gold.

Model: `anthropic/claude-sonnet-5`; image understanding:
`doubao-seed-2-0-lite-260215`. Source baseline: commit
`ffcb01cc076dc95e10a086e459c199541bd24edb` plus the recorded selected working diff.

- Compiled build: `40d23dba424437f13f723b0fc45571a082602eb8c236076c0a8a0a20dba6ffd2`.
- Grader: `cdd2e72ce5d707bddaa21153b4ffb817f589f6912e6ad9465b06fcab019c1f5c`.
- Runner: `1c9eaaefb032d03bcdee68a7970bb32bd9e9474778bff47c90b5586c2a07e2cd`.

The compiled fingerprint includes Agent Host. The task-owned host was restarted
from its selected build before the batch. Original 60-second model/run limits
remain. Recorded main-model estimated usage is approximately USD 1.3972 but is
incomplete and excludes Doubao/Exa; it is not a bill. Runs are immutable: targeted
passes from other builds do not replace this batch's failures.

## Implemented corrections

- A clear direct-chat header provides a name-only Add review option across
  contact, calendar, photo and research intents. Email/company and invented
  Memory notes are unnecessary. Host and model paths share refusal, identity
  and concurrent-staging gates. Groups and unclear identities fail closed;
  namesakes require human choice and new contexts remain neutral. Actual
  persisted proposal labels are returned to the model.
- Doubao inspection receives the original admitted pixels and retains model,
  request ID and image hash. The Agent reuses inspection beyond preprocessing.
  Exact consecutive OCR lines can now support a multiline calendar excerpt;
  skipped, reordered, modified or revoked text remains invalid.
- Calendar drafts preserve source clock, image lineage and review status.
  Migration 081 protects replay identity and concurrent source withdrawal.
  UI review/export is explicit; export does not insert an external event.
- Public research uses actual host search/fetch tools, bounded name-only queries,
  same-run discovered sources, explicit channel failures and a shared dispatch
  ceiling. A transient failure permits one bounded retry. Valid empty-title Exa
  results receive a URL-derived title. Every requested author requires a fetched
  source cited in the answer.
- Image-only topic discovery previously registered public authors internally
  without giving the model their opaque IDs. This made real tool calls fail
  authorization when the objective omitted names. Inspection now returns the
  current registered IDs; raw-name authorization is still rejected. The actual
  product probe below verifies this repair.
- Evaluation keeps actual tool execution, persistence, mechanical checks,
  semantic review and human decisions separate. Product probes terminate on
  failed/interrupted/paused queues and retain the failure code. Cancelled or
  failed persisted turns and mismatched images cannot count as completion. Grader regressions cover speaker
  reversal, gender, causality, time, staged labels and valid visual synonyms.

## Product-surface evidence

An isolated authenticated PostgreSQL/API/Next synthetic account was used.
Product v22 completed C02, K01, K02, I01, I02 and R07 with original PNG hashes
matching readback. The final v23 ID change was then verified on its affected
image-only research path. These observations are explicitly separate builds.

- **Contact:** the real C02 UI's “仅添加 Ava Chen” action saved a contact after
  Memory selection was unchecked. Authenticated directory readback after reload
  found Ava Chen, a neutral relationship context and zero confirmed identities;
  no email/company was required. A prior nickname-only 顾宁 save also persisted.
- **Calendar:** actual K01 UI review showed September 24, 2026, 15:00–16:00
  Asia/Shanghai. The UI-generated ICS contained `DTSTART:20260924T070000Z` and
  `DTEND:20260924T080000Z`, with the persisted draft ID as UID. No OS calendar
  import, invitation or external event insertion occurred.
- **Images:** actual photo replies described the window, green upholstered
  chair, red cup and blue book without inventing a venue. The poster produced
  the matching October 2 calendar draft. Unreadable text and injected image
  instructions did not become asserted facts or execution authority.
- **Research:** v23 Session `ee3300b2-025e-4d3c-a6b5-a60bea092930` had no author
  names in its objective. The model received current image-derived opaque IDs,
  performed two real searches and fetched Maggie Appleton's and Craig Mod's
  about pages. Original PNG hash, actual source-linked reply and the pending
  乔木 name-only contact proposal were read back. Independent review confirmed
  this functional repair but found a P2 overstatement: “originally from London”
  became “born in London.” Tool success does not prove every reply claim.

Private evidence files include `verified-product-v22.json`,
`verified-product-v23.json`, `name-only-readback-v22.json`, the actual calendar
export receipt and screenshots. They remain outside Git with provider traces.

Browser file upload was not exercised: the extension denies local file access.
Images entered through the authenticated admission API; UI verification began
from persisted sessions. No permission was bypassed. Studio's existing browser
origin denial was preserved; API readback and the standalone review were used.
Actual research acceptance used web; social-provider success is unverified.
Native iOS/macOS and production deployment are not certified by this work.

## Rejected experiment and calibration

A blocking second-model grounding checker was tried in v17–v21. Despite passing
unit tests, real outputs reversed speakers, erased valid citations, confused
zero Memory items with absence of a contact card, or timed out. Trying the Pro
model and a longer experimental envelope did not establish reliable improvement.
The experiment is archived privately and removed from the product path. There
is no hidden second-model rewrite or increased execution ceiling in v23.

The lesson is implemented in evaluation: a judge's `supported` flag, fallback
response or tool receipt is insufficient for semantic success. Immutable
mechanical verdicts are retained alongside later adjudication. All 24 independent
semantic records carry source hashes; human decisions remain pending. Earlier
v8's weak 24-pass result, v12's quota-blocked batch and later mixed experiments
are historical evidence, never pooled into a clean release claim.

## Deterministic verification and remaining work

Final selected-source checks: Agent suite **321 passed, 1 skipped**;
backend workspace/default-contact **68 passed**; evaluator/fixture integrity
**46 passed**. Agent image inspection coverage includes opaque-ID handoff and
revocation. Backend build and documentation/architecture checks passed. Earlier unchanged checks include research 27,
Claude provider 33, Agent Host 20, web review/calendar 19, calendar PostgreSQL
integration 9, selected Memory integration 5 and all 86 fresh migrations.
Skipped tests are not passes; remote CI must be read against the current PR head.

Remaining quality work is concrete: preserve speaker/source scope in replies
and staged notes, eliminate unsupported biographical enrichment, make final
card-state narration reflect actual staging, and investigate the K04 timeout.
Any subsequent repair requires a new run label and affected product acceptance.
The nine semantic failures and one incomplete case remain open. The draft PR
must not be represented as a completed release or a fully passing evaluation.

Private provider/account/database evidence lives in the task-specific local
state directory. Only its safe `preview` subdirectory may be served. Runtime
cleanup and current-head CI status are recorded in the active plan.
