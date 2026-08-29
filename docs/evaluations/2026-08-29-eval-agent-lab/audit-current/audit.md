# Agent Lab end-to-end experience audit

## Scope

Frozen current-worktree artifact `web-eval-agent-lab-2026-08-29-r2` in the Codex in-app browser. The run used fixture account `fixture-alpha`, the deterministic-safe provider, synthetic text, and a synthetic WhatsApp image. Desktop, 390×844, and 320×800 states were captured in this audit.

User goal: launch a bounded Agent quality case, understand whether the Agent behaved correctly, find the first meaningful mismatch, and retain exact evidence and execution receipts.

## Flow

1. **Enter Agent Lab — healthy.** The entry is discoverable, bounded-target labels are unique, provider capability is visible, and the expected terminal/tool receipt is shown before execution. Evidence: `01-start.jpg`.
2. **Prepare governed input — healthy with an important capability warning.** The selected image is visible by filename and size, but the case does not say whether the image is decision-relevant or merely trace-only. Evidence: `02-input-ready.jpg`.
3. **Run and inspect — mechanically healthy, semantically unresolved.** The Agent returns `no_action`, three expected tools, zero external effects, and complete lineage. The header says `ok` while semantic quality remains `needs_review`; the uploaded image contradicts the no-action text but was not interpreted. Evidence: `03-trace-result.jpg`.
4. **Read the result at 390px — degraded.** The page is 5903px tall and 408px wide inside a 390px viewport. The single needs-review item is surrounded by expanded passing mechanics and raw spans. Evidence: `04-mobile-trace.jpg`.
5. **Enter at 390px — mostly healthy.** The form reflows to one column, status is textual, and the primary action is clear. The fixed navigation reduces the available decision area but the flow remains operable. Evidence: `05-mobile-start-top.jpg`.
6. **Stress the result at 320px — failed.** The content remains 408px wide and is visibly cropped; this is not acceptable narrow-screen reflow. Evidence: `06-mobile-320-trace-top.jpg`.

## Highest-impact changes

1. Add a machine-checkable `input_capability_coverage` gate and semantic Eval case contract. A decision-relevant image must not silently coexist with `image_understanding=false`; fail or abstain before semantic quality can pass.
2. Replace the ledger-first result with an exception-first case verdict: Expected → Observed → Decision → Next test. Collapse passing mechanics and raw spans while keeping the complete receipt one disclosure away.
3. Remove the 408px min-content floor and verify vertical-only reflow at 390px, 320px, and 200% zoom.

## Evidence limits

This audit did not prove screen-reader behavior, keyboard-only traversal, localization expansion, dark mode, reduced motion, network failure recovery, retention aging, derivative deletion, live multimodal interpretation, held-out case performance, or recruiter-builder time savings.
