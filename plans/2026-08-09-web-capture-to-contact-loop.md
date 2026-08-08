# Web capture-to-contact completion

## Outcome

Make `/workspace` a real, quiet relationship workbench whose visual language
matches `/relationships`, and prove that an authorized recruiter can import a
conversation image or text file, review exact evidence, bind it to a person and
relationship, confirm only supported facts, compile the living Wiki, and later
reverse or delete the governed source.

The implementation slice is complete only when both capture paths are exercised
from the real browser surface, the resulting contact and Wiki are inspected, and
relevant failure and ambiguity behavior is covered. The requested 95/100
experience target must be reported against each skill's native rubric rather
than manufactured as a cross-rubric average: the selected skills use a 0–4 scale,
and their top score requires field evidence that a synthetic local run cannot
provide.

## Boundaries

- Conversation material remains sensitive and purpose-bound. Raw uploads are
  transient; only reviewed text and provenance enter governed storage.
- Speaker identity is never inferred from wording or message order. The
  recruiter must confirm candidate/recruiter attribution; unknown messages do
  not create candidate facts.
- Import and analysis create proposals only. Contact state, external actions,
  merges, and deletion remain explicit human decisions with stale-state and
  idempotency protection.
- Work is on `main`. Preserve the concurrent browser-extension changes and the
  generated `apps/web/next-env.d.ts` modification already present in the
  worktree.
- Synthetic evidence is used for verification. No private user conversation is
  placed in fixtures or logs.

## Current evidence

- `/workspace` now uses the same quiet editorial relationship language as
  `/relationships`, with clearer capture, evidence review, living Wiki, source
  ledger, contact context, action boundary, responsive behavior, and keyboard
  focus states.
- Governed transcript paste/TXT/Markdown upload, explicit speaker review, and
  actor-aware claim compilation are implemented. Unknown and recruiter-authored
  fragments cannot create candidate facts.
- Screenshot intake requires an explicit person and relationship-context choice,
  supports a browser-local vertical crop plus freeform masks, flattens those
  irreversible masks into the prepared image, sends only the minimized bytes,
  and remains proposal-only until atomic fact review.
- Synthetic browser proof reused person `Synthetic Avery Lin 0809` and
  relationship context `a3c512ba-777d-4dad-8f72-e5d3ac6167e2`; capture
  `40c98a97-2be1-4552-93d8-c92304bd0110` yielded six messages and two proposals.
  Work mode was confirmed while availability stayed unresolved.
- Wiki snapshot `ead49469` restores after refresh with 22 governed references.
  A mistakenly attached synthetic source was deleted through the rendered UI;
  its source and derivatives disappeared while audit-safe identifiers remained.
- The live cropped screenshot used request
  `gen-1786214015-lwiFPRxFyhsF1Pr9kfJq`; the transmitted crop SHA-256 differed
  from the original and was not committed.
- The second privacy iteration used request
  `gen-1786215853-1CW6441cvjEyRHr8dZFg`. The 10–90 percent crop plus two local
  masks produced prepared SHA-256
  `a333a1f145e1ea7c89ca6935a9f3ffcd71ba0f3be505ec5b7da175f22e9e908c`,
  continuous dark rows 33–150 and 869–975, and signed provenance recording
  `browser-crop:10-90;browser-redactions:2`. Verification capture
  `eb8c2254-e6ec-4ff7-8596-c824784e4660` reached real model review, was bound to
  the existing person/context, then was deleted through the rendered UI with
  zero active evidence fragments and both proposals deleted.
- Focused and aggregate tests, contracts/backend/web typechecks, Web lint, the
  production build, and documentation checks pass. Fresh browser inspection had
  no console errors or horizontal overflow at 390 px or 1536 px.
- Keyboard-only masking is now proven in the rendered modal: Enter added a
  centered mask, arrows moved it, Shift plus arrows resized it, Delete restored
  the original canvas, the live status announced both count states, Tab advanced
  to Replace, and every visible focusable modal control measured at least 44 px.
- The capture surface now uses Radix Dialog semantics. A fresh 390x844 browser
  run proved titled initial focus, forward and reverse focus wrapping, Esc
  dismissal, exact opener restoration, zero overflow, and a successful
  `#proposed-changes` focus handoff; the empty-state screenshot control was also
  raised from 42 to 44 px.
- Four independent specialist packets and the final product panel pass their
  machine-checkable contracts. Recruiter, safety, candidate, and mobile each
  score 3/4 with no veto. Panel iteration 002 removes the earlier local-redaction
  and browser-focus gaps; remaining proof requires real operators, assistive
  technology, or production lifecycle evidence,
  not another styling iteration.
- Kimi WebBridge remains externally unavailable: its existing PID file points to
  PID 2158 while the HTTP probe reports `running: false`. Per the WebBridge skill,
  this work does not stop, restart, or remove that process state automatically.

## Chosen approach

Add one reusable, versioned transcript parser/review model shared by first-source
and existing-contact intake. It accepts paste or TXT/Markdown upload, recognizes
only explicit speaker labels, surfaces every message for correction, and commits
addressable `message` fragments as `conversation_transcript`. Candidate claim
compilation is enabled only for reviewed fragments whose actor is explicitly
confirmed as candidate.

This uses the generic resource contract instead of creating fixture-specific
routes or treating a TXT file as a resume. A transcript remains a source with
its own review, authorization, provenance, and deletion path.

## Milestones

1. **Contract and implementation audit — complete.** Mapped current `/workspace`,
   `/relationships`, resource intake, claim compilation, Wiki, and reversal
   behavior, recorded gaps, and preserved concurrent browser-extension edits.
2. **Governed transcript intake — complete.** Implemented paste/upload, speaker review,
   transcript fragments, actor-aware claim compilation, readable ledger copy,
   and focused parser/safety tests.
3. **Closed-loop hardening — complete.** Verified ambiguity, unknown-speaker no-claim,
   duplicate/idempotent import, stale decisions, retry, authorization reversal,
   and deletion/Wiki rebuild behavior at the narrowest authoritative layer.
4. **System verification — complete.** Ran focused tests, type/lint/build checks, started the
   local backend and Web integration, then exercise image and text capture into
   a contact and compiled Wiki with synthetic evidence.
5. **Experience adjudication — locally complete; Kimi gate pending.** The real
   rendered surface was exercised with Playwright, all code-fixable findings were
   iterated—including freeform local masking, fixed confirmation actions, and
   final 44-pixel mobile controls—and the product, recruiter, candidate, safety,
   mobile, and design rubrics were applied twice. Native scores are 3/4 with no
   veto. Kimi WebBridge could not be used because its pre-existing daemon state
   is unhealthy; top-rubric scores additionally require external field and
   production evidence.
6. **Completion audit — active.** Re-check every objective item against current files,
   test output, runtime state, browser evidence, and review artifacts before
   marking the goal complete.

## Verification evidence to retain

- Focused test names and command output for transcript parsing and actor-aware
  claim proposal behavior.
- Typecheck/lint/build output for the affected packages and app.
- Synthetic image and text fixture names plus resulting governed source,
  contact, claim-review, and Wiki state observed in the browser.
- Playwright screenshots/snapshots used for review, native rubric scores,
  concrete issues found, and the post-fix review packets. A Kimi session remains
  pending until its externally managed daemon is healthy.

## Decisions that would change direction

- A requirement to retain original image or text files would require a new
  encrypted storage and retention design; it is intentionally out of scope.
- Automatic external contact/calendar writes would require connector-specific
  preview, approval, reconciliation, and reversal work and are not authorized by
  this request.
