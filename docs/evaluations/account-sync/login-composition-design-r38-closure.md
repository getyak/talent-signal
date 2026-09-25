# r38 composition design: closure review

**Verdict: all three r38 P1 findings and the r38 P2 clarification are closed at the design-contract level. No new P0/P1 was found within this bounded review.** The revised composition is internally consistent and sufficiently explicit to implement. This is design approval only; it does not accept the cancelled repair9 draft or establish production wiring, build, test or real-app completion.

## Scope and binding

- Reviewed file: `/Users/cubxxw/data/talent-signal-account-sync/docs/decisions/0021-primary-login-store-ownership.md`.
- Reviewed section: **Production composition contract**, lines 120–267, checked against the preceding ownership/persistence decisions and the stated acceptance limits.
- Reviewed SHA256: `18fb3096d2cec90dd61a2833d01a1a19d5bf35ae7fd6ca9eba6f82f34d394bb3`. The source was read back and remained unchanged after this review.
- Prior report preserved: `login-composition-design-r38-review.md`, SHA256 `bc488c77cc7534d720fb5ce90101c8353dd454963e1b524a3ac3e5967c485ceb`.
- No implementation source, moving Pi worktree, installed preferences, registry, database, native application or Simulator was inspected or operated. No build or tests were run. Only this closure report was written.

## Finding closure

| Prior finding | Revised contract evidence | Assessment |
| --- | --- | --- |
| P1-1: a task-owned journal root does not isolate the WK cookie store | Lines 257–267 explicitly separate registry and globally identified WebKit storage. Disposable mode disables legacy adoption, allocates a fresh task-namespaced persistent UUID, permits reuse only from the task registry, prohibits installed selections/preferences/legacy UUIDs, and requires both isolated origin and root for unit TEST_HOST and UI runs before any WK view. | **Closed.** A different directory can no longer be treated as sufficient isolation. The test-specific rule is an explicit exception to ordinary production legacy adoption at lines 35–37. |
| P1-2: an automatic hidden-host redirect could acquire a lease and rotate foreground hosts | Lines 163–175 distinguish requesting entry from granting ownership. Only the application-selected visible foreground host without a conflicting live owner may automatically acquire first entry. Hidden/background hosts remain passive. Conflicting ownership requires deliberate user action; callbacks/history cannot synthesize that action. The coordinator validates host, current selection and reason before persistence. | **Closed.** The coordinator now makes an ownership decision rather than allowing the first redirect callback to win. This is consistent with explicit host registration and retirement at lines 154–159. |
| P1-3: a main-frame GET interception does not cover all login rendering | Lines 185–203 require an inert native login shell, a marker configured before the first request, document-start context, an owner-only presentation boundary, route/history/BFCache/restoration rechecks, full-document fresh-entry transition, immediate revocation and the shared synchronous submission gate. | **Closed.** The before-input invariant is no longer delegated solely to navigation interception or provider clicks. Ordinary browsers retain their normal surface, and display metadata is explicitly not backend authority. |
| P2-4: status-result provenance and observation-to-settlement transition were underspecified | Lines 215–242 require primary-token validation, host-owned isolated WK-world execution in the owning main frame, an exact configured URL, same-origin credentials, no-store, redirect rejection, HTTP/MIME/schema validation, full captured lease/store and read generation at dispatch/completion. `observedActor` is separate from `settledEntry`; status alone cannot clear a possibly committing write. | **Closed.** The new mechanism preserves same-store cookie use without extracting credentials, and it agrees with the original actual-response-plus-readback requirement at lines 85–96. |

## Consistency of the resulting composition

One injected main-actor application coordinator remains the sole owner of registry/process-lock lifetime. A stable window host ID survives subtree replacement, while browser, WK view, controller, closures, anchors, observers and native representation are reconstructed together for the immutable store context. Failure remains an unavailable state rather than a temporary fallback or legacy-store reuse.

Entry requests, persisted lease grants, interactive login presentation, observed identity and settled installation are now distinct transitions. Automatic redirects cannot create ownership in a hidden host. A fresh entry persists before the replacement document and controls are exposed. Current/target credential settings continue to use their original logged-in store and do not invoke primary rotation. Retired callbacks cannot release or resolve a newer lease.

The status read has a concrete provenance boundary and cannot become a generic credential bridge. A password result that the host cannot observe remains conservatively unresolved; the design explicitly accepts that recovery limitation instead of claiming success from a route or decoded JSON. Disposable test bootstrap now isolates both metadata storage and the actual WK store identity before any host can be created.

## Remaining work: implementation and acceptance, not open design findings

The contract must still be enforced by the actual production composition. In particular:

1. Prove strict bootstrap arguments and effective isolated root/origin/UUID before constructing a test host, including rejection of installed-state adoption and invalid roots. “Task-owned” must be enforced for the effective canonical filesystem location, not inferred from an unvalidated string.
2. Prove two-host foreground/passive behavior, explicit takeover, whole-browser/controller reconstruction and stale callback fencing through the real host path.
3. Prove inert-before-ownership login presentation and the single-flight gate through direct/server/client/history/BFCache/registration/recovery entry, followed by genuine password/provider success and unknown-result recovery.
4. Prove the actual isolated same-store status read rejects redirects, malformed or stale responses and page-supplied metadata, and cannot settle an entry without its matching installation response.

These are the existing accepted design's implementation obligations. No additional architecture change or new P0/P1 is requested by this closure review. Full native/Web readiness and live provider acceptance remain unproven until the parent completes those checks on the repaired implementation.
