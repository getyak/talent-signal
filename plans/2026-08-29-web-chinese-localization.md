# Web Chinese localization

## Outcome

Make Simplified Chinese the complete default experience across Talent Signal's
public website and authenticated web workspace, including visible copy,
metadata, accessibility labels, state language, and locale-sensitive dates.
The completed surface should remain coherent at desktop and mobile widths and
preserve every evidence, approval, and execution boundary.

## Scope

In scope:

- public website, relationship demo, research, privacy, login, and shared shell;
- authenticated Today, People, Pursuit, boundary, and evaluation surfaces;
- user-visible empty, loading, error, ambiguity, proposal, review, recovery,
  and deletion states reachable in the web client;
- Chinese document metadata, `lang`, font fallback, and `zh-CN` date formatting;
- focused tests and rendered desktop/mobile verification.

Out of scope:

- translating canonical repository documentation or source evidence authored
  in another language;
- changing API contracts, persisted enum values, identifiers, or external
  execution authority;
- translating brand names and channel names whose official form is Latin text.

## Current evidence and unknowns

- The root document and most public/workspace UI copy currently use English.
- Some synthetic evidence and the project-health brief are already Chinese.
- The worktree contains unrelated evaluation-platform changes, including web
  files; localization must be incremental and preserve those edits.
- The number of reachable state variants is large, so static text inventory
  must be paired with route and rendered-state verification.

## Approach

Use direct Chinese product copy in the existing components and small shared
formatting helpers where state/date labels repeat. Do not introduce a locale
switcher or a translation framework for a single requested default locale;
that would add architecture without improving the current outcome. Preserve
source quotations verbatim where they represent governed evidence.

## Milestones

1. **Complete — inventory and language foundation.** Map routes and user-visible
   strings, establish Chinese metadata, document language, typography, and
   locale helpers.
2. **Complete — public surface localization.** Translate the site shell, home,
   relationship demo, research, privacy, login, and all public interaction
   states.
3. **Complete — workspace localization.** Translate workspace navigation,
   Pursuit/People/Today flows, review gates, Agent controls, and reachable
   loading/error/recovery states without changing governed behavior.
4. **Complete — proof.** Run lint, typecheck, focused/full web tests, build,
   static English residue audit, and rendered desktop/mobile interaction checks.

## Completion evidence

- No unexplained English remains in reachable Chinese UI except brand/channel
  names, source evidence, email addresses, or technical identifiers.
- Root metadata and browser language report Simplified Chinese.
- Relevant web checks and production build pass.
- Rendered public and authenticated/demo routes show no clipping, horizontal
  overflow, inaccessible controls, or broken decision-state distinctions at
  desktop and mobile widths.

## Verification record

- `pnpm --filter @talent-signal/web typecheck` passed.
- `pnpm --filter @talent-signal/web lint` passed.
- Full web suite passed: 267 tests passed, 1 skipped.
- Production build passed with the required local verification `AUTH_SECRET`.
- `pnpm docs:check` passed.
- Browser verification passed at 1440 × 1000 and 390 × 844 for the public
  homepage, relationship experience, demo, and authenticated workspace. The
  checked pages reported no horizontal overflow and `lang="zh-CN"`.
- Remaining Latin text on verified screens is limited to brand/channel names,
  people or company names, technical identifiers, and governed source or
  account content that must preserve its original language.

## Direction-changing decisions

- A runtime language switcher or bilingual URL structure would expand this
  task beyond default Chinese adaptation and requires a separate product
  decision.
- If a route is an intentionally internal engineering artifact, translate its
  navigation and interaction chrome but preserve raw technical payloads.
