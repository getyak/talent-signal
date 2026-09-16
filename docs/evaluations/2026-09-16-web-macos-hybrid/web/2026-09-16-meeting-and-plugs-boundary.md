# M2 Meeting draft and Plugs boundary observation

## Identity and scope

- Implementation: `ba9c400f97a5f2848aaccc4dcdb47232787a41da`
- Platform: macOS 26.6, local Chromium Web surface, 1440 px and 390 px
- Backend: isolated local container and PostgreSQL fixture only
- Fixture: synthetic account, user, Session, chat tasks, and four meeting drafts
- External writes: none; calendar output was a downloaded ICS file only
- Production deployment: not run and not authorized
- Human design acceptance: `not_reviewed`

This observation covers the implemented Meetings/Plugs slice and exceptional
states. It does not claim that the full M2 milestone or TS-014, TS-020, TS-021,
TS-023, or TS-030 has passed.

## Observed browser behavior

1. Editing a meeting title and interval wrote revision 2 to the canonical
   MeetingDraft and rendered the canonical response rather than assuming the
   submitted values were accepted.
2. During a deliberate API outage, the page displayed an unsaved state and
   retained the exact idempotency key, expected revision, and content in
   session storage. After the API returned, retry produced one revision-2
   result and one operation receipt.
3. Preparing a calendar file displayed the explicit handoff state: the user
   must inspect and import the ICS in a calendar application. No connector or
   calendar event write was attempted.
4. A draft page was left open while its synthetic source task was retracted in
   PostgreSQL. A subsequent export re-read backend authority, blocked the stale
   content, removed the day from the active calendar projection, and displayed
   the source-unavailable state.
5. Plugs distinguished account login from Google Calendar authorization and
   from macOS capture capability. The page reported no calendar scope and no
   native capability instead of inventing a connected state.
6. The compact account menu opened through its accessible control. A 390 px
   light render, 390 px dark/reduced-motion render, and keyboard-focus state
   were inspected. Escape-to-close and focus return remain unobserved.

## PostgreSQL readback

After the browser sequence, direct readback from the isolated database showed:

| Draft | Status | Revision | Sensitive content |
| --- | --- | ---: | --- |
| synthetic draft 1 | `needs_review` | 2 | available |
| synthetic draft 2 | `needs_review` | 2 | available |
| synthetic draft 3 | `redacted` | 3 | title and source excerpt null |
| synthetic draft 4 | `needs_review` | 2 | available |

There were three edit operation receipts and zero retained list snapshots.
The final schema was also migrated into a separate fresh PostgreSQL database;
three integration cases passed, including negative direct-writer checks for a
cross-user draft, a cross-user operation receipt, and an impossible
`needs_review`/`dismissed_at` combination. That disposable database was then
removed.

## Automated verification

- Web: 97 test files passed, 1 skipped; 610 tests passed, 1 skipped.
- Backend: 57 test files passed, 10 skipped; 434 tests passed, 133 skipped.
- Agent: 27 test files passed, 1 skipped; 244 tests passed, 1 skipped.
- Fresh PostgreSQL MeetingDraft integration: 3 passed.
- Web and Backend typechecks: passed.
- Contracts and Agent typechecks: passed.
- Web lint: passed.
- Web optimized production build: passed with an explicit synthetic build
  secret and the isolated local backend URL; 39 static pages generated.
- `git diff --check`: passed.
- Independent review: no unresolved P0, P1, or P2 after the final exact-intent,
  relational-constraint, authenticated-rate-limit, and accessibility fixes.

The first build attempt without `AUTH_SECRET` failed closed as designed. The
successful build used a synthetic local build value; it is not deployment or
production-secret evidence.

## Render evidence

The browser capture API returned JPEG bytes, so the files use `.jpg` rather
than a misleading PNG extension.

| Evidence | Viewport | SHA-256 | Proves only |
| --- | --- | --- | --- |
| `screenshots/web-meeting-ics-1440.jpg` | 1440 × 1382 full page | `458a3665af7b5ad9dca63aac2a2c4fd52df145ed524c5e044eef2695f40ba8fa` | desktop Meeting layout and explicit ICS handoff |
| `screenshots/web-meeting-ics-390.jpg` | 390 × 2254 full page | `83cd5d7e0bf10831818957fe66cadb1199db0031a929b6379fc0bf1bacf29ee4` | narrow layout and bottom navigation |
| `screenshots/web-meeting-dark-reduced-390.jpg` | 390 × 844 viewport | `09ff48dce813bcdd85b9874c9b13a1e05e006850e929deea532cb0a8059d913d` | dark and reduced-motion media state at render time |
| `screenshots/web-meeting-source-revoked-1440.jpg` | 1440 × 1000 | `fcd4ba030b0a9c9f7da95abca7f0de401e5339c690823d1d055b6f6aaa440090` | visible stale-source export rejection |
| `screenshots/web-plugs-fail-closed-1440.jpg` | 1440 × 1000 | `c03abe0245bc2932182ce86c93ba788815a27b1f8d19a40706bd1873806bbe99` | truthful Web projection of unavailable scopes/capabilities |
| `screenshots/web-account-menu-1440.jpg` | 1440 × 1000 | `d85ca86ea0db12507fbe474d1dc52a2d1d1192132e7f2663dd22bb6688c21df0` | visible account menu open state |

Screenshots do not prove source authority, idempotency, connector enforcement,
native capability, or production behavior; those require their own boundary
observations.

## Gates deliberately not promoted

- TS-014 remains `not_run`: the complete existing-intent preservation and
  unchanged-meeting sequence was not executed at the required boundary.
- TS-020 remains `not_run`: one meeting derivative was invalidated, but the
  complete citation, confirmation, and legal-source refetch contract was not
  executed.
- TS-021 remains `not_run`: menu opening was observed; Escape close and focus
  return were not.
- TS-023 remains `not_run`: the real edit path recovered an exact operation
  identity and did not duplicate, but the entire operation family and unknown
  response matrix was not browser-executed.
- TS-030 remains `not_run`: the page correctly displays unavailable grants,
  but expired/revoked authorization and privilege escalation were not tested
  against an owning connector service.

The remaining M2 width, density, Chinese IME, 200% text, and route-wide
exception matrix also remains open.
