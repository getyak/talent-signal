import { randomUUID } from "node:crypto";

import { ApiError } from "../lib/apiError.js";

const DEFAULT_DOUBAO_BASE_URL = "https://openspeech.bytedance.com";
const DEFAULT_DOUBAO_RESOURCE_ID = "volc.bigasr.auc_turbo";
const DOUBAO_MODEL = "bigmodel";
const MAX_AUDIO_BYTES = 2_500_000;
const MAX_BASE64_AUDIO_CHARACTERS = Math.ceil(MAX_AUDIO_BYTES / 3) * 4;

export interface VoiceTranscriptionInput {
  audioBase64: string;
  clientRequestId: string;
  mimeType: "audio/wav";
}

export interface VoiceTranscriptionReceipt {
  audio_duration_ms?: number;
  client_request_id: string;
  model: string;
  provider: "doubao";
  provider_request_id: string;
  status: "draft";
  temporary_audio_stored_by_talent_signal: false;
  transcript: string;
}

export interface VoiceTranscriptionServing {
  transcribe(
    input: VoiceTranscriptionInput,
  ): Promise<VoiceTranscriptionReceipt>;
}

type DoubaoResponse = {
  audio_info?: {
    duration?: number;
  };
  result?: {
    text?: string;
  };
};

function requiredEnvironmentValue(
  environment: NodeJS.ProcessEnv,
  name: string,
): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new ApiError(
      503,
      "VOICE_TRANSCRIPTION_UNAVAILABLE",
      "Voice transcription is not configured on this service.",
    );
  }
  return value;
}

function doubaoBaseUrl(environment: NodeJS.ProcessEnv): string {
  const value = (
    environment.DOUBAO_ASR_BASE_URL ?? DEFAULT_DOUBAO_BASE_URL
  ).replace(/\/+$/, "");
  const parsed = new URL(value);
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "openspeech.bytedance.com" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new ApiError(
      503,
      "VOICE_TRANSCRIPTION_CONFIGURATION_INVALID",
      "The configured voice transcription endpoint is not allowed.",
    );
  }
  return parsed.origin;
}

function trimBase64Padding(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 61) {
    end -= 1;
  }
  return value.slice(0, end);
}

function isBase64AlphabetCharacter(characterCode: number): boolean {
  return (
    (characterCode >= 48 && characterCode <= 57) ||
    (characterCode >= 65 && characterCode <= 90) ||
    (characterCode >= 97 && characterCode <= 122) ||
    characterCode === 43 ||
    characterCode === 47
  );
}

function hasValidBase64Characters(value: string): boolean {
  const normalized = trimBase64Padding(value);
  const paddingLength = value.length - normalized.length;
  if (normalized.length === 0 || paddingLength > 2) return false;
  for (let index = 0; index < normalized.length; index += 1) {
    if (!isBase64AlphabetCharacter(normalized.charCodeAt(index))) {
      return false;
    }
  }
  return true;
}

function decodeWaveAudio(value: string): Buffer {
  if (value.length > MAX_BASE64_AUDIO_CHARACTERS) {
    throw new ApiError(
      413,
      "VOICE_AUDIO_TOO_LARGE",
      "Voice input is limited to one short recording.",
    );
  }
  const normalized = trimBase64Padding(value);
  if (
    value.length === 0 ||
    value.length % 4 === 1 ||
    !hasValidBase64Characters(value)
  ) {
    throw new ApiError(
      400,
      "VOICE_AUDIO_INVALID",
      "The voice recording is not valid base64 audio.",
    );
  }
  const audio = Buffer.from(value, "base64");
  if (trimBase64Padding(audio.toString("base64")) !== normalized) {
    throw new ApiError(
      400,
      "VOICE_AUDIO_INVALID",
      "The voice recording is not valid base64 audio.",
    );
  }
  if (audio.byteLength > MAX_AUDIO_BYTES) {
    throw new ApiError(
      413,
      "VOICE_AUDIO_TOO_LARGE",
      "Voice input is limited to one short recording.",
    );
  }
  if (
    audio.byteLength <= 44 ||
    audio.subarray(0, 4).toString("ascii") !== "RIFF" ||
    audio.subarray(8, 12).toString("ascii") !== "WAVE"
  ) {
    throw new ApiError(
      415,
      "VOICE_AUDIO_FORMAT_UNSUPPORTED",
      "Voice input requires a valid WAV recording.",
    );
  }
  return audio;
}

