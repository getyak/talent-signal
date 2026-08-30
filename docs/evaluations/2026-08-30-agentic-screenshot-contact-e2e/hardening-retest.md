# Screenshot-to-contact hardening retest

## Scope

This 2026-08-30 retest closes the three implementation gaps observed in the
original authenticated Agentic run: unsafe same-name binding, a visible Wiki
control that silently depended on a non-empty Ask objective, and opaque
screenshot-provider readiness or network failures.

The screenshot fixture was synthetic and authorized. The browser analysis was
cancelled before commit, so it created no governed screenshot source, person,
contact, calendar item, message, or other external effect. The Wiki check did
publish one internal, scoped knowledge snapshot from already-authorized test
sources; that snapshot carries no fact-confirmation or external-effect
authority.

## Rendered checks

1. **Direct Wiki compile — pass.** On Robin Current, the Ask composer remained
   empty and `Ask Agent` remained disabled. Activating `Compile Wiki` published
   snapshot `df99b86c`, displayed four governed citations, and announced that
   fact review and external-action authority were unchanged. Evidence:
   `screenshots/09-direct-wiki-compile.png`.
2. **Same-name identity gate — pass.** A live provider analysis of the synthetic
   screenshot advanced to identity binding. Searching for Leila Hartmann
   returned four records without distinct stable identity clues. Every row was
   disabled, new-person creation was absent, review continuation was disabled,
   and the UI stated that the screenshot was not saved. Evidence:
   `screenshots/10-ambiguous-identity-blocked.png`.
3. **Forged commit — pass.** The server-boundary test submits a signed reviewed
   draft with a selected same-name person. The request is rejected after token
   acquisition and identity search; capture creation is never called.

## Provider recovery behavior

Admission now distinguishes disabled AI, disabled sensitive processing, and
missing provider credentials. Runtime failures distinguish provider timeout
(`504`) from provider network failure (`502`) while saying that no source was
saved. Screenshot traffic continues to require the dedicated
`TALENT_SIGNAL_OPENROUTER_PROXY_URL`; the application does not silently inherit
a general-purpose proxy for sensitive image processing.

## Remaining high-value cases

The hardening gate is complete for the observed defects. The next full-loop
proofs are corrected OCR through refreshed Wiki readback, applied-but-response-
lost idempotent reconciliation, and source revocation/deletion invalidation.
They remain explicitly tracked in `agentic-regression-matrix.md` rather than
being implied by this retest.
