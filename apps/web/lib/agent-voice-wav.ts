const TARGET_SAMPLE_RATE = 16_000;

function mergeSamples(chunks: readonly Float32Array[]) {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const merged = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

export function downsampleVoice(
  chunks: readonly Float32Array[],
  inputSampleRate: number,
  targetSampleRate = TARGET_SAMPLE_RATE,
) {
  if (
    !Number.isFinite(inputSampleRate) ||
    !Number.isFinite(targetSampleRate) ||
    inputSampleRate <= 0 ||
    targetSampleRate <= 0 ||
    targetSampleRate > inputSampleRate
  ) {
    throw new Error("语音采样率无效。")
  }
  const source = mergeSamples(chunks);
  if (source.length === 0) return source;
  if (inputSampleRate === targetSampleRate) return source;
  const ratio = inputSampleRate / targetSampleRate;
  const output = new Float32Array(Math.floor(source.length / ratio));
  for (let index = 0; index < output.length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(source.length, Math.floor((index + 1) * ratio));
    let total = 0;
    for (let sourceIndex = start; sourceIndex < end; sourceIndex += 1) {
      total += source[sourceIndex] ?? 0;
    }
    output[index] = total / Math.max(1, end - start);
  }
  return output;
}

export function encodeVoiceWav(
  chunks: readonly Float32Array[],
  inputSampleRate: number,
) {
  const samples = downsampleVoice(chunks, inputSampleRate);
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, TARGET_SAMPLE_RATE, true);
  view.setUint32(28, TARGET_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0));
    view.setInt16(
      44 + index * 2,
      sample < 0 ? sample * 0x8000 : sample * 0x7fff,
      true,
    );
  }
  return buffer;
}
