import { describe, expect, it } from "vitest";
import { briefReducer, initialBriefState } from "./marketing-demo";

describe("synthetic relationship brief", () => {
  it("requires an explicit review before confirmation", () => {
    expect(briefReducer(initialBriefState, "confirm").confirmed).toBe(false);
    const reviewed = briefReducer(initialBriefState, "review");
    const confirmed = briefReducer(reviewed, "confirm");
    expect(confirmed.confirmed).toBe(true);
    expect(confirmed.reviewing).toBe(false);
    expect(briefReducer(confirmed, "undo").confirmed).toBe(false);
  });
  it("invalidates pending and confirmed interpretations after source removal", () => {
    for (const state of [
      initialBriefState,
      briefReducer(initialBriefState, "review"),
      briefReducer(briefReducer(initialBriefState, "review"), "confirm"),
    ]) {
      const removed = briefReducer(state, "remove");
      expect(removed.sourceAvailable).toBe(false);
      expect(removed.confirmed).toBe(false);
      expect(removed.reviewing).toBe(false);
      expect(removed.historicalConfirmation).toBe(state.confirmed);
      expect(briefReducer(removed, "confirm")).toEqual(removed);
      expect(briefReducer(removed, "review")).toEqual(removed);
      expect(briefReducer(removed, "remove")).toEqual(removed);
    }
  });
  it("never restores confirmation authority when starting a new synthetic run", () => {
    const confirmed = briefReducer(
      briefReducer(initialBriefState, "review"),
      "confirm",
    );
    const restarted = briefReducer(
      briefReducer(confirmed, "remove"),
      "restart",
    );
    expect(restarted).toEqual({ ...initialBriefState, notice: "reset" });
    expect(briefReducer(restarted, "confirm").confirmed).toBe(false);
  });
  it("allows declining review without losing the source", () => {
    expect(
      briefReducer(briefReducer(initialBriefState, "review"), "cancel"),
    ).toEqual(initialBriefState);
  });
});
