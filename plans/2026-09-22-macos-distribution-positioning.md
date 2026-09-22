# Relationship positioning and macOS distribution

## Outcome

Present Talent Signal as a relationship workspace for people, context,
commitments, and shared outcomes across client work, partnerships, collaboration,
and recruiting. Ship the native macOS workspace with the approved icon and a
repeatable Universal download/release path.

## Boundary

Preserve names, bundle identifiers, persisted schemas, historical research,
recruiting-specific examples, and evidence/action authority. The experimental
Tauri shell is not the everyday downloadable client. Downloads contain no
account credentials or private service addresses. Existing HTTPS workspaces and
account access remain required; a download does not make a private server public.

## Evidence and approach

- Frozen baseline: `d87d3049d3336ec62de011350ffe73ac894e10e3`.
- Primary checkout has unrelated edits; work is isolated in
  `codex/macos-distribution-positioning`.
- Native app lacks an AppIcon asset and a distribution workflow.
- Existing canonical Held Interval artwork is approved and will be reused.
- Local signing identities currently include Apple Development/Distribution,
  but no Developer ID Application identity. Preview packages must disclose that
  they are not notarized. Signed releases must fail closed without credentials.
- Another Pi writer is active; it will not be interrupted or bypassed.

## Milestones

1. Done: align current product descriptions and configure native identity.
2. Done: add Universal packaging, release gates, download/setup instructions, and
   discoverable release links.
3. Active: run focused Web/docs/brand and macOS checks; inspect packaged icon and launch.
4. Independently review, deliver the PR and downloadable preview, and read back
   published assets. Record signing and second-device limitations honestly.

## Completion evidence

Canonical and active public descriptions agree. Universal app includes an icon;
DMG/ZIP and SHA-256 manifest are generated. Release automation only publishes
verified revisions and labels preview/notarized states correctly. The installed
app opens the existing authorized workspace. Full other-device acceptance
requires a second authorized Mac; public onboarding requires separately available
public backend access and is not implied by package publication.

## Verification progress

- Native Release Universal app, DMG, ZIP, and checksums generated successfully.
- Native build/unit tests passed; UI tests compiled but not run automatically.
- Web suite: 1,148 passed, one existing skip; general speaker aliases tested
  without changing persisted candidate/recruiter wire identifiers.
- Docs, brand, lint, typecheck, and release-policy tests passed.
- Independent review closed both findings (canonical positioning and menu-bar
  accessibility). No confirmed P0/P1 remain.
- iOS has seven prepared label translations in a separate local patch; they
  are excluded from this macOS/Web delivery because merging them would trigger
  a separate TestFlight publication, which has not been authorized.
- Developer ID Application signing and a second-device session remain unverified.
