# Screenshot to Agent contact loop

## Outcome

Complete the smallest calm iOS loop from one recruiter-selected social-media
screenshot to reviewed evidence, explicit identity and speaker scope, a native
contact handoff, and a pre-scoped Agent Session. Configure the existing bounded
Claude Agent SDK runtime from an allowlisted local environment without copying
unrelated credentials.

Completion is observable when the app can preserve and OCR one selected image,
let the recruiter correct text and speaker, resolve the person, compile the
governed relationship Wiki, preview exact contact fields before opening Apple's
contact editor, and continue into a Session already scoped to the same person
and relationship. No model receives identity, confirmation, Contacts, or other
external-write authority.

## Boundary

In scope:

- allowlisted Anthropic Agent environment import into ignored mode
  `0600` `.env`, with an explicit pinned model and safe deterministic default;
- screenshot evidence review with visible unknown-speaker behavior;
- a quiet contact card using only recruiter-reviewed identity fields;
- user-controlled Contacts UI with a result that distinguishes saved,
  cancelled, and unavailable proof;
- a pre-scoped, editable Agent Session handoff using the canonical Wiki;
- deterministic tests, iOS build/tests, Simulator proof, and multi-lens review.

Out of scope:

- copying the supplied PostgreSQL, Redis, search, APNS, or unrelated service
  credentials into Talent Signal;
- uploading the original screenshot to a remote model;
- autonomous contact creation, messaging, calendar, ATS, or CRM writes;
- inferring candidate quality, personality, acceptance likelihood, protected
  traits, or even candidate/recruiter speaker identity without review;
- claiming private-evidence provider admission or production rollout from a
  synthetic Claude trial.

## Current evidence and unknowns

- iOS already implements PhotosPicker/App Shortcut intake, Vision OCR,
  recoverable drafts, temporal identity comparison, explicit binding, and Wiki
  compilation, but the screenshot fragment always remains unknown/proposed.
- iOS already has account-scoped Agent Sessions over canonical Wiki snapshots,
  but capture completion only returns to People and does not preserve the
  selected relationship as Session intent.
- the bounded provider-neutral Agent runner and Claude Agent SDK adapter already
  expose exactly four in-process capabilities and can only stage a Proposal or
  `no_action`; the supplied environment contains an Anthropic credential and
  model configuration, while the repository `.env` does not yet contain them.
- current unrelated Web Today/OpenRouter edits remain user-owned and must not be
  reverted.

## Chosen approach

Keep screenshot OCR local. Add an explicit speaker choice to the existing
review draft so confirmed candidate attribution is possible without guessing,
while unresolved attribution remains a valid capture outcome. After Wiki
compilation, render one contact handoff card and send only its previewed fields
to `CNContactViewController`; the system editor remains the approval surface and
its delegate result is the only saved/cancelled receipt.

Carry a lightweight person/context seed into the existing Session sheet. It
preselects the canonical relationship and restores or proposes an editable
question; it never auto-submits an Agent task. Keep the existing bounded Claude
runtime separate from Contacts and canonical state authority.

Generalize the existing credential-sync utility to configure Claude when an
Anthropic key and pinned model are present, preserve unrelated local target
settings, and copy only the provider credentials needed by the Agent. OpenRouter
and the supplied unrelated database and service keys are intentionally excluded.

## Milestones

1. Generalize and test safe local Agent environment loading; sync the supplied
   Anthropic settings without printing values.
2. Add reviewed speaker attribution and pure contact/session handoff models.
3. Implement the contact card, native Contacts approval/result states, and
   capture-to-Session routing.
4. Run focused unit/UI checks, project generation, build, and the real iOS test
   suite; fix failures without touching unrelated Web work.
5. Prove the flow on Simulator, freeze screenshots/build evidence, and run the
   workflow, evidence-safety, candidate-experience, and mobile UX panel.

## Completion checkpoint

