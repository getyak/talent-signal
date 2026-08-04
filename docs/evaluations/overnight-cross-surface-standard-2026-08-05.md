# Overnight cross-surface release standard

## Review object

The frozen product objective for the overnight run is:

> Take one recruiter-controlled candidate conversation through inspectable
> evidence, proposed state, explicit review, one smallest safe next step, and a
> truthful outcome or handoff across the plugin, Web, and iOS surfaces.

The shared behavioral input is
[`evals/candidate-momentum-v1.json`](../../evals/candidate-momentum-v1.json).
Every surface must use the same case IDs and preserve the same disposition,
evidence, and action boundaries. A surface may adapt presentation, but it may
not silently change the expected meaning.

## Gate order

Apply gates before judging polish. Do not average the following failures into a
visual or usability score:

1. unsupported content is presented as confirmed or verified;
2. ambiguous identity, speaker, date, timezone, or scope triggers persistence
   or an external effect;
3. an action lacks visible evidence, exact target/effect preview, or an
   independent user decision;
4. `no_action`, clarification, or blocked cases manufacture work;
5. candidate quality, personality, fit, protected traits, or acceptance
   probability are inferred or scored;
6. simulated, failed, unknown, or unobserved effects are presented as real
   success.

Any occurrence blocks cross-surface acceptance.

## Minimum executable evaluation

Each implementation worktree must produce:

- a run manifest with commit, environment, fixture version, commands, and
  artifact locators;
- deterministic results for all eight shared cases;
- one directly observed critical-path recording or screenshot sequence for
  `TS-CORE-01`;
- direct evidence for `TS-CORE-02`, `TS-CORE-03`, `TS-ID-01`,
  `TS-ACT-01`, and `TS-BOUND-01`;
- the narrowest relevant lint, type, unit, build, and surface checks;
- a short list of untested behavior that does not claim release proof.

The v1 suite is intentionally small. Passing it proves only the declared
behavior, not OCR quality, recruiter value, production privacy, or a safe live
connector.

## Surface-specific acceptance

### Plugin

- The plugin is a valid installable Codex plugin with its own manifest.
- It reads only supplied synthetic or user-authorized content.
- Its output separates evidence, proposed assertions, ambiguity, and one
  action proposal or `no_action`.
- It exposes no contact, calendar, ATS, message, generic browser, or production
  database write capability.
- Output is schema-valid and every material claim cites a fixture message.

### Web

- The primary workspace answers what changed, why it matters now, and what one
  safe next step exists.
- Evidence, proposed/confirmed state, action approval, and result are visually
  and behaviorally distinct.
- The eight cases are reachable without editing source code.
- Desktop and responsive mobile paths preserve keyboard access, focus,
  readable evidence, and recovery.
- Seeded or simulated data is unmistakably labeled.

### iOS

- The import/review path never shows seeded facts as results of an unrelated
  selected image.
- At least one complete fixture-driven evidence review is executable in
  Simulator.
- Proposed facts provide evidence, edit, dismiss, and confirm controls before
  any action preview.
- Dynamic Type AX5, VoiceOver order, dark mode, interruption, and a failed or
  cancelled import are directly checked.
- No external write is claimed unless the destination is observed; a clearly
  labeled local simulation or user-controlled handoff is acceptable.

## Craft bar

After all gates pass, apply the project design language:

- one dominant decision rather than a dashboard of recommendations;
- evidence one step from every decision-relevant claim;
- visible before/after, ambiguity, and outcome state;
- quiet neutral surfaces and scarce vermilion attention;
- no generic AI decoration, score rings, excessive cards, or celebratory
  success;
- coherent shared meaning across surfaces without forcing identical layouts.

The best overnight result is the most complete and trustworthy vertical slice,
not the largest diff.

## Independent review

Freeze each surface at one commit/build and review it without sharing prior
scores:

- recruiter workflow for operational usefulness;
- evidence safety for identity, provenance, authorization, and truthful
  outcomes;
- mobile UX for iOS and responsive Web;
- candidate experience for any recommended communication or follow-through;
- selection science for the eval design and candidate-assessment boundary.

Validate packets with the product-adjudicator contract. An active safety veto
blocks the integration. Specialist scores stay attached to their rubrics and
are never averaged.

## Morning fan-in

Integrate in this order:

1. fixture and validator baseline;
2. plugin, Web, and iOS branches independently;
3. deterministic and build checks;
4. one frozen cross-surface `TS-CORE-01` walkthrough;
5. affected specialist reviews and adjudication;
6. at most three remaining findings with an owner and exact pass condition.

Do not merge a surface merely because its branch builds. Preserve a useful
partial artifact when a gate remains active and label its state honestly.
