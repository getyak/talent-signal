# Relationship conversation evaluation

24 synthetic WeChat/WhatsApp conversations exercise name-only contacts,
appointment grounding, visual understanding, and public-person research.
All private participants are fictional. The twelve public authors are topics
of conversation, not purported private correspondents.

## Evidence levels

1. `cases.mjs` contains synthetic source conversations and **proposed** expectations.
   Expectations are excluded from target-model input. Human labels remain empty.
2. `generate.mjs` creates an IMStage project, atomic batches, PNGs and an Eval
   Case Studio project. Generation is deterministic after asset creation.
3. `run-live.mjs` exercises the actual compiled workspace core and actual model
   with isolated directory/Memory adapters. It does **not** prove database,
   queue, UI, confirmation or calendar destination behavior. Optional Doubao
   preprocessing is a separately recorded probe; the workspace core receives
   the original image, not that probe's transcription.
4. `grade.mjs` checks receipts and atomic constraints. `mechanical_pass` is not
   human agreement, semantic quality certification or release acceptance.
   Product entry, persistence and browser readback must be recorded separately.

## Corpus and assets

`fixtures/png` contains IMStage-rendered mobile screenshots. `fixtures/assets`
contains a fictional avatar and cafe image generated with the pinned
`doubao-seedream-4-5-251128` model on 2026-09-23, plus deterministic synthetic
poster, illegible and injection images. The cafe image was visually inspected:
green chair by a window, red mug and blue notebook. Image generation is separate
from `doubao-seed-2-0-lite-260215` screenshot understanding. Neither is a real
person's photo or private conversation. Generated images retain their AI mark;
chat screenshots have a synthetic-data watermark.

The new library follows Eval Case Studio's existing seven-day retention. These
versioned synthetic fixtures are the durable source; the library is a review UI,
not the sole dataset store. Actual private runtime receipts stay outside Git.

## Commands

```sh
node --test scripts/evals/relationship-evaluation/*.test.mjs

# Explicit private output directory, local service and injected MCP credential.
RELATIONSHIP_EVAL_DIR=/absolute/private/run \
  node scripts/evals/relationship-evaluation/generate.mjs

# Build the selected worktree before an explicitly authorized live run.
pnpm --filter @talent-signal/backend build
RELATIONSHIP_EVAL_DIR=/absolute/private/run \
RELATIONSHIP_EVAL_LABEL=baseline-v1 \
RELATIONSHIP_EVAL_CASES=C01,C06,K01,K02,I01,R02 \
  node scripts/evals/relationship-evaluation/run-live.mjs
```

Set `RELATIONSHIP_EVAL_CONCURRENCY=2` for at most two isolated case workers;
the default is serial. `RELATIONSHIP_EVAL_EFFORT=medium` is an explicitly
fingerprinted quality experiment; it does not change the production default.
Agent Host must be rebuilt and restarted before a run;
its compiled files are included in the fingerprint but cannot attest a running
process by themselves.

Live execution requires provider credentials injected into the process and a
credential-free `runtime-config.json` in the output directory. It is not part
of CI. Each case permits one model invocation, honors production turn/tool/time
ceilings and applies an estimated USD 0.20 ceiling where usage is available.
Unknown usage stays unknown. A complete failed Run is not automatically repeated.
Within one Run, a transient public-search transport failure may retry once;
both dispatches consume the shared three-dispatch budget and retain receipts.
Permanent, identity, validation and permission failures do not retry.

Run reuse requires matching case, image, compiled build, grader, runner, model,
endpoint and mode fingerprints. A changed input requires a new run label, not
overwriting prior evidence. Fault cases require an observed failure receipt;
an unavailable adapter is not proof of recovery from a failed provider call.

## Coverage

- C01–C06: name-only and nickname creation, existing/same-name review, groups.
- K01–K06: exact time, unspecified time, reschedule, cancellation, cross-timezone,
  old screenshot with unknown date.
- I01–I04: real visual details, poster scheduling, illegibility, embedded instructions.
- R01–R08: the twelve requested authors, ambiguous identity, research outage.

