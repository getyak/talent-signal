# End-to-end relationship intelligence

Status: active; Web contract hardened in PR #27, execution proof pending.

## Outcome

Prove one truthful, production-shaped path across Web, browser capture, and iOS:

`authorized synthetic conversation image → private multimodal analysis → inspectable transcription and exact evidence → human identity/context binding → reviewed relationship state → one proposal or no_action`

The Web slice comes first. It is complete only when the generated channel
images are actually submitted to a configured model, the returned evidence is
reviewed in the real UI, and the committed result is read back from the shared
relationship workspace. Marketing animation is product explanation, not proof
of model execution.

## Boundaries

In scope:

- WeChat, WhatsApp, LINE, BOSS直聘, and 小红书 synthetic conversation images;
- authenticated Web capture, model analysis, evidence review, identity binding,
  commit, and workspace readback;
- private-provider routing, exact model/request provenance, ambiguity,
  no-action, failure, retry, and deletion-safe behavior;
- visual redesign of the capture and review surface using the existing quiet
  editorial and restrained glass system;
- real-browser verification, followed by browser-extension and iOS convergence;
- one frozen artifact reviewed independently through ten relevant Skill lenses.

Out of scope without a separate decision:

- processing real candidate screenshots;
- automatic identity creation or merging from model guesses;
- person scoring, acceptance prediction, or protected-trait inference;
- external messaging or CRM writes without exact-effect approval;
- treating static marketing copy or generated screenshots as runtime evidence.

## Current evidence

- The official homepage now has a strong scroll narrative and five synthetic
  WebP sources, but it remains product explanation rather than runtime proof.
- PR #27 generalized screenshot analysis beyond WeChat, added provider-neutral
  Ark and OpenRouter routing, and preserves provider, model, request, prompt,
  schema, source hash, and a signed short-lived review receipt.
- Exact-quote validation, candidate-speaker gating, explicit source ownership,
  relative-date ambiguity, editable transcription, identity/context binding,
  and a separate human commit are implemented and covered by focused tests.
- A human transcription edit removes model-derived facts and actions before a
  human draft can be committed; the raw image does not become Talent Signal
  memory.
- The configured-provider path has not yet been proven end to end through the
  real review UI and a fresh shared-workspace read in this environment.
- Several synthetic screenshots use the candidate's device perspective, so
  speaker ownership must remain explicit or unknown rather than inferred from
  bubble side alone.
- Kimi WebBridge is the required final real-Chrome surface. The local daemon is
  present, but the extension connection must be rechecked at verification time.

## Chosen approach

1. Generalize the governed screenshot contract and provenance to five channels.
2. Add an OpenRouter multimodal provider behind the existing sensitive-processing
   gate, while retaining Ark as an explicitly configured option.
3. Preserve provider, exact model, request ID, prompt version, schema version,
   and source hash through commit; never replace runtime metadata with config.
4. Recompose intake as a calm three-stage decision: source, identity/context,
   evidence review. Use glass only for the floating progress/action rail; keep
   source and exact evidence materially plain.
5. Run the five synthetic images through the real provider with an external eval
   manifest that never enters the production bundle. Confirm non-hardcoded
   behavior with exact-quote checks and at least one perturbed/no-signal case.
6. Freeze browser screenshots, network evidence, runtime receipts, tests, and
   known limitations. Then run ten independent Skill reviews and iterate until
   every requested dimension clears the gate without a safety veto.
7. Reuse the proven contract for browser capture, then iOS, rather than creating
   three independent truth models.

Rejected alternatives:

- keeping Ark-only and presenting the marketing storyboard as proof;
- bypassing the sensitive-processing gate because test images are synthetic;
- inferring the contact or speaker from channel chrome;
- a decorative all-glass review modal that lowers evidence legibility;
- embedding expected facts in the production component to make tests pass.

## Milestones

1. **Complete — Web runtime and contract.** Multi-channel schema, provider
   routing, provenance, signed receipts, and focused unit/route tests landed in
   PR #27.
2. **Active — Web experience.** Redesign capture/review, expose ambiguity and
   provider state, preserve edit/reject/no-action paths, and verify responsive
   plus reduced-motion behavior.
3. **Pending — Five-image proof.** Run real multimodal analysis, commit reviewed
   proposals, and read them back from the shared workspace without static
   production expectations.
4. **Pending — Ten-Skill gate.** Freeze one artifact packet, collect independent
   reviews, adjudicate vetoes/disagreements, iterate, and record final scores.
5. **Pending — Browser capture.** Replace fixture-only image handoff with the
   same governed analysis/review contract and verify in the loaded extension.
6. **Pending — iOS convergence.** Preserve OCR geometry/confidence, multi-language
   recognition, unknown speaker, and server review handoff in the app.
7. **Pending — Cross-surface completion.** Test ambiguity, no-action, provider
   failure, stale state, retry, recovery, and deletion across all three surfaces.

## Completion evidence

- Provider network receipts for all five synthetic files include exact model,
  request ID, prompt version, and image hash without storing raw image content.
- Every proposed assertion points to an exact contiguous transcription quote;
  ambiguous speaker or time cannot produce a confirmed candidate fact or action.
- The committed contact/context and evidence are observable after a fresh
  workspace read, and no external effect occurs from fact confirmation.
- Browser artifacts show desktop/mobile/reduced-motion/loading/error/ambiguity/
  no-action/review states with keyboard and accessibility checks.
- Ten reviewer packets reference the same artifact version and scenario, retain
  specialist vetoes, and each requested 0–100 dimension is above 95.
- Relevant unit, route, E2E, type, lint, docs, build, backend, extension, and iOS
  checks pass, with remaining external dependencies reported as unproven.

## Decisions that can change direction

- A provider data-policy limitation can disqualify an endpoint even if inference
  works technically.
- Real-user screenshot processing requires a separate authorization and privacy
  decision; this plan authorizes synthetic test assets only.
- If the supplied synthetic images cannot support reliable speaker attribution,
  the correct result is an explicit owner review or `unknown`, not image editing
  to force a desired fact.
