# Controlled Lab observation evaluation

Date: 2026-09-05. Scope: current authenticated-session opt-in observation over
an existing task-specific model trial. The proof uses a signed iPhone 17 Pro
Simulator app, a disposable loopback PostgreSQL database, synthetic identities,
and a deterministic provider fixture through the real product Agent adapter.
It does not establish external-provider quality, statistical power, online
assignment, TestFlight distribution, or production deployment.

## Outcome

Before activation, the tester freezes a test question, task configuration,
5–60 minute window, minimum unique-product-request count, product-adoption
success signal, fallback/failure guardrail, automatic stop threshold, and
rollback to the task default. The server includes that plan in idempotency and
compare-and-swap handling. A replayed product request returns its prior result
without creating another sample.

Normal product execution records configuration and bounded execution metadata,
then classifies the product outcome as accepted, fallback, failed, or
unverified. It stores no task body, generated answer, candidate evidence, or
hidden reasoning. Summaries keep provider execution distinct from product
adoption, expose missing outcomes, and always set `causal_claim_allowed` to
false. Reaching the configured adverse-outcome threshold stops the trial and
restores the default for the next task. Expiry, replacement, and manual stop
have the same rollback boundary.

The native screen presents the plan, active scope, descriptive summary, actual
execution receipt, explicit non-causal language, and an always-reachable return
to default action. A fixed confirmation remains visible after rollback.

## Evidence

- [Database proof](database-proof.json) records 28 passing deterministic checks,
  including frozen-plan validation, replay deduplication, guardrail stop,
  descriptive summary, and default restoration.
- [Native proof](native-proof.json) is the sanitized attachment emitted by the
  passing signed UI journey. It records the selected and actual configuration,
  one product outcome, the frozen plan, and the manual rollback receipt.
- [Review result](review.json) records the product, safety, and mobile boundaries.
- [Source proof](source-proof.json) fixes the hashes of the reviewed contract,
  backend, iOS, test, localization, decision, and plan files.
- `/tmp/talent-signal-lab-v2/controlled-observation-native-zh-20260905.xcresult`
  passed one 50.275-second Chinese native journey with zero failures or skips on
  iOS 26.5. Its six attachments cover configuration, activation, the normal
  product answer, actual execution, restored default, and sanitized proof.
- `/tmp/talent-signal-lab-v2/controlled-observation-ios-units-20260905-0349.xcresult`
  passed seven signed tests, including tampered-plan and causal-summary rejection.
- `/tmp/talent-signal-lab-v2/controlled-observation-database-proof.log` records
  the disposable database lifecycle and the 28-check result. The fixture made
  seven local provider requests and zero remote network calls.
- `/tmp/talent-signal-lab-v2/lab-swift6-warning-fixes-20260905.xcresult`
  passed 15 Fault and MetricKit tests after removing their Swift 6 isolation
  warnings.
- `/tmp/talent-signal-lab-v2/controlled-observation-release-final-20260905.log`
  records the final Release build. The compiled public device-Lab flag is `NO`,
  and the Lab Fault/MetricKit Swift 6 warnings are absent.

Early unsigned UI attempts remain negative evidence. They showed that an
unsigned build cannot exercise the signed app's Keychain recovery state. The
final journey used normal signing and an explicit Debug-only, launch-argument
reset for the Lab workspace test namespace. Later UI iterations moved execution
and summary evidence above the long configuration form and made rollback status
visible without scrolling.

## Remaining boundary

This completes controlled current-session observation for source and Simulator
delivery. It is not randomized, does not assign normal accounts, and does not
measure causal lift. Minimum samples describe coverage rather than statistical
power. A real provider was exercised in the earlier session-trial evaluation;
this slice proves the observation and rollback path deterministically. No
candidate data, external business write, build publication, or deployment
occurred.
