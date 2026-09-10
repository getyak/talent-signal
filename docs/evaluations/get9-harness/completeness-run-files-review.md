# GET-9 scoped file and computation follow-up

Status: backend execution, Web download, native Simulator file saving and
independent review pass. Browser capability and final follow-up delivery remain open.

## Real product trials

All trials use synthetic owned records, actual HTTP, Claude Agent SDK through
Hao, QuickJS/WASM in a child process, PostgreSQL and authenticated file readback.
The requested model is `anthropic/claude-sonnet-5`; the provider reports
`claude-sonnet-5`. Synthetic fixture setup is not autonomous ingestion proof.
The source contains randomized operands absent from the task objective.

| Trial | Observed result | Independent quality |
| --- | --- | --- |
| [First](completeness-run-files-first.json) | CSV produced for 6 + 19 = 25; canonical source readback failed because the fixture supplied an invalid locator | Failed |
| [Second](completeness-run-files-second.json) | All 15 checks pass in 21.716 s; 3 + 15 = 18, CSV download/hash and revocation verified | Task 4, grounding 3, naturalness 3, recovery 3 (limited trace) |
| [Third](completeness-run-files-third.json) | All 15 checks pass in 11.431 s; CSV contains 4, 13, 17; model hardcodes the total, so this proves VM file generation, not VM arithmetic | Unscored |
| [Fourth](completeness-run-files-fourth.json) | All 15 checks pass in 16.858 s; VM executes 3 + 13, saves 71-byte CSV and returns 16 with the exact citation | Task 4, grounding 4, naturalness 3, recovery 3 |

The second/third replies confuse a reviewed excerpt with a proposed relationship
state. The host now supplies actual excerpt-review and speaker-attribution status
separately from each Memory block's state. File-specific guidance explains that
distinction. Fourth-trial independent review confirms the confusion is resolved;
nonessential candidate-evaluation wording still costs a naturalness point.

Fourth-trial original permission-hook evidence records a rejected Chinese file
name, followed by a schema-compliant ASCII name with the same source and code.
No gate was relaxed. The model reads the source before entering its operands into
code; this does not establish a general automatic numeric parser. Fourth and
third retain complete original hook decisions. Earlier trials retain their
failures and more limited traces; do not infer missing recovery details.

## Verified boundaries

- A Run receives one host-created Memory JSON file. Arbitrary uploads, host paths,
  package installation, Node/Python/Shell and network access are unavailable.
  Source excerpts and speaker attributions must all be reviewed before admission.
- Model JavaScript runs in fresh QuickJS/WASM, with no host API bridge. Limits:
  16 kB code, 256 kB input, 64 kB output, 32 MiB VM memory, 256 KiB stack,
  two-second VM execution deadline, five-second child deadline and concurrency two.
  Returned promises and pending jobs are rejected; model-return JSON serialization runs in the VM; bounded host encoders produce
  the final CSV or formatted JSON.
- Generated TXT/CSV/JSON is staged until successful provider completion and final
  source validation. CSV cells are quoted and formula-looking strings escaped.
  Artifacts retain source IDs/hashes, not another copy of admitted source files.
- Artifact authority includes owner, manifest, source generation, image hash,
  session scope and consumed turns, prior Run, identity expiry and Lab state.
  Revocation purges file content and retires cached reply metadata, including
  filenames embedded in prose. Expired/revoked downloads fail closed.
- Web download binds to the current authenticated login, checks size/hash, then
  revalidates the artifact list before saving. View disposal or session loss
  cancels late downloads. iOS verifies bytes/hash and uses the system file exporter.

Independent review closed the QuickJS input-serialization and pending-job P2s,
artifact parent-authority and replay-retirement P1s, and Web late-download P1.
Final incremental review found no new P0/P1/P2.

## Verification and retained failures

Agent suite: 195 pass, one explicit skip. QuickJS boundary suite: 12/12.
PostgreSQL combined file/session/Lab checks: 24/24; latest file/session rerun after
review-status admission: 23/23. Web proxy/download checks: 7/7; lint and latest
typecheck pass. iOS SessionConversationClient tests: 7/7, including authenticated
path/no-cache and rejection of changed bytes. Latest backend build passes.

The initial memory-exhaustion fixture hit the CPU limit; a single allocation
larger than the unchanged memory budget verifies the intended memory boundary.
An attempted session-history mutation was correctly rejected by the public API;
a controlled synthetic database mutation tests the canonical retirement trigger.
An obsolete integration test called the former union operation; selecting the
current named search tool repairs the fixture without changing production code.
The first real trial's malformed source locator was repaired in fixture setup.

The first Web UI attempt on an older synthetic contact returned the visible
failure-recovery state after about 33 seconds and produced no downloadable file.
Its exact cause is not established by the retained product span. The old record
contains mixed review states; a separate owned, reviewed synthetic work-log
fixture is used for focused file-save acceptance. This failure is not counted
as a successful export.

[Web UI readback](completeness-run-files-web-ui.json) verifies the second attempt:
actual composer submission returns 17 in about 17 seconds, the generated-file
button downloads `gongshi_tongji.csv`, and the local Downloads file contains the
expected 5/12/17 rows. Its 71-byte size and SHA-256 match the active database
artifact. This proves the ordinary Web download path, not extension capture.

Local receipts include `/tmp/get9-run-files-pg-sixth.log`,
`/tmp/get9-run-files-pg-seventh.log`, `/tmp/get9-run-files-web-second.log`,
`/tmp/get9-run-files-ios-second.log`, and `/tmp/get9-ui-file-first-spans.jsonl`.
These temporary paths are supporting local evidence, not durable release assets.

## Native source-review recovery and system save

[Native UI receipt](completeness-run-files-ios-ui.json) verifies an actual signed
Debug Simulator task: inspect the exact authored 5/12 source, confirm its review,
retain the draft, explicitly Send again, receive the Chinese total17 answer, then
save the generated CSV through the iOS system exporter. The independently read
66-byte file contains5/12/17 and matches the canonical artifact hash.

The first attempts exposed three product defects: a review-required reply had no
saved turn and its review sheet dismissed; an applied review retained the old
ask idempotency key after revoking its cached reply; and the file view was absent
from the lazy conversation layout. The fixes bind temporary review readback to
its exact account/user/Session/scope, persist review plus matching-key retirement
atomically, and group answer/files in one list item with visible load recovery.
Approval never sends the retained draft automatically. Independent review closed
a remote-login omission, same-Session scope race and local-proposal file-entry
regression. Full native recovery regression passes107/107 before the layout
increment; latest metadata/admission regression passes9/9. Documentation checks pass.

The save uses an existing completed task reopened after the layout rebuild. The
restored Session has a needs-refresh notice; cross-device Session synchronization
is not accepted by this receipt. Earlier unsigned-build Keychain failure was
resolved with ordinary signed Debug deployment, not an application bypass.
Local logs: `/tmp/get9-ios-citation-recovery-fourth.log`,
`/tmp/get9-ios-artifact-layout-first.log`,
`/tmp/get9-ios-artifact-layout-second.log`.