Source links in research cases are verification hints for reviewers. They are
not injected into model input as fetched facts. A typed tool invocation, a
nonempty fetched-source receipt and matching reply citation are separate gates.

## Production integration

The workspace Claude provider now accepts two host-owned supplements:

- `inspect_current_image`: Doubao examines only the admitted current pixels. A
  successful receipt binds model, request ID and image hash; concurrent reads
  share one inspection. Calendar excerpts must match its visible text.
- `search_public_subject` / `fetch_public_sources`: the existing Agent Host
  socket performs real Exa/TikHub requests. Search accepts a registered subject
  ID, never an arbitrary query. The host sends only a bounded name and fixed
  public-biography query. Discovery leads require a separate page fetch.

Runtime configuration is explicit. Image inspection requires
`TALENT_SIGNAL_ALLOW_SENSITIVE_AI_PROCESSING=true` and `ARK_API_KEY`.
Public research requires `TALENT_SIGNAL_WORKSPACE_PUBLIC_RESEARCH_ENABLED=true`
and an absolute `TALENT_SIGNAL_PERSON_RESEARCH_SOCKET`; Exa/TikHub credentials
stay in Agent Host. This integration is exercised with the Claude workspace
provider; other provider adapters are not certified by this suite. Missing
configuration must not be reported as a successful lookup.

Text subject admission currently supports full Latin-script names in explicit
positive research clauses. Ambiguous first names and unbound Chinese text
phrases require clarification; Chinese names can be admitted as exact public
reading topics by current image inspection. Public topics never bind the
counterparty or unlock private Memory. Negated research requests are denied.

Migration `081_meeting_image_evidence` persists image lineage atomically with
calendar drafts, rejects changed-source replays, and invalidates drafts on
image changes/deletion/expiry/revocation. Admission and invalidation share a
transaction lock. The chat exposes a direct review link; exporting a calendar
file still does not create an external event or send an invitation.

Name-only contact proposals may have zero Memory items. Host-owned Session and
message authority remain mandatory, duplicate resolution remains a review,
and no email/company or fabricated Memory is needed to show the Add action.
For one admitted image, a shared Doubao observation identifies the clear direct
chat header before the main model runs. A default card is prepared independently
of the main calendar, image or research intent. Group/unclear/multiple-image
identity is not collapsed into one person. User refusal gates both model and
host staging. Self-only suggestions share this card; new identity contexts are
neutral and never copied from unconfirmed directory matches. Image Memory
quotes must match current observed text exactly. The entire path shares the
existing Run deadline, and inspection is reused by subsequent tools.

## Running product verification

`run-product.mjs` uses an explicitly local API and the dedicated synthetic
account. It admits PNGs through the authenticated product queue and verifies
persisted Session turns and exact original-image bytes. `completed` only means
queue/persistence completion; inspect the associated actual tool trace and
run the quality grader separately before claiming a behavior passed. A custom
`RELATIONSHIP_EVAL_OBJECTIVE` is saved with its own hash, so image-only topic
research can be tested without silently changing a corpus case.

`sync-studio.mjs` records the current grader hash separately from historical run
receipts, reads back all case updates and renders a local review report. It
keeps every human decision pending, including mechanical passes. It never
turns synthetic expectations into human gold. Serve only its `preview`
directory, never the private artifact root or account credentials.

`pnpm eval:relationships:check` runs deterministic evaluator/fixture integrity
checks in CI. `pnpm eval:relationships:live` is opt-in and never consumes real
provider credentials in CI. A fresh full run and affected-case repairs must
remain separate reports; do not combine builds and call them one passing run.

Current checks require an actual Doubao receipt for visual cases, a correct
calendar interval with matching staging receipt, and a fetched/cited source
for **each** requested public author. They also check same-name ambiguity,
default Add across all direct chats, literal quotes, selected unsupported
identity/time claims, speaker reversal, injection and truthful tool outage. Claim-level entailment,
Chinese fluency and nuanced speaker interpretation remain semantic review.
