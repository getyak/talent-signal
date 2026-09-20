# Capture workspace craft

## Outcome and boundary

Make Sources a clear, composed place to add intentional material, follow its
processing, and inspect the resulting person and evidence. The user's supplied
live screenshot showed a redundant empty rail, weak upload affordance, excessive
unused space, and a form competing with its own instructions.

Scope: capture intake, inbox, task continuation, responsive composition and
accessible interaction. Preserve existing API, evidence, permission, retention,
identity review, and deletion contracts. No new persistence of private drafts,
automatic public research, or external effects. Global navigation is outside
this slice. Baseline: `d3f41992` in an isolated worktree.

## Design decision

Surface: desktop evidence intake and review for a relationship owner. Answer:
"Where do I put this source, and what happened to it?" Warm neutrals, readable
operational typography, one restrained primary action, minimal motion. Evidence
and internal filing remain distinct from confirmed facts and approved actions.

Compare two rendered empty-state directions before finalizing: a single intake
canvas and an intake canvas with an unboxed explanation rail. No empty inbox
column. Existing records enable the inbox/detail composition. Optional intent
and retention detail use progressive disclosure; public research remains an
explicit unchecked control. Render complete viewports, including real chrome.

## Milestones

1. Complete: render alternatives, implement intake/inbox states and safe
   attachment handling. Pi owns TSX and focused helper tests; parent owns CSS,
   visual comparison, integration, and delivery.
2. Complete: verify empty/populated/loading/error/ambiguous states,
   drag/paste/select/remove, text mode, unknown request retry, rapid navigation,
   keyboard, narrow viewport, dark mode, and increased text size.
3. In progress: independent review, applicable local and current-head CI gates,
   merge, deploy immutable Web release, and read back the exact Tailnet build.

## Evidence

- Runtime before changes: Web `7f57796d`, build `jarIfsVDWdKDbyMmC5lDD`.
- Test artifact root: `/private/tmp/ai-test-captures-craft.ZOWhwY`, managed by
  dev-storage-guard; preserve useful proof before removing temporary artifacts.
- Functional verification is separate from subjective craft judgment. No
  synthetic browser response will be claimed as a real provider completion.

## Durable prevention

After verification, record the narrow design-system rule that empty intake must
not reserve a second navigation column and that rendered, populated and empty
states are required acceptance evidence. Avoid expanding always-on guidance.

## Verification readback

- Rendered directions A/B at 1440 x 960: selected B, the intake canvas plus
  unboxed explanation rail. It anchors the work earlier and makes automatic
  internal filing understandable. Small screens keep a single intake column.
  These are subjective design observations, not a claim of user acceptance.
- Real component/browser harness: 21 checks passed for file validation,
  transactional rejection, scoped image paste, text paste preservation, mode
  draft preservation, removal, unknown admission retry with the same key,
  rapid double-submit prevention, stale selection, attention filters, deletion
  confirmation, new source, history error/loading, responsive widths,
  200-percent text, reduced motion, and no runtime errors. API data was synthetic.
- Web lint/typecheck passed; 783 tests passed, one existing skipped.
- Independent review closed overlapping history polls, stale selection during
  submit, primary-button contrast and selector precedence. No unresolved
  P0/P1/P2 findings. Button contrast is at least 4.54:1 across standalone and
  workspace light/dark themes.
- A raw production build correctly rejected missing AUTH_SECRET in the clean
  development environment. A build with a synthetic build-only secret passed; the immutable release build uses the existing
  Infisical-injected deployment script; no authentication fallback was added.
- Pi implementation stopped with provider HTTP 503 after writing its changes.
  Parent inspected, integrated, corrected, and independently verified them.
