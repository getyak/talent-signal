# macOS authentication implementation review, September 25

Status: failed initial implementation review; Pi repair 1 is running. This is
a historical counterexample checkpoint, not a release acceptance result.

Pi task `20260925-073216-41f71cc2` began from commit `25435d5f`. Independent
backend/Web and native reviewers found nine P1 issues and one P2. Parent read
the source and accepted the repairs. No candidate was integrated or deployed.

## Confirmed findings and evidence boundary

| Finding | Severity | Evidence |
| --- | --- | --- |
| Anonymous confirmation status client requires a missing bearer token | P1 | Actual prepare/authorize/JWT/LoginPage/ConfirmPage consumers; both provider paths stop before confirmation |
| Known Apple subject reserves an unverified email hint | P1 | Source confirmed; PostgreSQL counterexample required in repair |
| Credential/revision checks lack transaction locks; authenticated login omits a live initiating-session recheck | P1 | Source confirmed; exact concurrent-write schedules specified for repair |
| Native Settings link discards the rendered actor and revisions | P1 | Actual prepare transport uses B cookie and drops expected A scope; no database mutation claimed |
| System-browser Cancel calls the WK-pairing endpoint and changes no attempt | P1 | Actual endpoint, separate cookie jars; approved state remains |
| Old confirmation A mints a code for current cookie B | P2 | Actual completion endpoint; native state validation still protects accepting a mismatched callback |
| Old browser nil/error callback can cancel a newer operation | P1 | Native callback ownership source review |
| Native navigation completion/failure, timeout and recovery are disconnected | P1 | Native host/controller source review |
| Same-origin iframe source targeting the main frame can start auth | P1 | Native interception source review |
| Navigation/page/account lifetime does not retire stale callbacks | P1 | Native lifecycle source review; no backend-authority bypass claimed |

The [Web counterexample receipt](phase2-web-counterexamples-r18.json) retains
five failed assertions and sixteen unchanged source/dist hashes. Its backend
HTTP and provider boundary are controlled; it does not prove live OAuth, a real
PostgreSQL mutation, or native UI. Both reports and harness sources remain in
the task-owned artifact directory until final acceptance.

## Repair decisions

System-browser cancellation uses its own sealed attempt/state authority, exact
origin and immutable form reference, then an attempt/state-bound fixed callback
with `outcome=cancelled`, mutually exclusive with a code. Already consumed or
unknown outcomes must be reported truthfully. Both browser-attempt and WK-pairing
cookie cleanup must be attempt-specific, including delayed HTTP responses.

Native completion and failure events must share the production host's owned
navigation/generation policy, with a deadline through consume and visible fixed
login/settings recovery. Ambiguous consume never triggers automatic replay.

Repair 1 keeps the same task, session, provider and counters. The cumulative
reply limit was explicitly extended from 300 to 600 for these coupled changes;
no counters were reset. Pi remains responsible for implementation/local tests,
while parent retains independent review and actual provider/client acceptance.

The older-session current-identity reauthentication path in macOS Settings is
also incomplete: provider-only password/unlink proof still uses embedded Web
auth. Parent is designing that bounded continuation before further delegation.
