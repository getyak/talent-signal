import { describe, expect, it } from "vitest";
import {
  advanceFilmTime,
  filmCanAdvance,
  filmChapter,
  FILM_DURATION,
} from "./relationship-film";
const visible = {
  intent: "automatic" as const,
  inView: true,
  pageVisible: true,
  reducedMotion: false,
  motionOptIn: false,
  inspecting: false,
  sourceAvailable: true,
};
describe("relationship film playback policy", () => {
  it("automatically advances the first visible foreground visit without input", () =>
    expect(filmCanAdvance(visible)).toBe(true));
  it("separates environmental suspension from explicit user pause", () => {
    expect(filmCanAdvance({ ...visible, inView: false })).toBe(false);
    expect(filmCanAdvance({ ...visible, pageVisible: false })).toBe(false);
    expect(filmCanAdvance({ ...visible, intent: "paused" })).toBe(false);
    expect(filmCanAdvance({ ...visible, intent: "complete" })).toBe(false);
    expect(filmCanAdvance({ ...visible, intent: "playing" })).toBe(true);
  });
  it("requires explicit motion opt-in after reduced-motion preference", () => {
    expect(filmCanAdvance({ ...visible, reducedMotion: true })).toBe(false);
    expect(
      filmCanAdvance({
        ...visible,
        reducedMotion: true,
        motionOptIn: true,
        intent: "playing",
      }),
    ).toBe(true);
  });
  it("cannot resume into inspection or an unsupported relationship", () => {
    expect(
      filmCanAdvance({ ...visible, intent: "playing", inspecting: true }),
    ).toBe(false);
    expect(
      filmCanAdvance({ ...visible, intent: "playing", sourceAvailable: false }),
    ).toBe(false);
  });
  it("does not count hidden wall time or move backwards, and stops at completion", () => {
    expect(advanceFilmTime(3000, 120000)).toBe(3064);
    expect(advanceFilmTime(3000, -50)).toBe(3000);
    expect(advanceFilmTime(FILM_DURATION - 10, 16)).toBe(FILM_DURATION);
  });
  it("reveals the relationship before five seconds and preserves a final hold", () => {
    expect(filmChapter(0)).toBe(0);
    expect(filmChapter(2000)).toBe(1);
    expect(filmChapter(3200)).toBe(2);
    expect(filmChapter(4300)).toBe(3);
    expect(filmChapter(FILM_DURATION)).toBe(3);
  });
});
