# Native retrieval craft review

Status: complete. Third-round craft scores are mobile **97/100** and workflow **95/100**; relevant native and documentation checks pass.

## Scope and evidence

Sessions and People now share subdued search/filter controls. Read sessions and
People use a flat directory rhythm; unread sessions alone gain soft elevation.
A quiet unread label makes the elevation explicit. Session identity stays in
the same position across attention states. People show
name, professional headline, complete pursuit context, and role/recency without
competing arrows. Idle Lab chrome belongs on Today; active Lab context remains
visible across destinations.

At large text sizes, names and context occupy full-width rows. Navigation retains
complete labels; utility chrome uses bounded scale with large-content access,
while record text follows the selected Dynamic Type size. Search and filter
remain separate from the global Agent composer.

- [Frozen rubric](rubric-v1.md): five equally weighted craft criteria, unchanged
  after the first implementation.
- [Round 1](round-1/): eight native captures; mobile 80/100 and workflow 74/100.
  Both specialists requested changes. Original deductions are preserved.
- [Round 2](round-2/): ten captures, including crossed read/attention states,
  English AX5, Chinese dark, active filtering and subsequent scroll positions.
  Mobile 93/100; workflow 92/100.
- [Round 3](round-3/): ten fresh captures after reducing utility height/material
  emphasis, refining AX5 accessory alignment, and localizing role labels.
  Unread has a quiet visible label as well as elevation; Chinese role search
  also matches the visible label. Mobile 97/100; workflow 95/100.
- [Final adjudication](panel-result.json): optional low-priority refinements are
  retained. Both behavioral scores remain 3/4 with supported inference; the
  visual threshold does not raise them or certify field usefulness.
- [Verification chronology](test-summary.txt): preserves failed intermediate
  checks and successful corrections. Raw xcresult bundles remain under
  `/tmp/talent-signal-retrieval-v2/`.

These are synthetic iPhone 17 / iOS 26.5 Simulator records, not real candidate
conversations. Scores evaluate the supplied scenarios; they do not measure human
preference or establish broader accessibility conformance.

## Functional correction discovered during review

An almost hidden People row could become the remembered reading anchor because
List cells and the viewport used different coordinate references. A cold run
could still pass the old hit-testing assertion with only 1.667 points visible.
Row and viewport now use global coordinates and two-axis containment. The test
requires the full baseline row inside the List before checking restoration.
Long People and Sessions restoration checks pass; the final native run also
passes compact People search, localized role search and Chinese dark AX5/menu
checks. Search/filter/reset and read-state handlers,
plus three metadata policy tests, have passing evidence from the same work
sequence. The localized People query was rerun after its final policy change.

## Review method and boundary

Two fresh specialists independently inspect each frozen bundle with the same
rubric. They receive no requested grade or prior review. Craft scores stay
separate from behavioral 0–4 ratings; all deductions remain inspectable.
The panel uses mobile UX and recruiter workflow lenses. Evidence-safety and
selection-science panels are not selected: this slice changes retrieval
presentation and view geometry, not candidate assessment, source handling,
recommendations, retention, identity binding or external execution authority.
The source diff was checked against the repository review boundaries.

The native design references are [Apple accessibility guidance](https://developer.apple.com/design/human-interface-guidelines/accessibility)
and [Apple materials guidance](https://developer.apple.com/design/human-interface-guidelines/materials).
The project makes its own restrained material and utility-scaling choices;
there is no claim that Apple endorsed this interface or its review scores.

## Final direct previews

- [Sessions: unread plus review attention](round-3/02-sessions-unread-light.png)
- [People: normal type](round-3/03-people-light.png)
- [Chinese dark Sessions](round-3/05-sessions-dark-zh.png)
- [AX5 People: complete first record](round-3/08-people-ax5.png)

Remaining taste refinements concern the fixed composer's emphasis, AX5 context
hierarchy, light unread shadow spread, and explicit recency wording. These are
not hidden deductions or required fixes: the final panel accepts this bounded
slice while preserving them for a future human retrieval study. No deployment
or consequential external action occurred.
