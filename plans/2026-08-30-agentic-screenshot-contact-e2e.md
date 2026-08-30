# Agentic screenshot-to-contact end-to-end evaluation

## Outcome

Exercise the current authenticated Web product as a recruiter would: import one
synthetic conversation screenshot, inspect the minimized image and model
transcript, resolve speaker and identity scope, commit only reviewed evidence,
decide any proposed facts, and read the resulting person/Wiki state back from
the rendered workspace. Produce reproducible browser, server, and review
evidence rather than treating an API response or screenshot alone as proof.

## Boundary

In scope:

- the current working tree at the start of the evaluation;
- local Web `/workspace` with the current local backend and configured
  screenshot-analysis provider;
- one repository-owned synthetic screenshot;
- success, ambiguity/no-action, identity/speaker, commit/readback, console, and
  focused deterministic checks relevant to the exercised path;
- recruiter-workflow and evidence-safety review packets plus one adjudicated
  release gate for this scenario.

Out of scope:

- real candidate or contact screenshots;
- production rollout, legal certification, or field-value claims;
- autonomous Contacts, Calendar, ATS, CRM, or messaging writes;
- implementation changes to repair findings unless separately requested;
- unrelated iOS work already present in the working tree.

## Frozen scenario

An independent recruiter intentionally imports a synthetic chat screenshot for
an existing or newly chosen contact. The screenshot contains operational
relationship evidence, not candidate-quality judgments. Success requires the
rendered product to preserve source/proposal/confirmation distinctions, demand
explicit speaker and person/context scope, commit idempotently, and show the
accepted result on the contact page or an honest `no_action`/unresolved state.

## Milestones

1. **Environment and artifact freeze — complete.** Recorded commit/worktree state,
   service versions, provider availability, fixture hash, and baseline UI.
2. **Rendered happy-path journey — complete.** Uploaded, minimized, analyzed,
   reviewed, bound, committed, decided supported state, and verified
   contact/Wiki readback after a full page reload.
3. **Adversarial and recovery coverage — complete for this slice.** Checked
   ambiguous time, no-action, provider timeout/retry, local redaction keyboard
   handling, duplicate identity choices, browser console errors, and persisted
   readback without deleting the retained synthetic evidence.
4. **Focused deterministic verification — complete.** Screenshot controller,
   analysis, receipt, gold, identity, resource, source-lifecycle, and type
   checks passed; the selected live provider gold case also passed.
5. **Adjudication and handoff — complete.** Specialist packets and the panel
   contract are validated. The release gate is blocked by indistinguishable
   duplicate-person choices at screenshot binding time.

## Completion evidence

- frozen manifest with commit, dirty paths, environment, fixture digest, and
  exact scenario;
- screenshots from input, review, committed evidence, and final readback;
- server and browser-console observations with request/receipt identifiers
  redacted to non-sensitive local fixture metadata;
- focused test results;
- contract-valid recruiter-workflow, evidence-safety, and panel JSON packets.

## Reconsider when

Stop before transmission if the selected image contains real personal data or
if the configured provider cannot truthfully admit synthetic screenshot
processing. Treat any external-effect control as an unexecuted boundary unless
the user separately authorizes that exact write.
