# macOS Candidate Follow-up Companion — Evidence Safety Review

Date: 2026-09-01
Artifact: working-tree implementation after the Candidate Follow-up Companion
reset

```yaml
reviewer: evidence-safety-reviewer
lens: evidence integrity, privacy, and safe action
verdict: pass_with_changes
score: 3
confidence: direct
findings:
  - severity: medium
    criterion: external write integrity
    observation: The EventKit implementation has exact preview, an encrypted account-scoped operation capsule that survives relaunch, pre-write recovery identity, destination readback, outcome-unknown reconciliation, and verified removal, but the real provider loop has not been observed on an authorized Apple Reminders account.
    evidence: apps/macos/Sources/Services/EventKitFollowUpReminderService.swift, apps/macos/Sources/Services/ReminderOperationRecoveryStore.swift, passing AppModelSafetyTests/FollowUpReminderTests/ReminderOperationRecoveryStoreTests, and the native preview-only fixture artifact; no real EventKit receipt artifact exists.
    user_impact: Provider-specific permission, delayed-readback, rename, or sync behavior could still create recovery work even though the stubbed state machine is safe.
    recommendation: Run one authorized create/readback/remove loop plus permission denial and simulated response loss against a real list; retain only non-sensitive receipts.
    verification: The same approved proposal exists once, exact readback matches, denial writes nothing, uncertain write does not retry, reconciliation finds the object, and removal proves absence.
  - severity: medium
    criterion: uncertainty and conflict
    observation: The local compiler abstains on unsupported, retracted, quoted/forwarded, directly conflicting, confirmed-noncandidate, cropped-ellipsis, multi-speaker, recruiter/client-labeled, and expired-date text and exposes relative dates, tentative wording, speaker ambiguity, and multiple separate signals. Chinese-dominant and mixed WeChat-style input uses the same authority boundary; full-width Chinese speaker labels and strict Chinese dates are covered by abstention tests. Scope suggestion abstains when a visible name matches more than one available relationship. Native Vision tests cover generated screenshot reading order and a two-speaker no-action result; actual file-picker observation of a synthetic Mail layout also failed closed on surrounding-speaker noise. Broader authorized source-app layouts and a permissioned system-window run remain unobserved.
    evidence: apps/macos/Sources/Domain/ProvisionalFollowUpInsight.swift, apps/macos/Sources/Services/SystemWindowCaptureService.swift, apps/macos/Sources/Services/LocalFileTextExtractionService.swift, ProvisionalFollowUpInsightTests.swift, WindowTextRecognitionTests.swift, LocalFileTextExtractionTests.swift, and AppModelSafetyTests.swift.
    user_impact: A recruiter could see an incomplete provisional reading of a complex excerpt; the UI prevents it becoming confirmed state without later review, limiting but not eliminating confusion.
    recommendation: Keep the ontology narrow and add broader authorized chat-layout runs before treating OCR from files or selected windows as equivalent to reviewed selected text.
    verification: Same-name, cropped, group-chat, inverted-speaker, and expired-date inputs never produce a ready action without exact reviewed identity and current-time evidence; the same result holds on seeded local-OCR layouts.
strengths:
  - Selected input is explicit: text entry, one chosen/dropped local file, one system-selected window, or the user-invoked macOS Service; there is no clipboard polling or ambient monitoring.
  - Chosen image, PDF, and plain-text files are size- and derivative-bounded and processed locally. Unsupported files are not retained; raw bytes remain encrypted/local, and only a reviewed text derivative can later cross the Capsule boundary after separate attribution and scope decisions.
  - File extraction is transactionally staged. Clear, pause, stop, sign-out, or a newer explicit selection invalidates the active import, and a suspended-extractor test proves a late result cannot repopulate the Capsule after verified deletion. Raw bytes and derivatives are encrypted together and expire together.
  - The one-window picker has an in-panel accessible cancel action. Native observation and a suspended-capture unit test prove cancellation resumes without creating or retaining a Capsule item and returns a truthful zero-capture receipt.
  - macOS Services registration and enablement remain separate: the provider advertises modern and legacy plain text, while the app only opens Keyboard Shortcuts and tells the user where to enable it. It does not change the user's system preference.
  - Provisional output keeps source item, digest, capture time, exact evidence, modality, derivation version, unresolved state, and action proposal distinct.
  - The first-value surface names one action-controlling unresolved dependency while retaining every attribution, time, conflict, and relationship-history check under explicit progressive review. The compact view changes hierarchy only; it does not promote the dependency or hide a consequence gate.
  - Choosing a consequential action now replaces the full insight card with a focused review instead of appending governance below it. Exact source evidence and the editable proposed effect remain visible; exact Person/Pursuit, source author, duplicate owned action, destination, and final approval remain distinct gates.
  - Relationship selection invalidates an earlier destination preview but preserves the recruiter-edited reminder title and due time. Native interaction and a focused model test prove the authority-review transition cannot silently erase the proposed effect.
  - Quick source authority review asks `Who said this?` directly. Candidate attribution remains an explicit confirmation, while local-only handling, raw-source retention, and exact-term redaction remain available one privacy disclosure deeper.
  - Candidate attribution and Person/Pursuit scope are mandatory only at save/effect time and are independently reviewed.
  - Relationship selection exposes canonical milestone, target, evidence availability, open actions, and open gaps as read-only context. Existing recruiter-owned actions block reminder preview until the recruiter chooses reuse (zero EventKit calls) or explicitly confirms a separate reminder; unavailable preflight fails closed.
  - The isolated loopback native contract suite passed 5/5 against the real backend schema, including nested milestone evidence authority, exact seeded Pursuit selection, existing-action preflight, response loss, revocation, and immutable source-version boundaries with zero external effects.
  - Apple Reminders receives only the approved title, due time, destination, and a non-sensitive opaque recovery URL; exact conversation evidence is not written.
  - Permission is rechecked at execution, the recovery reference is verified before writing, success requires destination readback, response loss becomes unknown, and removal requires a second explicit decision plus absence readback.
  - The exact operation proposal and stage are AES-GCM encrypted in an account-partitioned, 30-day local recovery capsule. The conversation quote is excluded. An unfinished write restores as reconcile-only after relaunch, a verified write restores its exact reversal path, and a persistence failure blocks EventKit before any create call. An unreadable capsule remains outcome-unknown, blocks new writes and blind reconciliation, and can be cleared only through the account-scoped sign-out deletion path.
  - Every non-live AppModel defaults to a preview-only provider; only the explicit connected-workspace bootstrap constructs EventKit. The provider rejects destination preview, create, reconcile, remove, and removal reconciliation. Native Quick Panel observation reached the final destination gate, showed the preview-only explanation, and produced neither a Reminders permission prompt nor a system write.
  - Today hides exact candidate evidence by default; the Quick Panel exposes it only in the deliberate review surface.
  - Person/Pursuit matching is an unbound suggestion based on a visible unique name term; shared-name matches abstain and no suggestion mutates identity or scope.
  - System Mail handoff has an exact editable subject/body preview, opens with no recipient only on explicit action, and reports only an accepted composer-open request; it never claims delivery or send.
  - A native default-Mail observation matched the synthetic edited subject and body exactly, showed an empty recipient field and disabled Send control, and was discarded without saving.
  - Candidate follow-up, client clarification, meeting-question, and client-update purposes are composed into one local unsent editor. Switching purpose replaces only the local draft, does not mutate its evidence, and does not open Mail.
  - Communication drafts require a supported provisional signal and never fabricate fallback text. Exact source quotes remain in the evidence review and are not copied into outgoing draft bodies by default; the purpose itself recovers only with the account- and source-bound encrypted draft.
  - Chinese and Chinese-dominant mixed input changes presentation only: exact evidence, provisional status, unresolved state, and consequence gates remain separate. All four localized draft purposes exclude the exact source quote by default.
  - Unsent-draft recovery is bound to the source item, digest, account, expiry, and provisional compiler derivation version. A compiler-version mismatch clears the draft instead of restoring text generated under superseded interpretation rules.
  - Field-trial JSON contains only elapsed durations, enum judgments, action-proposed/edited/adopted booleans, and completed action kinds; privacy tests prove selected text, candidate name, pursuit, draft text, and external object identifiers are excluded.
  - Trial feedback remains absent from first value and appears only after a completed action or cancelled consequence review. The local summarizer rejects every field outside the schema-v2 allowlist and duplicate session IDs, then emits aggregates without session IDs or source content.
  - Reminder lifecycle events are append-only within a 100-event/30-day bound, partitioned by a one-way account digest, cleared on sign-out, and contain only an operation digest, state, and timestamp. Tests cover ordering, retention, bounded size, account isolation, and deletion.
  - Clearing or stopping sensitive conversation intake deletes the Capsule/draft but preserves any executing, verified, outcome-unknown, or removal-recovery reminder state in Needs your review. Sign-out separately clears both opaque provider recovery and the encrypted exact-operation capsule before deleting the account-scoped local key; deletion failure remains visible rather than being reported as absence.
  - Canonical Today reads current Pursuits and Proposals, ranks only work states (review, overdue/near owned action, open dependency), preserves evidence availability and date precision, and counts no-action Pursuits without assigning a person score or acceptance likelihood.
  - No candidate ranking, personality, protected-trait, culture-fit, or acceptance-probability field exists in the new path.
missing_evidence:
  - Real EventKit create, denial, response-loss, reconciliation, and removal artifacts.
  - An authorized live multi-Pursuit Today readback; projection logic and a labeled native layout fixture pass, but the fixture is not product-usefulness evidence.
  - An authorized live consequence-preflight readback immediately before reminder preparation; unit and synthetic loopback contract coverage prove mapping and fail-closed decisions, but the loaded canonical snapshot is not an authorized live-provider freshness claim.
  - The actual app shortcut and native Quick Panel accessibility tree were observed, but enabled invocation of the TextEdit selection Service, VoiceOver, and permission-change execution remain pending. The 200 percent and reduced-motion native render was inspected separately.
  - A permissioned real selected-window OCR run and broader authorized source-app layouts remain missing. Generated native Vision screenshots and an actual synthetic file-picker flow now prove reading order, useful first value, and multi-speaker no-action behavior; they are not user-authorized field evidence.
  - 5–8 authorized recruiter trials and comprehension/adoption evidence.
vetoes: []
open_questions:
  - Should copied drafts offer a conditional “clear clipboard” control after the recruiter finishes using them?
  - Should a relative date block destination preview entirely, or is the current explicit recruiter-selected exact date sufficient?
```

