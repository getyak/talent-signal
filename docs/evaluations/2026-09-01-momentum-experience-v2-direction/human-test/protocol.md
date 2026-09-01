# MX-01 human comprehension protocol

## Purpose

Measure first-use comprehension of the selected rendered direction without
teaching the design rationale. This is a product-direction gate, not a
candidate assessment.

## Participants

- Ten first-use participants who have not seen the directions or rationale.
- Prefer the target mix of independent recruiters and boutique-search
  operators; record role and recruiting experience without collecting
  candidate data.
- Use synthetic Alex/Aurora fixtures only.

## Blinding and order

Do not name `Decision Lens`, explain the causal seam, or describe the intended
answer. Present the frozen images at their native 393 × 852 ratio. Alternate
the fact and approval screen order by participant ID: odd IDs see fact first;
even IDs see approval first.

## Moderator runner

While the local prototype server is running, open:

`http://127.0.0.1:4173/?study=moderator`

The runner is a protocol aid, not a participant or scorer. It:

- shows the frozen Today stimulus for exactly five seconds and then hides it;
- alternates fact-first and approval-first order from the participant ID;
- requires all verbatim fields before moving to the next phase;
- keeps responses only in browser memory and clears them on refresh;
- exports the ten-row CSV shape with pass, scorer, and adjudication fields
  blank;
- uses only the frozen synthetic Alex/Aurora fixtures.

Export after every participant so a browser refresh cannot lose completed raw
responses. A runner verification, model replay, internal team rehearsal, or
synthetic response does not count as a participant result. Do not update
`status.json` until ten eligible first-use participant rows and both independent
scores are complete.

## Independent scorer workbench

After all ten raw rows are complete, give each scorer the same raw export and a
separate workbench session:

- `http://127.0.0.1:4173/?study=score&role=scorer_1`
- `http://127.0.0.1:4173/?study=score&role=scorer_2`

The workbench rejects partial cohorts, missing verbatim responses, wrong screen
order, non-first-use rows, and raw files whose pass, scorer, or adjudication
fields are already populated. It never imports or reveals the other scorer's
file. Each scorer must mark every atomic criterion `Supported` or
`Not supported`; an unmarked criterion cannot silently become a fail. The two
test passes are derived only from those explicit human choices.

Each scorer export contains:

- the SHA-256 fingerprint of the exact raw response file;
- one stable scorer role and scorer ID;
- all eight atomic criterion decisions for P01–P10;
- the deterministically derived Test A and Test B pass fields; and
- optional transcript-grounded scorer notes.

Do not share one scorer export with the other scorer before both files are
frozen.

## Adjudication workbench

Open `http://127.0.0.1:4173/?study=adjudicate` only after both independent
exports exist. Import the raw response file and the two score files in any
order. The workbench joins them only when both scorer files name the exact raw
SHA-256 fingerprint, contain distinct scorer roles and IDs, and cover the same
ten participants.

Only atomic disagreements are shown. Resolve each from the frozen verbatim
response, choose a final boolean value, and record a written rationale. Agreed
criteria pass through unchanged. The final Test A and Test B rows and the 9/10
gate calculation are deterministic consequences of those human decisions.

The workbench downloads three review artifacts:

- `mx01-human-results-draft.csv` in the frozen results-template shape;
- `mx01-adjudication-audit.csv` with each disagreement, both scorer values,
  final value, adjudicator ID, and rationale; and
- `mx01-status-draft.json` with visible numerators, denominators, and gate
  calculation.

All three are drafts. The browser does not write the repository, update the
official `status.json`, persist raw responses, or claim a human result. A human
must inspect the three files together before any separate repository update.

## Test A — five-second lead clarity

1. Show `qa/states/today.jpg` for exactly five seconds.
2. Hide it.
3. Ask, without prompts:
   - Who is this about?
   - What changed or remains unresolved?
   - Why does it matter now?
   - What should the recruiter do next?
   - Where would you tap to continue?
4. Record the response verbatim before scoring.

Pass only when the participant identifies all of:

- Alex/candidate and Aurora role context;
- remote policy is unresolved;
- the decision is due Wednesday/Sep 2;
- review or confirm the supported fact next;
- the lead dependency or its `Review one supported fact` destination.

The MX-01 gate requires at least 9/10 participants to pass.

## Test B — fact versus action authority

1. Show `qa/states/fact.jpg` and `qa/states/approval.jpg` in the assigned order.
2. Ask: `What changes after the primary button on each screen?`
3. Ask: `Does confirming the fact create or send anything?`
4. Record the response verbatim before scoring.

Pass only when the participant distinguishes:

- `Confirm fact` changes the reviewed internal fact from unknown to Sep 2 and
  does not authorize a write;
- `Approve exact effect` authorizes one recruiter-owned local reminder at the
  stated target/time;
- no message, meeting, contact, ATS, or CRM write is implied.

The MX-01 gate requires at least 9/10 participants to pass.

## Intended-destination check

Record the first indicated tap target on Today and on the fact screen. A verbal
description is acceptable when the study is image-only. Do not correct the
participant until all responses are frozen.

## Scoring and adjudication

- Two scorers independently score each verbatim response against the atomic
  criteria above.
- Use distinct scorer IDs and preserve each scorer file before joining them.
- Resolve disagreements using the frozen response, never memory or design
  intent.
- Require a final value and written rationale for every atomic disagreement.
- Keep numerator, denominator, exclusions, and participant order visible.
- Do not convert partial answers into a pass after discussion.
- Do not populate `status.json` until all ten rows, both independent score
  files, and all disagreement rationales are complete and manually reviewed.
