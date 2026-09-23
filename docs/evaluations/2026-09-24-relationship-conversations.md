# Relationship conversation evaluation — 2026-09-24

Status: **incomplete; live model quota blocked**. This is a development evaluation,
not release acceptance or human gold. No production deployment occurred.

Delivery: [draft PR #239](https://github.com/getyak/talent-signal/pull/239).
Initial CI identified two public-subject regex performance alerts and an
unregistered evaluation credential name. The parser now uses bounded, separate
linear steps; `IMSTAGE_MCP_TOKEN` is declared only in the evaluation secret group.
Four subject-admission tests, thirteen secret-contract tests and Agent typecheck
pass locally. Updated remote checks and final live acceptance remain required.

## Dataset and projects

24 fictional, natural mobile WeChat/WhatsApp conversations are saved in IMStage
project `prj_96018ae9a26a412c89b53a7f` and Eval Case Studio project
`23ad6d37-b09d-4280-8147-2c82cbdecb32` (Talent Signal · 关系对话评测 v1).
Studio creation and all 24 result records were confirmed by API readback.
The automated browser later received the existing local-origin access denial;
its project UI was not certified. A standalone local HTML review accompanies
the private receipts.

The twelve requested public authors appear as discussion subjects, never as
purported private correspondents. A fictional avatar and cafe photo were
actually generated with Doubao; scene rendering was performed through IMStage.

[Versioned PNGs and source-bound fixtures](../../scripts/evals/relationship-evaluation/fixtures/)
and [runner documentation](../../scripts/evals/relationship-evaluation/README.md)
are durable. Studio follows its existing seven-day retention. All human review
labels remain pending; proposed synthetic expectations are not gold labels.

## Latest complete batch

`full-v12`: 24 actual Sonnet 5 runs, including actual Doubao inspection and actual
Agent Host web research. Result: **16 mechanical passes, 3 quality failures,
5 incomplete runs**. The grader checks default Add in every direct chat, actual
inspection/source receipts, exact calendar intervals, literal Memory excerpts,
and selected speaker/identity/time errors. Passing these checks is not complete
semantic validation.

| Cases | Result | Evidence |
| --- | --- | --- |
| C01 | fail | Inferred a gender from the name in the reply. |
| C03 | fail | Turned a shared walk into an unsupported first-meeting claim. |
| C04 | fail | Did not mention same-name ambiguity in prose; the card was ambiguous. |
| R03–R06, R08 | error | Model execution interrupted; terminal provider quota unavailable. |
| Remaining 16 | mechanical pass | See immutable per-case receipts and latest adjudication. |

Model: `anthropic/claude-sonnet-5`. Baseline commit: `6362ff349edf81c589a39ba3e6734faa68268d25` plus the
recorded dirty compiled build. Build fingerprint: `a7449b8ae822f2d500164f99839dda8a387baf4050a08c3f3010acc67cdfd8a1`.
Grader fingerprint: `f49e216f398bbd7128e2b48f92b6917a19edf83b61f2c75158d4c9c9f8eeca66`. Both core and Agent Host compiled files
are included. The task-owned socket was restarted from the new Agent Host
before this batch. Subsequent source changes require a fresh run label.

A minimal SDK diagnostic at 2026-09-24 01:39 Asia/Shanghai returned
`API Error: 402 insufficient quota; top up your balance`. The medium-effort
comparison `semantic-recovery-v13` consequently contains four incomplete runs;
it establishes no quality benefit. Low effort remains the production default.
The runner offers an explicit, fingerprinted medium-effort experiment for resume.
No alternate paid provider was selected. Estimated usage is partial and excludes
Doubao/Exa; it is not a bill.

Earlier `full-v8` originally reported 24 passes under a weaker grader. That
summary is superseded: independent review found missing contact options,
unsupported prose and incomplete two-author research. It is not evidence of a
passing release. `full-v11` was explicitly interrupted for the confirmed Exa
title bug; preserved partial files are not a complete batch. Prior failures
are retained rather than overwritten or pooled into a fictitious clean run.

## Implemented corrections

- A clear current direct-chat header supports a name-only Add review option
  across contact, calendar, photo and research tasks. Email/company are not
  prerequisites. Model and host paths share refusal and header checks. Self
  suggestions merge with that option; simultaneous proposals cannot create two
  drafts. Groups, uncertain identity, revoked images and multiple-image identity
  ambiguity fail closed. Namesakes require human review; new contexts stay neutral.
- The Agent can inspect original admitted images through Doubao beyond import
  preprocessing. Receipts bind model, request ID and image hash. Inspection is
  reused and currentness rechecked. Only exact inert schema annotations are
  stripped; unknown data fields remain invalid. Image Memory quotes must match
  observed text.
- Calendar drafts retain image evidence, source time and review status; the UI
  provides a direct review link. Migration 081 protects replay identity and
  invalidates source-dependent drafts on deletion, changes, expiry and revocation,
  including concurrent withdrawal. Export does not insert an external event.
- Public research uses real host-owned search/fetch tools, fixed name-only
  queries and same-run discovered sources. Every requested author needs a fetched
  source cited in the reply. One transient retry stays inside the shared three
  dispatch limit; permanent failures and partial successes do not blindly retry.
  Provider channel failures remain explicit. An actual Andrew Ng official result
  had an empty title; a bounded URL title fallback now preserves this valid source
  instead of rejecting the whole search. Real two-author end-to-end acceptance
  after this fix remains blocked by the main-model quota.
- A host-generated same-name notice now supplements prose when a real staged
  receipt says ambiguous. This closes C04 deterministically; fresh live acceptance
  remains outstanding. C01/C03 semantic quality needs further work and retest.

## Product-surface evidence (separate from the batch)

An isolated authenticated PostgreSQL/API/Next account was used. A nickname-only
contact was added through the actual UI and persisted after navigation/reload,
without email/company. Actual calendar review and generated ICS bytes matched
September 24, 15:00–16:00 Asia/Shanghai. Original admitted PNG bytes matched on
readback. Current-image lineage persisted on calendar drafts. Photo replies
identified the window, green chair and red cup without inventing an address.

A product request with no author names in its objective discovered Maggie
Appleton and Craig Mod from the screenshot, performed real searches/fetches,
and persisted a reply with official-source URLs. Subsequent direct-chat photo,
calendar and ambiguous-author replies expose real name-only review cards.
These are dated targeted observations on earlier builds, not a substitute for
one complete passing final-build run.

Browser file upload was not tested: the existing extension denies local file
access. Images entered through the authenticated product admission API; UI
verification began from persisted sessions. No permission was bypassed. Calendar
export bytes were verified; OS calendar import/invitations were not performed.
Social channels are implemented but this task's actual source acceptance used
web. Native iOS/macOS and production runtime are unverified by this work.

## Deterministic checks and review

Focused checks passed: workspace/default-contact 67, research 27, image/parser 6,
Claude provider 33, Agent Host Exa/service 20, evaluator/fixture integrity 30,
and web review/calendar 19. Earlier unchanged persistence checks passed:
calendar PostgreSQL integration 9, selected Memory integration 5, and all 86
migrations on a fresh database. Builds, web typecheck, documentation/architecture
checks and diff checks were run separately. Skipped tests are not passes.

Independent read-only review reproduced and closed source authority, concurrent
staging, namesake contamination, refusal/locator bypass, research receipt/budget,
channel retry, Exa empty-title and parser issues. AI review is not human gold.

## Resume

1. Restore the configured Claude/Hao service quota or explicitly select an
   alternative. Do not repeatedly retry a known quota failure.
2. Rebuild and restart the isolated backend and Agent Host. Verify their runtime
   revisions; choose a new immutable label and do not overwrite existing receipts.
3. Compare C01/C03 quality using the opt-in effort experiment; resolve findings
   rather than weakening the grader. Retest C04 and one transient research failure.
4. Run all 24 on the resulting single build, rerun affected authenticated product
   checks, sync Studio and read back the exact results. Keep human labels pending
   until a person reviews them. Only then consider release acceptance.

Private provider traces, account data, database dump and screenshots remain in
the task-specific local state directory, outside Git. Only its safe `preview`
subdirectory may be served. The isolated database was dumped and task-owned backend, web, MCP and research
runtimes were stopped after saving evidence. The existing Studio and production
services were preserved.
