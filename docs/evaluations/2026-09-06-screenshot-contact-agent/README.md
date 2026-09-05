# Screenshot contact Agent delivery evidence

The working loop now performs real model-selected tools: screenshot extraction,
internal contact lookup/create/reuse, IM storage, source-backed analysis, public
search, content fetch, and sourced profile updates. The backend and Agent Host
are deployed on the local TestFlight service. This evidence uses synthetic chat
pixels and public professional sources; it is not a trial on private candidate
conversations or a measurement of general OCR accuracy.

## Observed cases

| Case | Observed result | Canonical readback |
| --- | --- | --- |
| New contact, WeChat fixture | Created Lin Siyuan, stored five proposed messages, returned findings and profile observations. | [API case](66da76aa-65b3-4d47-845f-4033d1b4997f.json) |
| Existing contact, same WeChat fixture through Web | Reused the same person, stored five messages for the new import, saved the visible recruiter title, rejected unrelated LinkedIn matches. Resume preserved the same capture and message count. | [Web reuse and recovery](87bb82aa-55be-480c-bcab-f661b849e515.json) |
| New contact, synthetic Andrew Ng demonstration through Web | Created the source-labeled contact, stored three demonstration messages, selected Exa LinkedIn search, fetched a public profile, and saved seven sourced observations. | [Web creation](435f073b-841d-4ef1-b001-2d2588880c5d.json) |
| Existing Andrew Ng demonstration through its contact page | Reused the same person and stored three messages; real search/fetch followed by company, role, and canonical public-profile URL updates. A failed attempt was resumed without duplicate IM writes. | [Final sourced update](3ef106a5-d0f2-41d3-b60e-52f1f03f13d6.json) |

The Andrew Ng screenshot is explicitly labeled as synthetic and does not imply
that he authored or participated in these messages. Its [HTML fixture](../../../apps/web/test/fixtures/contact-agent-public-profile.html)
and [screenshot bytes](../../../apps/web/test/fixtures/contact-agent-public-profile.jpg)
are reproducible test inputs.

## Interface and data verification

- Web import, history selection, resume, contact page, exact-source disclosure,
  archive confirmation, reload, and undo were exercised through the real browser UI.
- [Desktop contact page](contact-profile-desktop.jpg),
  [390-pixel mobile page](contact-profile-mobile.jpg), and
  [archive receipt](archive-receipt-mobile.jpg) are rendered artifacts. The mobile
  document width and scroll width were both 390 pixels; the viewport override
  was reset after testing.
- Database readbacks include actual contact IDs, capture IDs, message counts,
  proposed/unknown-actor evidence, independent profile observations, source
  hashes, provider identities, and tool outcomes. They are not model assertions
  that storage happened.
- Profile fields remain source statements or interpretations. Public-profile
  values are canonical cited URLs; source-body quotations do not need to repeat
  URL metadata. Short `public1` references resolve to durable source IDs outside
  the model. Repeated source text is excluded from active observation history.
- iOS single-image Send, task cards, task history, same-image recovery, and
  contact-page source cards compile in the actual Simulator target. The generic
  Debug Simulator build and localization checks passed. A new iOS/TestFlight
  binary was not uploaded, and this record does not claim a native UI trial.

## Focused checks

- Agent provider: five tests passed, covering actual function-call structure,
  model identity, bounded streamed responses, and sanitized failures.
- Agent Host: 18 tests passed for provider configuration, Exa search/fetch,
  platform dispatch, live TikHub envelope normalization, and scope boundaries.
- Real PostgreSQL: seven tests passed for create/reuse/idempotency, evidence
  provenance, cross-account denial, bad quotations, ambiguity, cancellation
  fencing, image recovery, archive/restore, expiry/revocation purge, malicious
  tool/private-query denial, and canonical URL/source-reference resolution.
- Backend and Web typechecks, targeted Web lint, native build, and iOS
  localization checks passed. Documentation checks accompany this report.

## Deployment

`./scripts/deploy/testflight-local.sh` migrated and restarted the actual local
TestFlight API and Agent Host. Both are healthy; Apple authentication, voice,
chat, loopback binding, and tailnet HTTPS probes passed. Migrations 047 and 048
are installed. The screenshot gate and sensitive-AI gate are enabled, with
`glm-5.3` and `glm-4.6v-flash` configured.

Docker Hub TLS metadata requests timed out twice. The new image was rebuilt
from the previously deployed local image, after verifying Node 24.19.0 and
pnpm 11.18.0, with the current lockfile and source compiled again. A Dockerfile
context allowlist excludes local dependencies, environment files, and unrelated
workspace data. The deployment script then used that newly rebuilt image with
`TS_TESTFLIGHT_REBUILD=false`. The [deployed-source readback](deployment-verification.json) matches the final
workspace implementation. The repository's normal upstream Dockerfile is
unchanged by this temporary base-image choice.

Exa and the replacement TikHub credential live in Infisical staging
`/agent-host`. The running API has neither key; the Agent Host has no database
credential. A live call from the deployed API through its Unix socket returned
two TikHub observations each for Douyin, TikTok, Weibo, and Threads, with zero
external effects ([live provider receipt](provider-live-verification.json)).
Credentials are absent from these artifacts.

## Review and limits

The model chose different tool trajectories and could revise rejected calls.
It sometimes returned no function call or exhausted its budget while correcting
citations; those attempts remained visibly partial and resumed in the same
task. This is a bounded Agent with real domain effects under an import grant,
not unrestricted autonomy or guaranteed one-attempt success.

An exact quotation check establishes provenance, not the truth of every
paraphrase. The initial demonstration included an incorrect speaker-side
description and an overly verbose public-profile value; those historical
receipts are preserved. Current prompts avoid role attribution and popularity
metrics, and source statements are downgraded to interpretation when their
wording is not directly quoted. Human-confirmed profiles remain unchanged.

Source-derived material expires after 30 days or is invalidated by source
correction/revocation/deletion. An import never grants deletion, identity merge,
iPhone Contacts, calendar, or messaging effects. Contact archive requires an
explicit current-target revision and has a durable restore receipt, verified
after refreshing the browser ([canonical archive readback](archive-restore-readback.json)).

The local proof app uses a disposable PostgreSQL instance on port 55537, API
4337, and Web 3007. It is a review environment; the real TestFlight database was
not populated with these demonstration contacts. The existing unrelated working
tree changes were preserved, and no commit was created.
