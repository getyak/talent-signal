# Round 4 Web direct craft proof

## Outcome

The backend-owned Web slice is materially stronger and directly proven on
frozen synthetic TS-CORE-01 evidence. Six production defects were found and
fixed:

1. The capture handoff omitted the HTTP `Idempotency-Key` header.
2. Ephemeral retention removed the exact source immediately after proposal
   creation.
3. A long English/Chinese correction with a URL and unbroken token widened the
   390px document to 1675px.
4. The Web UI offered approval after an action-required fact was dismissed,
   although the backend correctly required confirmation.
5. Repeated links to the same source message did not reliably reopen and focus
   an already-active hash target.
6. Capability revocation rewrote an active approval as revoked, hid approval
   revocation, and could still offer approval before an approval existed.

The repaired implementation now binds the handoff packet and header, requests
`evidence_crop`, preserves the reviewed selected text under
`source-retention.v2`, wraps decision text, gates authority against the action's
exact `required_assertion_ids`, and reopens/focuses exact source figures.
Capability presentation now keeps the approval decision distinct from the
execution capability: revocation blocks approval and execution controls, while
an already-active approval remains visible and independently revocable.

## Direct proof

- The effective retention scope is `reviewed_selected_text`; source access is
  `available` until `2026-09-04T04:26:46.337Z`.
- Replaying the exact synthetic payload and key returned the original capture
  and receipt. Capture count, approval, effect attempt, exact source, and audit
  cursor did not change.
- The long mixed-language correction changed from document
  `clientWidth=390 / scrollWidth=1675` to `390 / 390`.
- A dismissed required fact leaves the evidence review readable but exposes no
  approval control.
- A changed preview invalidates prior approval; an unknown result blocks repeat
  execution until reconciliation; verified appears only after matched readback.
- Cancelled and repeated failed reads keep the prior verified state readable.
  Restart recovery creates no duplicate effect.
- Stable light and dark axe scans reported zero WCAG A/AA violations. Keyboard
  focus order, exact-source focus, visible focus, and reduced motion were
  directly exercised.
- Pure state regressions prove capability revocation suppresses approval,
  execution, and capability-dependent revision controls; an existing active
  approval remains visible with its revoke control and no result claim.
- Browser-visible requests stayed on localhost. No candidate contact or
  external write occurred.

## Score disposition

Only two dimensions move because Round 4 directly closes their prior exact
gaps:

- Evidence proximity: **97 → 98**
- Interaction and motion: **97 → 98**

All other accepted scores are preserved:

- Product specificity 99
- Narrative clarity 96
- Attention hierarchy 98
- Typography 96
- Spacing and rhythm 98
- Restrained color/state semantics 97
- Materiality 97
- Responsive composition 97
- Keyboard/focus/accessibility 97
- Loading/empty/error/recovery 99

Typography and responsive composition do not rise because native 200% Chrome
zoom is unproven. Keyboard/focus/accessibility does not rise because no real
screen-reader traversal was completed. Narrative clarity does not rise because
no uncoached first-use recruiter was observed.

The integrated journey remains **0**. XS-CAPTURE-01 stays active because visible
user-Chrome selected-text invocation, temporary browser scope, and pre-Submit
silence were not proven. No `chrome://` page was opened and no activeTab claim
is made.

## Gates and cleanup

Lint, 38 Web tests, direct typecheck, production build, core evaluation,
documentation/architecture checks, all specialist review contracts, the panel
contract, JSON parsing, and `git diff --check` pass. The first all-test run
timed out in the unchanged scrypt test under heavy machine load; the transparent
rerun passed, and the final suite passed all 34 tests after adding exact-packet
retry coverage.

The local Web server and isolated Docker project are stopped. The disposable
synthetic PostgreSQL volume was removed. The raw browser trace was also removed
because it contained a short-lived session cookie; only redacted evidence is
committed.

Detailed evidence:

- [Defect ledger](defect-ledger.json)
- [Retention and idempotency](browser/retention-idempotency.json)
- [Long-content responsive measurements](browser/long-content-responsive.json)
- [Continuous recovery](browser/continuous-recovery.json)
- [Accessibility and motion](browser/accessibility-motion.json)
- [Network boundary](browser/network-boundary.json)
- [Craft scorecard](web-craft-review.json)
- [Adjudicated panel](panel.json)
- [Command results](commands/command-results.json)
