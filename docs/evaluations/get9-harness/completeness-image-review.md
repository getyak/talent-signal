# GET-9 original-image completeness follow-up

Status: source-review correction and the new native trial passed independent
review. Earlier failures remain evidence. This is not overall
GET-9 acceptance. Baseline PR #172 merged as `65afe690`; the follow-up branch is
`codex/get-9-harness-completeness`.

## Requirement correction

Independent comparison with the original issue found that full-image input did
not implement local-region inspection or clear long-image tiles. Configurable
subagent interfaces also did not establish production delegation. The current
slice adds scoped image reads, a complete overlapping tile map, explicit profile
and comments kinds, and an independent screenshot-source-review SDK agent.
General file/code/browser execution and Memory-to-original-image acceptance
remain separate open requirements.

## Product evaluation correction

The initial product-evaluation predicate was insufficient: a child tool attempt
and any returned image do not establish that the child received original pixels.
The evaluator now correlates the child's `tool_use_id` with its successful
image-containing tool result, separately checks the returned marker/author,
and leaves semantic quality to independent review. Historical raw receipts are
preserved; their old `passed` flag does not override the quality findings below.

| Trial | Observed outcome | Independent conclusion |
| --- | --- | --- |
| [First](completeness-image-product-first.json) | SDK completed; product failed without understanding/terminal receipt | Failed, no person or external write |
| [Second](completeness-image-product-second.json) | Background child ran; SDK cancelled two root tools before Host hooks | Failed; host correctly reports missing product receipt |
| [Third](completeness-image-product-third.json) | Foreground child failed its image selection; main recovered and paused | Task completion 2, grounding 3, naturalness 3, recovery 3; independent source check not complete |
| [Fourth](completeness-image-product-fourth.json) | Child actually read pixels; product paused | Old predicate, not proof of the strengthened automated gate |
| [Fifth](completeness-image-product-fifth.json) | Child image receipt correlated; child quoted the original marker correctly | Task completion 3, grounding 2, naturalness 3, recovery not exercised; main promoted an overview misreading into a false source conflict |
| [Sixth](completeness-image-product-sixth.json) | Accurate native-pixel transcription; question contained four literal newline escapes and irrelevant injection/blank-height speculation | Quality failed; later corrections do not retroactively pass this receipt |
| [Seventh](completeness-image-product-seventh.json) | All 16 execution checks pass; child pixel receipt, marker and author verified independently; source expires correctly | Task completion 4, grounding 3, naturalness 3, recovery not exercised; meets this slice's applicable quality threshold |

