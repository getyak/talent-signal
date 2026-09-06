# Revised browser audit — 2026-09-04

Surface: MX-01 Direction 2 mobile prototype
Viewport: 393 x 852 CSS px
Prototype URL: `http://127.0.0.1:4173/?view=today`

Evidence captured this run:

- `audit/revised/01-today.png`
- `audit/revised/02-fact.png`
- `audit/revised/03-approval.png`
- `audit/revised/04-unknown.png`
- `audit/revised/05-verified.png`
- `audit/revised/06-ambiguous.png`
- `audit/revised/07-insufficient-ax5-dark.png`
- `audit/revised/08-no-action.png`

Observed improvements versus the earlier current-run capture:

1. Today and Session continuity is clearer.
   The Session now opens with a compact bridge that explains why the recruiter is here now, which reduces the "new screen, same facts, why?" gap.

2. Fact review reads as one governed decision unit.
   The tray now keeps two persistent guardrails visible: exact quote support and no write yet. This raises state comprehension without adding decorative chrome.

3. Source verification is easier to access and easier to trust.
   The exact-source toggle is now the full row, not a tiny icon target, and provenance chips keep speaker / fragment / session scope visible even when the detail list is collapsed.

4. Outcome states waste less vertical attention.
   Unknown and verified states now tighten bridge, panel, quote, and brief spacing so the result section arrives earlier in the viewport.

5. AX5 dark is calmer and more legible.
   The long mixed-script name wraps with less pressure, and the insufficient-evidence path stays readable without horizontal overflow.

Limits:

- This run confirms rendered behavior, not independent specialist agreement.
- The clean-tab console check was performed in a fresh browser tab because historical Vite dev logs remain attached to older tabs.
- No claim is made here that the artifact has passed the separate MX-01 human comprehension gate.
