# Native feedback to frozen Lab replay

On 2026-09-07, the real iOS application completed correction, process restart,
server readback, private development case selection, explicit candidate selection,
and frozen replay against an owned disposable PostgreSQL database. The combined
Simulator run passed **40 tests, with zero failures or skips**: 10 feedback tests,
29 capture tests, and one end-to-end UI test.

The proof uses synthetic relationship text and an injected deterministic provider.
It does not establish model quality, human adjudication, release approval, or
media-path behavior. Real model, Opik, screenshot, and voice calls are disabled.

## Recorded evidence

- [Test summary](test-summary.json): exported directly from
  `/tmp/get11-feedback-final-r1.xcresult` on iPhone 17 Pro, iOS Simulator 26.5.
- [PostgreSQL API readback and provider inputs](postgres-proof.json): original
  execution, feedback before/after restart, private case, completed rerun, and
  all three provider requests. The original answer and both reruns have the same
  complete text-input hash and reference time. The optional empty `images` field
  is excluded only after asserting every request has zero images.
- [HTTP readback](transport-proof.json): exactly one feedback mutation, followed
  by successful authenticated reads. No feedback or case is supplied through
  launch arguments; the launch fixture contains authentication only.
- [Original answer](original-answer.png), [saved correction](correction-saved.png),
  [correction after restart](correction-restored.png),
  [private development case](private-development-case.png),
  [explicit candidate](explicit-candidate.png), and
  [completed frozen rerun](frozen-rerun-completed.png).

The stored feedback remains revision 1 and `adjudication: proposed`. Its case is
`private_business`, retains the original single configuration, and requires the
user to select a second configuration before running. The correction is retained
as an expectation proposal and does not enter the model input. The rerun records
zero business writes.

## Reproduction

Migrate a newly created, owned disposable database named `get11_proof`; do not use
an existing application database. Start the fixture from the repository root:

```sh
ANSWER_FEEDBACK_UI_DISPOSABLE=true \
ANSWER_FEEDBACK_UI_DATABASE_URL='<owned loopback PostgreSQL get11_proof URL>' \
pnpm --filter @talent-signal/backend exec tsx src/evaluation/startAnswerFeedbackProofServer.ts
```

The fixture binds only `127.0.0.1:4341`, requires the `postgresql:` scheme, rejects
URL query overrides, and supplies explicit fake/disabled providers. It generates
the original answer through the authenticated product API. Session timestamps
use the same second precision as the native encoder, preserving the server's
immutable-message checks.

Run with the machine's iOS automation lock and normal Simulator signing; disabling
signing prevents the authentication bridge from using Keychain:

```sh
xcodebuild test -project apps/ios/TalentSignal.xcodeproj -scheme TalentSignal \
  -configuration Debug \
  -destination 'platform=iOS Simulator,id=02B4F0C1-A92F-469D-9DCC-5ED13F119507' \
  -derivedDataPath /tmp/talent-signal-get11-ios-build \
  -parallel-testing-enabled NO -jobs 2 \
  -only-testing:TalentSignalUITests/AnswerFeedbackUITests/testCorrectRelaunchAndRerunFrozenPrivateCase \
  -only-testing:TalentSignalTests/AnswerFeedbackTests \
  -only-testing:TalentSignalTests/RelationshipCaptureTests \
  -resultBundlePath /tmp/get11-feedback-final-r1.xcresult
```

Use a fresh result-bundle path for another run. The UI test skips when its owned
fixture server is absent; this recorded run had no skips. The full build log is
`/tmp/get11-feedback-final-r1.log`. Backend type checking also passed with
`pnpm --filter @talent-signal/backend exec tsc6 --noEmit`.
