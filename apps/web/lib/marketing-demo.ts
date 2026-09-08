export type BriefState = {
  sourceAvailable: boolean;
  reviewing: boolean;
  confirmed: boolean;
  historicalConfirmation: boolean;
  notice: "none" | "confirmed" | "removed" | "reset";
};
export const initialBriefState: BriefState = {
  sourceAvailable: true,
  reviewing: false,
  confirmed: false,
  historicalConfirmation: false,
  notice: "none",
};
export type BriefEvent =
  "review" | "confirm" | "cancel" | "undo" | "remove" | "restart";
/** A local synthetic demonstration. It has no storage, model, or external-effect authority. */
export function briefReducer(state: BriefState, event: BriefEvent): BriefState {
  switch (event) {
    case "review":
      return state.sourceAvailable ? { ...state, reviewing: true } : state;
    case "confirm":
      return state.sourceAvailable && state.reviewing
        ? { ...state, confirmed: true, reviewing: false, notice: "confirmed" }
        : state;
    case "cancel":
      return { ...state, reviewing: false };
    case "undo":
      return { ...state, confirmed: false, reviewing: false, notice: "none" };
    case "remove":
      return {
        sourceAvailable: false,
        reviewing: false,
        confirmed: false,
        historicalConfirmation: state.confirmed || state.historicalConfirmation,
        notice: "removed",
      };
    case "restart":
      return { ...initialBriefState, notice: "reset" };
  }
}
