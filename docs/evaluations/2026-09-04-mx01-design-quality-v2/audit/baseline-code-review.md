# Baseline interaction-completeness review

Artifact: `mx01-direction2-baseline-2026-09-04`

This is a code-and-prior-artifact issue inventory, not the required current-run
visual audit and not a DQI score. The in-app browser tab was still showing its
pre-server connection failure, and the browser security boundary rejected a
programmatic reload of the local URL. The app server is now live, but no fresh
screen evidence is claimed here.

## Observed issues worth correcting before blind review

1. **High — fact rejection enters the wrong state.** “Not supported” sends the
   flow to an action-failure message (“The reminder could not be created”), even
   though no action was approved or attempted. This merges fact adjudication
   with execution state.
2. **High — consequential evidence controls are visually interactive but
   inert.** “Open exact source,” the dependency disclosure, and “Edit” do not
   change state. The main path therefore promises inspectability and correction
   without delivering it.
3. **Medium — the multi-stage decision loses orientation.** The UI names the
   local stage but offers no persistent source → fact → effect → outcome map,
   so the tray swap and result transition rely on memory.
4. **Medium — safe alternatives are incomplete.** “Ask one clarifying question”
   does not produce a reviewable draft, and the ambiguous-identity save path
   changes into an unrelated insufficient-date screen.
5. **Medium — interaction feedback is functional but generic.** Buttons have
   focus outlines, but no consistent pressed-state response; tray changes do
   not share one motion grammar; the executing state is the only meaningful
   micro-feedback.

## Implementation boundary

The next slice will fix only those interaction and state-integrity gaps while
preserving the selected Direction 2 layout, palette, typography, icons, and
human-approval boundary. It will not add a new route, automatic external write,
candidate ranking, or MX-02 feature.