## Data and action inventory

| Object | Source and purpose | Storage and exposure | Retention/deletion | External authority |
| --- | --- | --- | --- | --- |
| Selected conversation text | Explicit text entry or user-invoked macOS Service; first-value review | Encrypted account-scoped Capsule in live mode; exact excerpt and SHA-256 digest in memory | Task end, 1 hour, or 24 hours; local clear/stop/sign-out paths delete recovery | None |
| Chosen screenshot or document | Explicit file picker or drop; local image OCR, bounded PDF text-layer extraction, or plain-text read | Raw bytes encrypted and local-only; exact text derivative and SHA-256 fingerprint in the Capsule; unsupported or over-25-MB files are not retained | Same Capsule controls; task-only by default | None until a separately reviewed text derivative crosses the visible Capsule boundary |
| System-selected window | macOS single-window picker, one frame, local OCR | Raw PNG encrypted and local-only; text derivative cannot leave until reviewed | Same Capsule controls | None |
| Provisional insight | Deterministic local compiler over newest reviewed text derivative | Memory only; source item, digest, capture time, exact evidence, modality, one primary unresolved dependency, derivation version, and complete review checks | Recomputed or cleared with source | None; explicitly not saved |
| Editable draft | Supported provisional insight, one of four explicit recruiting purposes, plus recruiter edits | Purpose, subject, body, and compiler derivation version in memory plus the encrypted account-scoped Capsule for recovery; copied to the general pasteboard only on explicit action; exact source quote is excluded from generated bodies by default | Same source TTL (one or twenty-four hours), source/digest/derivation mismatch, explicit discard, local clear, stop, or sign-out; pasteboard lifetime is system-owned | Copy only; never send |
| System Mail draft handoff | Exact recruiter-reviewed subject and body | Passed through a `mailto:` URL to the user’s default Mail handler with no recipient | Mail composer/system lifecycle after explicit open; Talent Signal retains only open status in memory | Opens an editable composer; no send authority |
| Reminder proposal | Recruiter-edited title/date plus reviewed destination, scope, attribution, and exact source evidence | Memory; raw evidence stays in Talent Signal | Replaced when source changes | Separate Approve and create decision |
| Protected reminder operation recovery | Source item/digest, edited title and due time, timezone, reviewed destination, exact operation stage, and optional verified receipt; conversation quote excluded | AES-GCM encrypted account-scoped Application Support file; plaintext is not exposed to UserDefaults | 30-day TTL; cleared when a local proposal is abandoned, removal is verified, or the current account signs out | Recovery only: unfinished write is reconcile-only and verified write restores its exact removal path; cannot approve a new write |
| Relationship consequence preflight | Loaded canonical Pursuit milestone, target, evidence availability, open recruiter-owned actions, and open gaps | Memory and read-only UI; no conversation text is added | Replaced on workspace/scope/source refresh or cleared on account boundary | No write authority; gates duplicate-action review only |
| Apple Reminder | Approved title, due time, list, opaque recovery URL | Apple EventKit; no raw quote, person ID, or source text | Removed only through explicit destructive confirmation and absence readback | EventKit write after permission check |
| EventKit provider recovery reference | Opaque operation key, destination ID, optional reminder ID, timestamp | Account-digest-partitioned UserDefaults; no title, due time, person, relationship, or evidence | Removed after verified destination removal or current-account sign-out | Provider duplicate prevention and exact reminder lookup only |
| Reminder lifecycle ledger | Opaque operation digest plus pending/verified/unknown/reconciled/removal state and timestamp | Account-digest-partitioned UserDefaults; no raw account, destination, reminder ID, title, due, person, relationship, or evidence | Newest 100 events, 30-day TTL, explicit current-account clear on sign-out | Audit/recovery explanation only; no retry or write authority |
| Field-trial session measures | Elapsed first-value/draft/scope/reminder/relationship/cancellation time, explicit understanding/evidence/reuse judgments, action proposed/edited/adopted booleans, and completed action kinds | Memory; copied as schema-v2 content-free JSON only on explicit action; no conversation, person, evidence, title, draft, relationship, destination, or external object content | Replaced on the next deliberate input or cleared with local/session state | Evaluation only; no product authority |

