# Frozen native retrieval review input

Persona: an independent recruiter juggling several live searches, reopening the
right conversation/person on a phone. Scope is Sessions and People retrieval;
no candidate evaluation or external action is performed by these pages.

All ten PNGs are uncropped iPhone 17 / iOS 26.5 Simulator captures of the same
Debug build and synthetic workspace. The manifest records image and source
hashes. 01 is both sessions read. 02 marks Leila unread while retaining review
attention. 05 is Chinese dark with Leila read/needs review and Nia unread/no
review attention. 03/06 are People; 04 is a one-result filter. 07/08 are English
AX5 first viewports; 09/10 show subsequent scroll positions, not clipped exports.

Use only the unchanged rubric-v1.md in the parent directory and this round's
artifacts. Do not read previous reviews or plans. Score appearance independently;
no desired score is provided. Preserve full-screen shell in the judgment.

Behavioral evidence: 3 focused policy tests and 8 distinct native UI checks have
passing evidence across the implementation sequence. The final craft-r3-final
run checks People policy including a localized role query, compact People search,
and Chinese dark AX5 reduced-motion/menu access. craft-r3-tests passes long
People restoration, compact People search, and unread/attention composition.
Its AX5 height comparison exposed IEEE floating-point conversion of 44 points
as 43.99999999999997; the final check allows only 0.001 point numerical tolerance.
The menu remains a native 44-point frame and must be hittable. Earlier exact
search/filter/reset and long Sessions restoration checks also have passing
native evidence; their policies and handlers were not changed by this round.
Raw local evidence lives in /tmp/talent-signal-retrieval-v2/. Still images alone
do not prove behavior, VoiceOver conformance, or field usefulness.

CUA readback independently identifies Read session versus Unread, Review needed,
full person/context labels, and explicit menu commands. CUA Scroll Down exposes
the next session/person. No source evidence, identity, ordering, persistence, or
external-write authorization semantics were intentionally changed. The layout
fix uses the same global coordinates for visible rows and their List viewport.

Token-derived opaque text contrast: muted light 6.61:1, muted dark 10.45:1,
review attention light 5.09:1, review attention dark unread surface 5.07:1.
These are formula checks, not a full rendered accessibility certification.

Keep craft score (five categories, 100 total) separate from the specialist
behavior score (0–4). Missing evidence and remaining subjective deductions
must remain explicit. At most three highest-impact corrections.