Foreground delegation is now host-enforced inside the same Run and budget. The
SDK cancellations match a reported class of background-notification interruption,
but the precise internal cause is not independently established. See
[upstream issue #85408](https://github.com/anthropics/claude-code/issues/85408).
No schema, authorization, or budget was relaxed; trial three shows the model
repairing a strictly denied understanding input.

For scaled images, the main Agent is now explicitly instructed to use the
overview for locating content only. Quotes come from original-resolution views;
disagreement with a blurry overview requires a native-pixel recheck rather than
a fabricated second source. Trial seven independently verifies this correction
for the synthetic 700 × 9000 image. It completed in 35.611 seconds, preserved
Mira / VIEW-9aa82271 and Tao's exact words, and paused for identity clarification.
The reviewer deducted for redundant uncertainty notes and an unnecessarily broad
question about filing both authors; no filing or external action occurred.
This is one accepted scenario, not proof of general accuracy or recovery.

Latest deterministic checks: agent 169 passed / one explicit skip; PostgreSQL
screenshot/batch/profile 29 passed; independent Harness/adapter/pixel 30 passed.
The pixel suite includes EXIF orientations 2/5/6/7/8, an over-8k image overview,
40MP rejection, region identity and revocation. No stress-timeout proof is claimed.

## Evidence and limits

- Focused pixel/adapter tests: 6 passed. Long-image tiles cover all original rows;
  returned pixels match original coordinates, not generated image content.
  Bounds, integrity, format and revocation denial are exercised.
- Agent suite before the Task/Agent alias correction: 162 passed, one explicit
  skipped test. The suite after that correction also passed 162 tests with one explicit skip.
  After overview support, independent focused checks passed 24/24.
- PostgreSQL screenshot, batch and profile checks: 28 passed. New tests exercise
  queued reads after a terminal clarification and cancellation during pixel
  processing; final SDK usage bookkeeping remains available.
- The first PostgreSQL attempt had one test setup failure: the cancellation
  fixture omitted the required current revision. The fixture now reads the
  current task revision before requesting cancellation; production cancellation
  behavior and assertions were not weakened.
- [First live SDK attempt](completeness-image-sdk-first.json): actual image tile
  returned and its marker/author read correctly, but no delegation occurred.
  The original forbidden `Task` entry also removed the SDK's aliased `Agent`
  tool. This failed attempt is retained.
- [Second live SDK attempt](completeness-image-sdk-second.json): passed. The main
  Agent read original tile 2, invoked `screenshot-source-review`, and the child
  independently read that tile. The final interpretation preserved `comments`,
  the original marker and its author, then paused for contact clarification.
  Usage: 68,460 input and 2,217 output tokens; 35.553 seconds; no permission
  denials. This uses the real SDK and production adapter with synthetic host
  authority, not PostgreSQL or Web/iOS surface acceptance.

## Boundary

Images are read from already authorized immutable input bytes. No model paths,
URLs, shell or network input reach the pixel processor. Coordinates refer to
EXIF-oriented original pixels; receipts retain original image index/hash,
rectangle, transform and derived hash. Derived views remain in the ephemeral
SDK run, with no additional object storage or product-state image payload.
Questions with literal newline escapes are rejected before changing task state;
the SDK receives a narrow retry instruction. The PostgreSQL regression verifies
that the task remains running with no question and a corrected call succeeds.
The first new assertion incorrectly expected the pre-understanding tool hint to
include ask; that fixture assertion was corrected to inspect actual state.

The host serializes image reads against task transitions and checks running
lease/source authority before and after processing.

Whole-image overviews remain in context; long or large images are scaled to
fit provider input limits. The tile map makes clear overlapping original-pixel
regions available on demand. Independent review must verify that this fulfills
the original long-image requirement, and assess pixel/format/resource limits,
subagent permission boundaries and source lifecycle before delivery.

References: [sharp extraction](https://sharp.pixelplumbing.com/api-resize/#extract),
[constructor limits](https://sharp.pixelplumbing.com/api-constructor/),
[MCP image results](https://modelcontextprotocol.io/specification/2025-06-18/server/tools),
[SDK Agent/Task alias and delegation](https://code.claude.com/docs/en/agent-sdk/subagents).

## Actual Web original-image acceptance — September 12

[Web receipt](completeness-image-web-ui.json) passes 10 checks after an actual
file-chooser upload and submission. Main and source-review child independently
receive original bottom-region pixels and agree on the exact marker and authors.
The [visible question](completeness-image-web-ui.png) waits for owner selection;
no contact or external effect is created. Original HTTP bytes match the fixture.
[Independent quality](completeness-image-web-ui-quality.json) is 4/3/3, with no
recovery exercised. Child position estimates and extra identity speculation are
recorded limitations. Native and installed-extension proof remain separate.

## Actual native original-image trial — September 12

[Native receipt](completeness-image-ios-ui.json) passes ten execution checks:
actual Photos selection and Send, identical original bytes, main/child original
regions, both comments and the exact reference, and an owner question without
contact creation or external effects. The [visible question](completeness-image-ios-ui.png)
does not establish semantic acceptance.

[Independent quality](completeness-image-ios-ui-quality.json) is **3/2/3**;
recovery was not exercised. The main Agent initially guessed a slash, supplied
that guess to the child, and then saved its corrected reading as a source
ambiguity. The child's native-pixel result explicitly found clear text. There
was no main-Agent reread after that correction. The synthetic header was also
stored as irrelevant uncertainty. This repeats the fifth product trial's
failure class despite the existing prompt instruction.

The raw receipt and failed quality judgment remain unchanged historical
evidence. A new persistence-boundary correction and separate native trial are
required; reading the final identifier correctly does not pass this trial.

## Source-review boundary correction — September 12

New screenshot writes use structured region/field uncertainty while the stored
extraction contract remains compatible. Current-Run opaque native-read receipts
are bound to actual main/child identity by the SDK completion hook. Expected
answers and old child context are excluded from the host-built delegation
prompt. Optional child verification must complete; the main Agent then rereads
the same region before recording. Contradictory clear/uncertain assessments,
same-region guesses presented as source conflicts, and definite speaker/time/
identity fields with unresolved supporting readings are rejected before storage.
The host does not judge whether pixels are visually readable.

[Eighth trial](completeness-image-product-eighth.json) failed: SDK0.3.260 sends
the MCP content array to `PostToolUse`, while the initial adapter expected an
object. Reads remained unbound, repeated attempts exhausted the unchanged
token budget, and no understanding was stored. This intermediate-build failure
is retained. The adapter and tests now handle the observed array shape.

[Ninth trial](completeness-image-product-ninth.json) passes **15/15** execution
checks in43.247s. Real hook metadata identifies the child and its structured
review. A premature record fails; the main Agent rereads, records both correct
comments with no false uncertainty, and pauses for ownership. Original hashes
and expiry denial agree. [Independent quality](completeness-image-product-ninth-quality.json)
is4/4/3/3. Four recorded implementation hashes match the reviewed build.
This is synthetic HTTP/SDK/PostgreSQL proof; a new native trial remains required.

Independent review closed a P1 cross-field contradiction and P2 denied-delegation
side effect. Parent Agent suite211pass/one explicit skip; independent focused
checks35/35. The regression cases retain real source gaps and reader disagreement,
reject fabricated/other-reader/prior-Run receipts and reversed source indices,
and leave ordinary original-size images without mandatory child delegation.
Hook contract: [official SDK hooks](https://code.claude.com/docs/en/agent-sdk/hooks).

The [second native receipt](completeness-image-ios-ui-second.json) passes14/14
after a new actual Photos selection and Send. Original62,723bytes/hash agree;
the main Agent and child read the original document reference and both authors.
Stale-read and contradictory-uncertainty submissions are actually denied before
storage, followed by a fresh read and successful correction. The final task
waits for ownership with both comments and no source uncertainty, contact or
external effect. No manual record repair or iOS restart was used in this trial.
[Full viewport](completeness-image-ios-ui-second.png) and
[independent quality](completeness-image-ios-ui-second-quality.json) show4/4/3/3.
The remaining quality deductions concern repeated question text and extra calls.
Client buildbe7b2075 and current backend implementation hashes are separate in
the receipt. This closes this native scenario, not overall GET-9 delivery.
