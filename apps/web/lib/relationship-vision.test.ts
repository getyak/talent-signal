import { describe, expect, it } from "vitest";
import {
  initialVisionState,
  visionReducer,
  visionSources,
} from "./relationship-vision";
describe("synthetic relationship vision boundaries", () => {
  it("requires an explicit start and stops after revealing the path", () => {
    expect(
      visionReducer(initialVisionState, { type: "tick", run: 0, phase: 0 }),
    ).toEqual(initialVisionState);
    let s = visionReducer(initialVisionState, {
      type: "start",
      reducedMotion: false,
    });
    s = visionReducer(s, { type: "tick", run: s.run, phase: 1 });
    expect(s.phase).toBe(2);
    s = visionReducer(s, { type: "tick", run: s.run, phase: 2 });
    expect(s.phase).toBe(3);
    expect(s.playing).toBe(false);
  });
  it("rejects late or duplicate timer callbacks after replay, cancellation and manual navigation", () => {
    const started = visionReducer(initialVisionState, {
      type: "start",
      reducedMotion: false,
    });
    for (const next of [
      visionReducer(started, { type: "reset" }),
      visionReducer(started, { type: "visit", phase: 2 }),
      visionReducer(started, { type: "start", reducedMotion: false }),
    ]) {
      expect(
        visionReducer(next, { type: "tick", run: started.run, phase: 1 }),
      ).toEqual(next);
    }
  });
  it("reduced motion reaches the same inspectable result without simulated waiting", () => {
    const s = visionReducer(initialVisionState, {
      type: "start",
      reducedMotion: true,
    });
    expect(s.phase).toBe(3);
    expect(s.playing).toBe(false);
  });
  it("replaying or visiting cannot restore removed evidence; only explicit fresh-demo reset can", () => {
    const removed = visionReducer(initialVisionState, {
      type: "remove-bridge",
    });
    expect(
      visionReducer(removed, { type: "start", reducedMotion: true })
        .bridgeAvailable,
    ).toBe(false);
    expect(
      visionReducer(removed, { type: "visit", phase: 3 }).bridgeAvailable,
    ).toBe(false);
    expect(visionReducer(removed, { type: "reset" }).bridgeAvailable).toBe(
      true,
    );
  });
  it("does not promote shared history into an introduction or resolve identity by portraits", () => {
    expect(visionSources.introduction.confirmed).toBe(false);
    expect(visionSources.identity.connection).toContain("explicitly link");
    expect(visionSources.bridge.speaker).toBe("Alex");
  });
});
