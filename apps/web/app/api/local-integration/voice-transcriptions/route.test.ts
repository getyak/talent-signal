import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  isIntegrationModeMock,
  transcribeRelationshipVoiceMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  isIntegrationModeMock: vi.fn(),
  transcribeRelationshipVoiceMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/server/localBackend", () => ({
  isIntegrationMode: isIntegrationModeMock,
  transcribeRelationshipVoice: transcribeRelationshipVoiceMock,
}));

import { POST } from "./route";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";

function wavBytes() {
  const bytes = new Uint8Array(54);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  bytes.set(new TextEncoder().encode("WAVE"), 8);
  return bytes;
}

function request(
  file: File,
  origin = "http://127.0.0.1:3000",
  requestId = REQUEST_ID,
) {
  const form = new FormData();
  form.set("request_id", requestId);
  form.set("file", file);
  return new Request(
    "http://127.0.0.1:3000/api/local-integration/voice-transcriptions",
    {
      method: "POST",
      headers: { host: "127.0.0.1:3000", origin },
      body: form,
    },
  );
}

describe("composer voice transcription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isIntegrationModeMock.mockReturnValue(true);
    authMock.mockResolvedValue({ user: { id: "recruiter" } });
    transcribeRelationshipVoiceMock.mockResolvedValue({
      client_request_id: REQUEST_ID,
      model: "bigmodel",
      provider: "doubao",
      provider_request_id: "22222222-2222-4222-8222-222222222222",
      status: "draft",
      temporary_audio_stored_by_talent_signal: false,
      transcript: "Add Noor Vega for Design",
    });
  });

  it("returns only an editable transcript receipt for a bounded WAV", async () => {
    const result = await POST(
      request(new File([wavBytes()], "voice.wav", { type: "audio/wav" })),
    );

    expect(result.status).toBe(200);
    expect(transcribeRelationshipVoiceMock).toHaveBeenCalledWith({
      audio_base64: expect.stringMatching(/^[A-Za-z0-9+/]+=*$/),
      client_request_id: REQUEST_ID,
      mime_type: "audio/wav",
    });
    await expect(result.json()).resolves.toMatchObject({
      status: "draft",
      temporary_audio_stored_by_talent_signal: false,
      transcript: "Add Noor Vega for Design",
    });
  });

  it("rejects invalid audio before remote transcription", async () => {
    const result = await POST(
      request(new File([new Uint8Array(54)], "voice.wav", { type: "audio/wav" })),
    );

    expect(result.status).toBe(415);
    expect(transcribeRelationshipVoiceMock).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin recording before transcription", async () => {
    const result = await POST(
      request(
        new File([wavBytes()], "voice.wav", { type: "audio/wav" }),
        "https://attacker.example",
      ),
    );

    expect(result.status).toBe(403);
    expect(transcribeRelationshipVoiceMock).not.toHaveBeenCalled();
  });
});
