import { ApiError } from "../lib/apiError.js";
import { EnvironmentDoubaoVoiceTranscriber } from "../modules/voiceTranscription.js";

function silentWaveAudio(durationMilliseconds = 100): Buffer {
  const sampleRate = 16_000;
  const channels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const sampleCount = Math.ceil((sampleRate * durationMilliseconds) / 1_000);
  const dataLength = sampleCount * channels * bytesPerSample;
  const audio = Buffer.alloc(44 + dataLength);

  audio.write("RIFF", 0, "ascii");
  audio.writeUInt32LE(36 + dataLength, 4);
  audio.write("WAVE", 8, "ascii");
  audio.write("fmt ", 12, "ascii");
  audio.writeUInt32LE(16, 16);
  audio.writeUInt16LE(1, 20);
  audio.writeUInt16LE(channels, 22);
  audio.writeUInt32LE(sampleRate, 24);
  audio.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  audio.writeUInt16LE(channels * bytesPerSample, 32);
  audio.writeUInt16LE(bitsPerSample, 34);
  audio.write("data", 36, "ascii");
  audio.writeUInt32LE(dataLength, 40);
  return audio;
}

async function main(): Promise<void> {
  const transcriber = new EnvironmentDoubaoVoiceTranscriber();
  try {
    const receipt = await transcriber.transcribe({
      audioBase64: silentWaveAudio().toString("base64"),
      clientRequestId: "00000000-0000-4000-8000-000000000001",
      mimeType: "audio/wav",
    });
    console.log(
      `Synthetic voice provider probe passed: ${receipt.provider}/${receipt.model}.`,
    );
  } catch (error) {
    if (error instanceof ApiError && error.code === "VOICE_AUDIO_EMPTY") {
      console.log(
        "Synthetic voice provider probe passed: provider accepted silent WAV and returned no-speech.",
      );
      return;
    }
    throw error;
  }
}

await main();
