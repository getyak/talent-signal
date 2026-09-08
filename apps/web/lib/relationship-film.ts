/** Playback policy for the synthetic homepage film. It grants no data authority. */
export const FILM_DURATION = 7600;
export type FilmIntent = "automatic" | "playing" | "paused" | "complete";
export function filmChapter(time: number): 0 | 1 | 2 | 3 {
  if (time < 1100) return 0;
  if (time < 2800) return 1;
  if (time < 4300) return 2;
  return 3;
}
export function filmCanAdvance(input: {
  intent: FilmIntent;
  inView: boolean;
  pageVisible: boolean;
  reducedMotion: boolean;
  motionOptIn: boolean;
  inspecting: boolean;
  sourceAvailable: boolean;
}) {
  return (
    (input.intent === "automatic" || input.intent === "playing") &&
    input.inView &&
    input.pageVisible &&
    !input.inspecting &&
    input.sourceAvailable &&
    (!input.reducedMotion || input.motionOptIn)
  );
}
/** Bound a frame after suspension; hidden wall time must not skip the discovery. */
export function advanceFilmTime(time: number, frameDelta: number) {
  return Math.min(FILM_DURATION, time + Math.max(0, Math.min(frameDelta, 64)));
}