## Dimension scores

| Dimension | Score | Direct evidence |
| --- | ---: | --- |
| Identity/speaker binding | 3 | Candidate attribution and relationship scope gate reminder/save; unresolved speaker is visible before binding. |
| Provenance | 3 | Exact source span, source item, digest, capture time, modality, and compiler version are carried separately. |
| Uncertainty/conflict | 3 | No-signal, relative date, tentative wording, separate multi-signal, wrong-person, crop, group-chat, speaker-inversion, expired-date, conflict, and retraction paths are tested in English plus focused Chinese/mixed cases; generated native OCR layouts now prove reading order and a two-speaker abstention, while broader real source-app layouts remain field evidence. |
| User authorization | 3 | Editable exact fields and target list precede a separate approve decision; existing canonical actions require reuse/separate review, and removal has its own destructive confirmation. |
| External write integrity | 3 | Stable identity, pre-write recovery, permission recheck, exact readback, no blind retry, reconciliation, and verified removal are implemented and unit-tested. |
| Privacy lifecycle | 3 | Raw evidence remains encrypted/local and is not written to EventKit or recovery defaults; local deletion paths and bounded lifecycle-history tests pass. |
| Sensitive inference boundary | 3 | Limited operational ontology, no scoring/ranking/protected traits, fail-closed unsupported input, and explicit provisional state. |
| Evaluator reliability | null | No model-based evaluator is used in this local compiler path. |

The gate is `pass_with_changes`: no release veto is present in the inspected
path, but real EventKit/preflight proof, broader permissioned source-app OCR,
and authorized field evidence are required before claiming production or field
validation.
