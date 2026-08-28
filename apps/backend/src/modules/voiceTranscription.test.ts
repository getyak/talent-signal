import { describe, expect, it, vi } from "vitest";

import {
  EnvironmentDoubaoVoiceTranscriber,
  type VoiceTranscriptionInput,
  voiceTranscriptionLimits,
} from "./voiceTranscription.js";

const request: VoiceTranscriptionInput = {
  audioBase64: waveAudio().toString("base64"),
  clientRequestId: "10000000-0000-4000-8000-000000000001",
  mimeType: "audio/wav",
};

function waveAudio(): Buffer {
  const audio = Buffer.alloc(48);
  audio.write("RIFF", 0, "ascii");
  audio.writeUInt32LE(40, 4);
  audio.write("WAVE", 8, "ascii");
  audio.write("fmt ", 12, "ascii");
  audio.write("data", 36, "ascii");
  return audio;
}

function environment(): NodeJS.ProcessEnv {
  return {
    TALENT_SIGNAL_ALLOW_REMOTE_VOICE_TRANSCRIPTION: "true",
    VOICE_ASR_PROVIDER: "doubao",
    DOUBAO_ASR_APP_ID: "synthetic-app",
    DOUBAO_ASR_ACCESS_TOKEN: "synthetic-token",
    DOUBAO_ASR_BASE_URL: "https://openspeech.bytedance.com",
    DOUBAO_ASR_RESOURCE_ID: "volc.bigasr.auc_turbo",
  };
}

describe("Doubao voice transcription", () => {
  it("keeps remote transcription unavailable until explicitly admitted", async () => {
    const fetchImpl = vi.fn();
    const transcriber = new EnvironmentDoubaoVoiceTranscriber(
      {
        ...environment(),
        TALENT_SIGNAL_ALLOW_REMOTE_VOICE_TRANSCRIPTION: "false",
      },
      fetchImpl,
    );

    await expect(transcriber.transcribe(request)).rejects.toMatchObject({
      code: "REMOTE_TRANSCRIPTION_NOT_ADMITTED",
      statusCode: 503,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not treat the generic sensitive-AI gate as voice admission", async () => {
    const fetchImpl = vi.fn();
    const voiceEnvironment = environment();
    delete voiceEnvironment.TALENT_SIGNAL_ALLOW_REMOTE_VOICE_TRANSCRIPTION;
    voiceEnvironment.TALENT_SIGNAL_ALLOW_SENSITIVE_AI_PROCESSING = "true";
    const transcriber = new EnvironmentDoubaoVoiceTranscriber(
      voiceEnvironment,
      fetchImpl,
    );

    await expect(transcriber.transcribe(request)).rejects.toMatchObject({
      code: "REMOTE_TRANSCRIPTION_NOT_ADMITTED",
      statusCode: 503,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends one WAV payload with legacy app credentials and returns a draft", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          audio_info: { duration: 1_240 },
          result: { text: "  What changed in this search?  " },
        }),
        {
          status: 200,
          headers: {
            "X-Api-Status-Code": "20000000",
            "X-Tt-Logid": "synthetic-log-id",
          },
        },
      ),
    );
    const transcriber = new EnvironmentDoubaoVoiceTranscriber(
      environment(),
      fetchImpl,
    );

    const receipt = await transcriber.transcribe(request);

    expect(receipt).toMatchObject({
      audio_duration_ms: 1_240,
      client_request_id: request.clientRequestId,
      model: "bigmodel",
      provider: "doubao",
      status: "draft",
      temporary_audio_stored_by_talent_signal: false,
      transcript: "What changed in this search?",
    });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash",
    );
    expect(init.headers).toMatchObject({
      "X-Api-App-Key": "synthetic-app",
      "X-Api-Access-Key": "synthetic-token",
      "X-Api-Resource-Id": "volc.bigasr.auc_turbo",
      "X-Api-Sequence": "-1",
    });
    const body = JSON.parse(String(init.body)) as {
      audio: { data: string };
      request: { model_name: string };
      user: { uid: string };
    };
    expect(body.audio.data).toBe(request.audioBase64);
    expect(body.request.model_name).toBe("bigmodel");
    expect(body.user.uid).toBe("synthetic-app");
    expect(String(init.body)).not.toContain("DOUBAO_ASR_SECRET_KEY");
  });

  it("rejects unsupported bytes before contacting the provider", async () => {
    const fetchImpl = vi.fn();
    const transcriber = new EnvironmentDoubaoVoiceTranscriber(
      environment(),
      fetchImpl,
    );

    await expect(
      transcriber.transcribe({
        ...request,
        audioBase64: Buffer.from("not a wave file").toString("base64"),
      }),
    ).rejects.toMatchObject({
      code: "VOICE_AUDIO_FORMAT_UNSUPPORTED",
      statusCode: 415,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("bounds and validates base64 before decoding or contacting the provider", async () => {
    const fetchImpl = vi.fn();
    const transcriber = new EnvironmentDoubaoVoiceTranscriber(
      environment(),
      fetchImpl,
    );

    await expect(
      transcriber.transcribe({
        ...request,
        audioBase64: "A===",
      }),
    ).rejects.toMatchObject({
      code: "VOICE_AUDIO_INVALID",
      statusCode: 400,
    });
    await expect(
      transcriber.transcribe({
        ...request,
        audioBase64: "A".repeat(
          voiceTranscriptionLimits.maxBase64Characters + 1,
        ),
      }),
    ).rejects.toMatchObject({
      code: "VOICE_AUDIO_TOO_LARGE",
      statusCode: 413,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("maps silence to a recoverable no-speech response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "X-Api-Status-Code": "20000003" },
      }),
    );
    const transcriber = new EnvironmentDoubaoVoiceTranscriber(
      environment(),
      fetchImpl,
    );

    await expect(transcriber.transcribe(request)).rejects.toMatchObject({
      code: "VOICE_AUDIO_EMPTY",
      statusCode: 422,
    });
  });
});
