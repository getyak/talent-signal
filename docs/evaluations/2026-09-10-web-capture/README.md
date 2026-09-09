# Web capture pipeline evaluation

## Scope

Connect an intentional browser capture to authenticated durable task admission,
source storage, real AI extraction, reversible internal person filing and Web
readback. Source facts and identity attribution remain proposed. Public research
defaults off; no external messages or contact/calendar writes occur.

The baseline is `e9bbaa5b`. Implementation and runtime evidence belong to
`codex/web-capture-pipeline`, isolated from the user's existing worktree.

## Observed live proof

The fixture is a synthetic Chinese professional profile and chat for 林乔澄 at
the fictional 星桥实验室. No private browser page, production candidate or real
conversation was used. An isolated PostgreSQL container listened on 55640;
backend 4348 and Web 3048 used the real configured model provider. Chromium
loaded the actual unpacked extension and exercised its cookie-preserving Web
transport, session handshake, duplicate admission and receipt reconciliation.

| Observation | Readback |
| --- | --- |
| Page text submitted through extension | Task `12b8e151-73fd-4197-bce2-23284f65ff27` completed |
| Person created by real AI | `25afd169-1dfd-489e-b073-be83c29c1a6a` |
| Same request submitted twice | Same durable task, no second person |
| Reviewed image submitted through actual extension panel | Task `76824a20-8312-4eb9-852b-11d2e370c4f1` completed |
| Screenshot identity resolved | Same Person reused; context `68f1e016-f55a-438b-9ad2-c5339c3f8de0` |
| Screenshot source persisted | Capture `7d7efa89-46d7-44c5-b574-b7c711b89e24`; raw image GET 200, 19,337 bytes |
| Restart and provider 429 | Visible failed task resumed using its persisted image and original task ID |
| Result navigation | Actual workspace Person page displayed the same name and evidence |
| 390px viewport | No horizontal document overflow |

Text inference initially failed because GLM-5.3 forbids disabling thinking.
The separate versioned text-extraction prompt now uses enabled reasoning with
low effort. A second live finding was that a professional profile correctly
contains no chat messages. The text adapter now retains deterministic exact
document blocks rather than asking the model to fabricate dialogue. Dedicated
tests verify both behaviors and reject invented excerpts.

## Design decision

Two rendered directions were compared: A retains a left source list next to a
bounded reading panel; B moves the list above a wider reading area. A was chosen
because the active source remains visible while reviewing a long result, and
line lengths support evidence review. Mobile stacks the list above the result.
Light and dark themes use the existing neutral and vermilion system.

Local synthetic-only artifacts are under `output/web-capture-pipeline/`:
`direction-a-desktop-light.png`, `direction-b-desktop-light.png`,
`direction-a-desktop-dark.png`, `direction-a-mobile-light.png`,
`direction-a-mobile-dark.png`, `extension-reviewed-image.png`,
`person-readback.png`, and `proof-summary.json`. They are ignored runtime output,
not reusable private source fixtures.

## Deterministic checks

- Web suite: 364 passed, one intentionally skipped.
- Backend suite: 375 passed, 73 DB/environment-dependent tests skipped in the
  general run. The affected database suite ran separately: 11/11 passed,
  including restart, duplicate payload, changed payload, owner isolation,
  deletion, deleted-request replay and no-person completion.
- Agent provider/prompt suites: 9/9 passed, including exact source grounding.
- Extension contracts: 36/36 passed; unpacked packaging validation passed.
- Web/backend typechecks, Web lint, production Next.js build and `pnpm docs:check`
  passed. The build uses a build-only secret; runtime secrets come from Infisical.

## Boundaries and unproved surfaces

The native OS screen/window chooser is implemented with Chrome desktopCapture,
one frame and immediate stream shutdown. Its native permission dialog was not
automated in headless Chromium. Actual visible-tab capture on arbitrary remote
sites and a physical iOS device were not exercised in this evaluation. Extension
image upload, review, submission, storage and AI were exercised end to end.

The extension stores no durable raw draft and only requests the chosen HTTPS
workspace host when connecting. Capture source retention is 30 days; unsupported
ephemeral/full-source options are disabled. Deletion uses the governed capture
cascade; a person with no remaining source can also be removed, which the Web
confirmation discloses.

Local TestFlight deployment and final runtime revision are recorded in the
[implementation plan](../../../plans/web-capture-pipeline.md).
