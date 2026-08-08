# iOS multimodal relationship capture

## Outcome

Turn the iPhone preview's capture button into one lightweight, intentional
entry for an ordered screenshot set plus optional recruiter-authored voice or
text context. The result must be a reviewable evidence handoff, not a generic
summary or an external action.

## Boundary

In scope:

- one explicit Quick add popover anchored to the existing bottom rail;
- one to eight screenshots from one conversation, with ordering and removal;
- optional voice-note and typed-note states that remain recruiter context;
- an evidence-first preview with ambiguity and `no_action` as valid results;
- a synthetic public-product demonstration with no upload or external write.

Out of scope:

- production OCR, speech transcription, persistence, retention, or deletion;
- automatic person or assignment binding;
- Contacts, Calendar, ATS, CRM, notification, or message writes;
- candidate assessment, personality, fit, engagement, or acceptance scoring.

## Baseline evidence and unknowns

- The right capture button currently opens the same Guide path as search and
  can inherit Leila's answer context from Today. This is an identity risk.
- The current Guide shows a text area and inert microphone affordance but no
  multi-image source model or interruption recovery.
- Public synthetic channel screenshots exist for an inspectable prototype.
- Real PhotosPicker, Share Extension, OCR, recording, background recovery, and
  recruiter field value remain unproved.

## Chosen approach

Use one compact, in-device Quick add popover that preserves the current
relationship surface behind it and expands only for the chosen input:

1. choose screenshots, voice, or text from one centralized insert tray;
2. expose only the selected input and preserve an ordered source strip;
3. prepare one review handoff in the same progressively sized popover;
4. show either a proposed change, an ambiguity-first organizing result, or a
   quiet no-signal result;
5. keep final fact confirmation and every external effect outside this slice.

Do not ask the user to choose an AI output type before capture. Do not merge
multiple people or conversations into one relationship. Do not present voice
or typed context as source evidence.

## Milestones and proof

- [x] Independent workflow, safety, mobile UX, and candidate-experience packets
      agree on the minimum input and result contract.
- [x] The Capture button opens a separate unbound surface from Today, People,
      and Library.
- [x] The prototype supports source ordering/removal, multi-file selection,
      voice-note state, text context, cancellation, ambiguity, and a safe
      receipt.
- [x] Lint, typecheck, tests, build, keyboard checks, desktop iPhone preview,
      and narrow responsive rendering pass.
- [x] The verified slice is ready to push to the existing relationship-desk
      pull request.

## Completion evidence

- rendered screenshots of input, ambiguity/result, and narrow-screen states;
- direct browser interaction proving the Capture route is separate from Guide;
- clean diff and passing relevant repository checks;
- preserved specialist findings and remaining unproved production behavior.

## Verification record

- A 390 by 844 browser viewport selected two local WebP files through the real
  multi-file picker and showed an ordered two-source tray.
- Voice-state and recruiter-note controls remained visibly separate from the
  screenshot sources.
- The review result explicitly stated that the public preview did not upload or
  analyze local files, then produced a zero-change, zero-external-action
  receipt.
- Escape and the close action restored focus to the capture launcher; Tab and
  Shift-Tab remained inside the open dialog.
- The corrected Quick add structure rendered as a small rail-anchored popover;
  text expanded inline, screenshot selection added only a horizontal filmstrip,
  and the review state became shorter instead of replacing the current page.
- `pnpm --filter @talent-signal/web lint`, typecheck, tests, build, and
  `pnpm docs:check` passed on 2026-08-09.
