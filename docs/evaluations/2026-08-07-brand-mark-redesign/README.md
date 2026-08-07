# Brand mark redesign evaluation

## Decision

Adopt **Held Interval** as the Talent Signal symbol.

The mark uses an incomplete ink stroke to hold the relationship field and a
short vermilion stroke to show a consequential change. Neither stroke closes
the field. The open intervals are intentional: the product can preserve and
surface evidence, but a person retains authority over meaning and action.

The **Causal Frame** challenger remains in the concept board. It expressed the
evidence-to-action seam more literally, but its orthogonal frame read too much
like a scanner, crop control, or document utility at small sizes.

## Evidence

- [Approved production assets](../../../brand/README.md)
- [Concept comparison](concepts.png) and its
  [editable source](concepts.svg)
- [Desktop before](before-desktop.png) and
  [desktop after](after-desktop.png)
- [Mobile before](before-mobile.png) and
  [mobile after](after-mobile.png)
- [Mobile dark mode after](after-mobile-dark.png)
- [Practical size check](icon-scale-check.png) and its
  [editable source](icon-scale-check.svg)

## Review

The previous three-bar mark behaved like a chart or audio-level icon and its
dark container became the heaviest item in the otherwise warm, editorial
navigation. The replacement removes that container, preserves the existing ink,
paper, and vermilion palette, and creates enough negative space to feel native
to the product rather than applied as a technology badge.

The result was observed on the running web product at desktop and mobile
viewports in both themes. The generated favicon was inspected at 32 pixels, the
browser-extension exports at 16, 32, 48, and 128 pixels, and the iOS asset at
1024 pixels. The mark remained recognizable without adding a separate small
size drawing.

No information architecture, marketing copy, product behavior, motion, or
external-write authority changed.

## Verification

- `pnpm brand:check`: 5 SVG sources and 20 PNG exports passed geometry,
  dimension, alpha-channel, runtime, and iOS parity checks
- `pnpm check`: passed the complete documentation, architecture, Web, backend,
  and production-build gate
- `pnpm lint`: passed
- `pnpm typecheck`: passed
- `pnpm test`: 23 files and 111 tests passed
- `pnpm build`: passed, including the generated `/icon` route
- browser-extension package validation: passed
- iOS Release build: passed
- iOS unit tests: 26 passed
- iOS UI tests: 13 executed, 0 failed, 3 backend-dependent scenarios skipped
  because their local service or fixture was unavailable

## Reconsider when

Revisit the symbol if unaided recognition repeatedly reduces it to a generic
letter `C` or loading ring, or if production printing shows that the two open
intervals close below the intended minimum size. Do not add detail merely to
make the mark more literal.
