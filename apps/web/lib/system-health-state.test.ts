import { describe, expect, it } from "vitest";

import { unavailableSystemHealth } from "./system-health";
import { reduceSystemHealth } from "./system-health-state";

describe("system health state transitions", () => {
  it("clears a previous observation when the workspace session expires", () => {
    const previous = unavailableSystemHealth();
    previous.status = "healthy";
    previous.components = previous.components.map((item) => ({
      ...item,
      status: "healthy",
    }));

    const result = reduceSystemHealth(
      { observation: previous, phase: "ready" },
      { type: "session_expired" },
    );

    expect(result).toEqual({ observation: null, phase: "session_expired" });
  });

  it("preserves a visible observation while an explicit retry is running", () => {
    const previous = unavailableSystemHealth();
    expect(
      reduceSystemHealth(
        { observation: previous, phase: "ready" },
        { type: "request_started" },
      ),
    ).toEqual({ observation: previous, phase: "ready" });
  });
});
