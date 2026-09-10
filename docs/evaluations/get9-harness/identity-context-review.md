# GET-9 scoped identity and citation navigation review

Date: 2026-09-10. Reviewer: independent design_review agent.
Scope: the three-file uncommitted delta in `claudeChatProvider.ts`, its
adapter tests, and `CandidateSignalUITests.swift`. No product implementation
was edited by the reviewer; no model call or Simulator operation was started.

## Code conclusion

No new confirmed P0/P1 was found in this delta. The Memory result now carries
`identity_context` from the same host-provided authorized snapshot alongside
the requested `blocks`. The original block filter remains unchanged; the
addition does not search another person, load old Session text, change source
status, grant a write, or add a new persistence destination. Unscoped requests
still reject relationship context. Existing Harness checks validate source
authority before execution and before returning tool results. Identity means
the relationship owning the record; it does not make every mentioned actor the
contact or promote proposed statements to confirmed facts.

The independent command `pnpm --filter @talent-signal/agent exec vitest run
src/claudeChatProvider.test.ts` passed 10/10 tests. The new regression verifies
identity accompanies a history-only read and a nonexistent-type read, while
unrequested constraint content remains absent. This adapter test uses a fake
Harness and does not independently rerun source-revocation integration tests.

The new native helper selects a hittable evidence button inside
`ask-conversation`, then scrolls down for a target above the viewport and up
otherwise. The remaining citation-detail, review, dispute, stale-response and
exact-Pursuit assertions are unchanged. This corrects the observed first-match
failure: two blocks in one response cited the same source; the first occurrence
was above the viewport while the second was visible. It was not evidence that
all citation controls were inaccessible.

The helper is appropriate for this single-source fixture. It remains a
visible-evidence selector, not a general selector for one expected source in a
multi-source conversation. A future multi-source test should match its expected
source ID explicitly. No current fixture gate is weakened by this change.

## Retained failed observations

The prior traced live run at `/tmp/get9-ios-canonical-dispute-traced-final.log`
failed. Its SDK trace proves unique contact search/read, scoped Memory read and
citation selection succeeded. Its scoped prose nevertheless denied finding
Leila after reading history without identity; that semantic failure remains.

Read-only attachment export `/tmp/get9-review-dispute-traced` shows the first
citation at y=-126.3 and the second at y=246.3 within a y=180..760 conversation
viewport. The helper kept swiping up toward the bottom. No successful source
review or Pursuit navigation was established by that failed run, despite the
optimistic screenshot attachment names.

## Current native validation

The existing parent-run test at `/tmp/get9-ios-canonical-dispute-fixed.log`
failed after 78.863 seconds. The reviewer exported 73 attachments from its
completed `.xcresult` to `/tmp/get9-review-dispute-fixed` and inspected the
stale-response screenshot and accessibility hierarchy.

The visible citation was successfully tapped at 47.58 seconds; exact-source
detail opened, Mark disputed was tapped at 52.52 seconds, and the stale label
appeared at 54.34 seconds. The screenshot also shows “Source disputed · saved”.
The original citation-helper failure is closed for this observed run.

The fixed SDK trace carries Leila's authorized identity and completes scoped
Memory reading and citation selection. The answer names Leila and reports the
recorded availability. It still awkwardly describes the source report as not
promoted while the same availability already exists as a confirmed constraint;
this single run is not a general quality pass.

The first remaining failure is XCTest line 2672: the expected Open Pursuit
button does not exist. This is not another scrolling failure. After review,
the entire old response is replaced by one `restored-<taskID>` continuity block.
`RelationshipArchiveModels.swift:1001` constructs that safe placeholder when
saved response blocks are absent; no active-action target remains to render.
Existing backend session retraction tests require physical removal of derived
saved blocks when their sources become unavailable. The native observation
conflicts with the old test's assumption that stale source-derived answers
retain their Pursuit navigation link.

Do not restore withdrawn answer content to satisfy that assertion. If this
navigation remains a product requirement, resolve an independently authorized
canonical Pursuit/action link without reviving the old answer. The full
citation-to-Pursuit journey remains failed and requires an explicit resolution;
the current three-file delta introduces no confirmed P0/P1. Earlier real-model
failures and the interrupted full-suite denominator remain retained. No
full-suite or release-readiness claim is made here.

## Governed navigation test adaptation

The subsequent test delta explicitly requires the safe placeholder and absence
of the old answer's Pursuit link, then navigates through Today's button for the
exact fixture Pursuit ID. The fixture creates one action with the asserted
title. Canonical detail must retain that action and display “Originally
evidence-supported · Evidence unavailable”, while the misleading current
evidence-supported label remains forbidden. Removing the old deep-link-only
target marker is consistent with this changed entry path: production renders
that marker only when an action ID was supplied by a deep link.

This is an explicit adaptation to source-retraction semantics, not proof that
navigation from a withdrawn answer still works. It preserves the source-review
and canonical-state checks and adds a negative assertion against resurrecting
the old link. No production safety boundary was changed.

The reviewed `/tmp/get9-ios-governed-fixture-backend.mjs` substitutes a synthetic
Harness function. It invokes the adapter's search/read tools, derives person
and context IDs from actual search output, and calls the supplied authority
check before and after tools. The scoped branch reads supplied Memory and
selects its actual evidence IDs. Production HTTP routes, domain search/read,
Session handling, scoped context assembly and canonical active-action output
remain in use. It does not exercise the real SDK loop, subprocess, raw-input
hook, budgets or model reasoning; its fabricated terminal usage is fixture
output, not a measured SDK receipt. The fixed `Leila` query also means this
proves the configured journey, not language understanding.

The initial adaptation had a confirmed test-only P2: it tapped `ask-close`
after the conversation was already bound. That identifier belongs only to the
new-session header (`RelationshipAskView.swift:2628`); the prior completed run's
AX instead exposed navigation `BackButton`. The first governed run failed and
is retained at `/tmp/get9-ios-canonical-dispute-governed.log` and its `.xcresult`.

The subsequent change waits for and taps the actual `BackButton`, then requires
the relationship screen to disappear. The P2 is closed by source review and
the completed second governed run. Independent readback of
`/tmp/get9-ios-canonical-dispute-governed-second.log` confirms the same test
passed in 42.115 seconds, with one test, zero failures and `TEST SUCCEEDED`.
The reviewer exported its five screenshots to
`/tmp/get9-review-dispute-governed-second` and inspected the stale-response and
canonical-Pursuit screenshots.

Observed sequence: dispute at 29.69 seconds; stale label and closed source
detail by 32.61; safe placeholder and absent old link by 33.82; BackButton at
34.94; relationship page absent at 37.26; exact Today Pursuit
`886d2ae7-9c70-478c-952d-3f59891899b0` selected at 38.56; canonical detail at
40.44; original action title and unavailable-evidence assertions by 41.62.
The final screenshot shows the correct canonical detail page; the action and
evidence-status text were checked for accessibility existence below the
captured viewport, not separately proven visually visible in that screenshot.

Final bounded conclusion: no remaining confirmed P0/P1 in the reviewed delta;
the test-only P2 is closed. This run establishes the adapted deterministic
product journey through source dispute, safe answer retraction and independent
canonical navigation. It does not turn the earlier live-model failures into
passes, measure real SDK quality, or establish a complete native-suite pass.
