/** Local, synthetic website choreography. Never executes research or writes contacts. */
export type VisionPhase = 0 | 1 | 2 | 3;
export type VisionState = {
  phase: VisionPhase;
  playing: boolean;
  run: number;
  bridgeAvailable: boolean;
};
export const initialVisionState: VisionState = {
  phase: 0,
  playing: false,
  run: 0,
  bridgeAvailable: true,
};
export type VisionEvent =
  | { type: "start"; reducedMotion: boolean }
  | { type: "tick"; run: number; phase: VisionPhase }
  | { type: "visit"; phase: VisionPhase }
  | { type: "remove-bridge" }
  | { type: "reset" };
export function visionReducer(
  state: VisionState,
  event: VisionEvent,
): VisionState {
  switch (event.type) {
    case "start":
      return {
        ...state,
        phase: event.reducedMotion ? 3 : 1,
        playing: !event.reducedMotion,
        run: state.run + 1,
      };
    case "tick":
      if (
        !state.playing ||
        event.run !== state.run ||
        event.phase !== state.phase ||
        state.phase >= 3
      )
        return state;
      return {
        ...state,
        phase: (state.phase + 1) as VisionPhase,
        playing: state.phase < 2,
      };
    case "visit":
      return {
        ...state,
        phase: event.phase,
        playing: false,
        run: state.run + 1,
      };
    case "remove-bridge":
      return {
        ...state,
        bridgeAvailable: false,
        playing: false,
        run: state.run + 1,
      };
    case "reset":
      return { ...initialVisionState, run: state.run + 1 };
  }
}
export const visionSources = {
  identity: {
    kind: "synthetic-profile",
    handle: "maya-builds",
    connection:
      "Both the profile and project explicitly link the same synthetic handle.",
  },
  bridge: {
    kind: "synthetic-meeting-note",
    quote: "Maya and I built the first Atlas prototype together.",
    date: "2026-09-03",
    speaker: "Alex",
  },
  introduction: {
    kind: "proposal",
    confirmed: false,
    reason:
      "A former collaboration supports asking Alex, not assuming an introduction.",
  },
} as const;