function upstreamFailure(statusCode: string | null): ApiError {
  switch (statusCode) {
    case "20000003":
    case "45000002":
      return new ApiError(
        422,
        "VOICE_AUDIO_EMPTY",
        "No speech was detected. Record a short phrase and try again.",
      );
    case "45000001":
      return new ApiError(
        400,
        "VOICE_TRANSCRIPTION_REQUEST_INVALID",
        "The transcription provider rejected the request format.",
      );
    case "45000151":
      return new ApiError(
        415,
        "VOICE_AUDIO_FORMAT_UNSUPPORTED",
        "The transcription provider could not read this audio format.",
      );
    case "55000031":
      return new ApiError(
        503,
        "VOICE_TRANSCRIPTION_BUSY",
        "Voice transcription is busy. Your text draft is unchanged; try again.",
      );
    default:
      return new ApiError(
        502,
        "VOICE_TRANSCRIPTION_FAILED",
        "Voice transcription did not return a usable draft.",
      );
  }
}

export class EnvironmentDoubaoVoiceTranscriber
  implements VoiceTranscriptionServing
{
  constructor(
    private readonly environment: NodeJS.ProcessEnv = process.env,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async transcribe(
    input: VoiceTranscriptionInput,
  ): Promise<VoiceTranscriptionReceipt> {
    if (
      this.environment.TALENT_SIGNAL_ALLOW_REMOTE_VOICE_TRANSCRIPTION !== "true"
    ) {
      throw new ApiError(
        503,
        "REMOTE_TRANSCRIPTION_NOT_ADMITTED",
        "Remote voice transcription is disabled on this service.",
      );
    }
    if (this.environment.VOICE_ASR_PROVIDER?.trim() !== "doubao") {
      throw new ApiError(
        503,
        "VOICE_TRANSCRIPTION_UNAVAILABLE",
        "Voice transcription is not configured on this service.",
      );
    }

    const appId = requiredEnvironmentValue(
      this.environment,
      "DOUBAO_ASR_APP_ID",
    );
    const accessToken = requiredEnvironmentValue(
      this.environment,
      "DOUBAO_ASR_ACCESS_TOKEN",
    );
    const resourceId =
      this.environment.DOUBAO_ASR_RESOURCE_ID?.trim() ??
      DEFAULT_DOUBAO_RESOURCE_ID;
    if (resourceId !== DEFAULT_DOUBAO_RESOURCE_ID) {
      throw new ApiError(
        503,
        "VOICE_TRANSCRIPTION_CONFIGURATION_INVALID",
        "The configured voice transcription resource is not allowed.",
      );
    }

    const audio = decodeWaveAudio(input.audioBase64);
    const providerRequestId = randomUUID();
    let response: Response;
    try {
      response = await this.fetchImpl(
        `${doubaoBaseUrl(this.environment)}/api/v3/auc/bigmodel/recognize/flash`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Api-App-Key": appId,
            "X-Api-Access-Key": accessToken,
            "X-Api-Resource-Id": resourceId,
            "X-Api-Request-Id": providerRequestId,
            "X-Api-Sequence": "-1",
          },
          body: JSON.stringify({
            user: { uid: appId },
            audio: { data: audio.toString("base64") },
            request: { model_name: DOUBAO_MODEL },
          }),
          signal: AbortSignal.timeout(45_000),
        },
      );
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        503,
        "VOICE_TRANSCRIPTION_UNAVAILABLE",
        "Voice transcription could not be reached. Your text draft is unchanged.",
      );
    }

    const statusCode = response.headers.get("x-api-status-code");
    if (!response.ok || statusCode !== "20000000") {
      throw upstreamFailure(statusCode);
    }
    let payload: DoubaoResponse;
    try {
      payload = (await response.json()) as DoubaoResponse;
    } catch {
      throw upstreamFailure(statusCode);
    }
    const transcript = payload.result?.text?.trim();
    if (!transcript) {
      throw new ApiError(
        422,
        "VOICE_TRANSCRIPT_EMPTY",
        "No spoken words were returned. Record a short phrase and try again.",
      );
    }

    return {
      ...(typeof payload.audio_info?.duration === "number"
        ? { audio_duration_ms: payload.audio_info.duration }
        : {}),
      client_request_id: input.clientRequestId,
      model: DOUBAO_MODEL,
      provider: "doubao",
      provider_request_id: providerRequestId,
      status: "draft",
      temporary_audio_stored_by_talent_signal: false,
      transcript,
    };
  }
}

export const voiceTranscriptionLimits = {
  maxAudioBytes: MAX_AUDIO_BYTES,
  maxBase64Characters: MAX_BASE64_AUDIO_CHARACTERS,
} as const;