- The supplied environment was imported into ignored mode `0600` `.env` with
  only the Anthropic key, base URL, and pinned model needed by the Agent;
  PostgreSQL, Redis, APNS, and unrelated credentials were excluded.
- The iOS r7 path now includes local Vision OCR, a full-screen pinch/double-tap
  source inspector, editable text and explicit speaker review, explicit Person
  binding, Wiki Gold compilation, a reviewed Contacts handoff, truthful cancel
  receipt, and exact unsent Session scoping.
- The Claude Agent SDK runtime uses a `PreToolUse` gate over exactly four
  governed tools. Thirty deterministic trials and five credentialed synthetic
  live trials completed with zero external effects; all live trials truthfully
  selected `no_action`.
- The product panel is contract-valid and returns `pass_with_changes` with a
  `needs_evidence` release gate. Specialist scores remain separate: recruiter
  workflow 2/4, evidence safety 3/4, mobile UX 2/4, and candidate experience
  3/4. No selection-science review was needed because this slice performs no
  candidate assessment or ranking.
- Remaining release evidence is deliberately not treated as implementation
  failure: AX5/VoiceOver, Contacts save/denial/duplicate/interruption,
  raw-and-derived deletion/third-party minimization, private Claude admission,
  and observed recruiter/candidate value require their own authorized tests.

## Proof

- env tests prove allowlisting, provider/model selection, merge preservation,
  mode `0600`, and exclusion of unrelated secrets;
- 56 iOS relationship Archive/Capture tests cover local Vision OCR, protected
  queue restoration and deletion, identity, Wiki, contact-field mapping, and
  exact Session seed selection;
- the 33.005-second UI journey covers source open/zoom, editable evidence,
  unknown speaker, no preselected identity, Wiki Gold, contact preview before
  system UI, Apple's double-confirmed cancellation, truthful receipt, and
  same-person unsent Session scope;
- the Simulator proof confirms the default-size mobile hierarchy and
  accessibility identifiers; AX5 and VoiceOver behavior remain explicit panel
  evidence gaps rather than assumed passes;
- Agent/backend tests and a synthetic credentialed Claude trial prove the
  pinned four-tool runtime produces only `needs_review` or `no_action` with
  empty external effects;
- `pnpm docs:check`, Agent/backend TypeScript checks, 20 Agent tests, 7 backend
  boundary tests, 4 environment allowlist tests, `git diff --check`, the
  focused iOS build/tests, and both review/panel JSON validators pass.

## Reconsider when

Add direct Contacts deduplication or background reconciliation only after
device-permission and duplicate-recovery tests justify the extra access. Send
private screenshot evidence to a remote provider only after provider admission
proves training, retention, region, access, deletion, and incident controls.

## Accessibility continuation checkpoint

- The r18 delta closes the r7 high finding that the changed path had not been
  exercised on a small device, at AX5, or in dark mode. A 70.560-second journey
  passed on an iPhone SE (375x667) at accessibility-extra-extra-extra-large in
  dark appearance.
- Evidence review, completion, and Session composition now have executable
  semantic-order assertions. Dynamic Type, hit-region, and sufficient-element-
  description audits completed with zero unfiltered issues; the frozen runtime
  records two narrowly filtered SwiftUI/system-hosted nodes whose AX5 behavior
  is directly proven by the pre-audit screenshot and exact parent semantics.
- The Session relationship selector now expands at AX5, renders the full
  relationship label, and exposes one Button with the exact Person and context
  value before the editable unsent objective and Send.
- The affected-lens panel remains `pass_with_changes / needs_evidence`.
  Mobile UX rises from 2/4 to 3/4 and evidence safety remains 3/4. Manual
  VoiceOver on hardware, Contacts save/denial/duplicate/interruption,
  third-party/OCR correction, deletion inventory, and private-provider
  admission remain explicit release evidence.
- Proof is frozen under
  `docs/evaluations/2026-08-26-screenshot-agent-contact-loop-r18/`; the focused
  Archive/Capture regression passed 56/56 after the accessibility changes.
