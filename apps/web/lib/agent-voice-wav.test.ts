import { describe, expect, it } from "vitest";

import { downsampleVoice, encodeVoiceWav } from "./agent-voice-wav";

describe("agent voice WAV", () => {
  it("downsamples browser audio to the bounded 16 kHz mono payload", () => {
    const source = new Float32Array(48_000).fill(0.25);
    const result = downsampleVoice([source], 48_000);
    expect(result).toHaveLength(16_000);
    expect(result[0]).toBeCloseTo(0.25);
  });

  it("encodes a valid PCM WAV without retaining a second audio store", () => {
    const buffer = encodeVoiceWav(
      [new Float32Array([0, 0.5, -0.5, 1, -1])],
      16_000,
    );
    const bytes = new Uint8Array(buffer);
    expect(new TextDecoder("ascii").decode(bytes.slice(0, 4))).toBe("RIFF");
    expect(new TextDecoder("ascii").decode(bytes.slice(8, 12))).toBe("WAVE");
    expect(new DataView(buffer).getUint32(24, true)).toBe(16_000);
    expect(buffer.byteLength).toBe(54);
  });

  it("rejects an invalid upsample request", () => {
    expect(() => downsampleVoice([new Float32Array([1])], 8_000)).toThrow(
      "Voice sample rates are invalid.",
    );
  });
});
