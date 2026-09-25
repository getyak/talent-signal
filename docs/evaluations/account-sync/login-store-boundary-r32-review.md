# Independent WK persistent-store probe assessment

**Accepted as bounded real-WebKit evidence.** The final run proves that separate persistent store identifiers isolate a late synthetic login cookie and that B survives the tested graceful shutdown/reopen. It does not close the product's stale-login response finding or validate its proposed coordinator/journal.

Read-only review of the final source, runner, binding, receipts, HTTP trace and preserved earlier failures. I did not execute, modify or clean any runtime/store. All **12 files listed in `binding.json` match their SHA256 values**, including the actual bundled executable used by `run.py`. Binding timestamp: `2026-09-25T04:23:02.603029+00:00`.

## What the final run establishes

| Boundary | Observed evidence |
| --- | --- |
| Shared-store negative control | Two WKWebViews use the same identifier. B finishes and its cookie-store read returns B before A is released. A then installs A; B's subsequent actual `/check` request sends A. The expected contamination is detected, not hidden by native callback filtering. |
| Separate-store isolation | A and B use distinct recorded identifiers. B is installed first; after the held A response really completes, A's jar contains A while B's jar and actual `/check` request still contain B. |
| Persistent reopen | `run.py` waits for the probe subprocess to end, then launches the bundled executable again with `--reopen`. The new process reconstructs B's recorded identifier, and both its cookie store and wire `/check` show B. The app bundle identifier is `com.talentsignal.AccountSyncStoreProbe.r32`. |
| Bounded cleanup | A third subprocess initializes a nonpersistent bootstrap WK view, removes exactly the three UUIDs in this run's prewritten `ids.json`, then enumerates stores. All removals return no error and all three identifiers are absent. Final probe/reopen/cleanup process exits are all zero. |

The decisive path is real WK loading, not an HTTP-client imitation: `Probe.swift:50–56` waits for A to reach the server hold, awaits B's `didFinish` and cookie read, releases A, then performs `/check` in B's WKWebView. `server.py:22–26` derives `X-Probe-Cookie` from the received Cookie header. URLSession is used only for the non-authenticating `/ready` and `/release` barrier. The trace records the two holds, six `/set`/`/check` responses, and one later reopen `/check`; its order agrees with the receipts. Holds last far less than the fixture's 30-second fallback, so this is not a timeout accidentally releasing A first.

The successful fixture explicitly returns `HttpOnly; SameSite=Lax; Path=/; Max-Age=3600; Expires=...`; recorded cookies are `isSessionOnly:false` in persistent stores. Probe source waits five seconds after recording the two cases, then uses `NSApplication.terminate`; reopen starts only after that subprocess exits. This is an observation under those exact conditions, **not a five-second durability guarantee** or proof of synchronous persistence at receipt time.

## Earlier failures remain part of the evidence

- `first-cli-run/reopen.json` reports `none/none`, despite the reopen process exiting zero. Its cleanup process exits `-11`; `cleanup-after-bootstrap.json` subsequently confirms successful removal/absence of those original three UUIDs. The parent reports the crash location in WebKit removal. The saved artifacts support the failed cleanup and later successful bootstrap workaround, not a general API requirement or a complete crash-root-cause diagnosis.
- `second-bundle-run/reopen.json` also reports `none/none` despite the proper bundle identifier. Its own three stores were successfully cleaned.
- The final attempt changes cookie persistence attributes and observation/termination conditions in addition to the initial CLI/bundle differences. Neither bundle identity alone nor a particular delay can be credited as the sole cause of success. Keep both failed runs; do not relabel them passed.

## Limits and one reusable-harness correction

This uses task-only, offscreen WK views, three disposable stores and synthetic values over loopback HTTP. It does not exercise production HTTPS/Secure cookies, real Auth.js/provider login, native receipt/cancel behavior, session refresh/logout races, app-window retirement, multiple app instances, selected-store registry migration, durable write-ahead ordering, abrupt termination or crash recovery. It does not copy credentials between jars. Cross-process graceful reopen is proved; recovery after a killed or crashed process is not.

**P2 runner risk for reuse:** `run.py:24–26` computes `passed` from receipt files alone, does not require all recorded process exits to be zero, and does not remove prior result/error files or bind each receipt to a new run ID. A future early failure could therefore reuse an old passing receipt. Before treating this as an automated regression gate, use a fresh run directory/ID, require the expected three successful processes and current-run receipts/UUIDs, and reject current-run errors/timeouts. No rerun is needed to accept this final observation: its fresh timestamps, exact matching IDs, live wire trace and three zero exits independently agree. The binding is artifact-integrity evidence, not a reproducible-build/source-to-binary attestation.

## Consequence for the proposed design

The active-store registry design now has experimental support for its **isolation primitive and graceful persistence**. The key causal argument is supported: after B is assigned a different identifier, a delivered old A response can alter only A's jar. Keep the proposal's remaining obligations unchanged: persist unresolved ownership before dispatch, select/persist B before loading it, retire every old host/epoch, never reselect quarantined IDs, and govern all primary-session writers. These are still product implementation and real-WK acceptance requirements; this probe does not implement them.

## Evidence hashes

| File | SHA256 |
| --- | --- |
| `binding.json` | `2a39d51b6a1c32abcfe6f9ad4956f628f7c7080790a9a00c903709d37e7eb457` |
| `Probe.swift` | `b62e154e94b7d9956b1f0401aa940caba0b74503e830b9c8bd8f65751c20313e` |
| `server.py` | `a5afab030250361f5bddadac50cb8d01ad3d2570b584239cdaa7cab574608ad9` |
| `run.py` | `f7368733557412df39cd1d88ff7199138234dc31aa72a6a8a8830eb2671d79c9` |
| `receipt.json` | `c1b9fea1b7a7bf8d35db408c20b20c44187c7a93c5807209d1936a2d8f09137e` |
| `reopen.json` | `1027dfb2fe9d19227fe33ad6fd7259b650d3be136bd38c6dae370f836deb73ac` |
| `cleanup.json` | `b0ec96ba3ac5b435747db762e8ac17ce995ffb39d405153861eca5f1b3b91fb5` |
| `http-trace.jsonl` | `144f5b467847608b35d7a952063f1cec7138eff311ead402f5a8e6c5e00cecc5` |
| `StoreProbe.app/Contents/MacOS/StoreProbe` | `4db12166c8ce7e067461d7d54dfc1b827950a66b93512d9095f51106c10f4b63` |

Only this assessment and a supplemental evidence note in the ownership proposal were written. Raw probe artifacts and earlier failures remain unchanged.
