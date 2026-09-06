import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "./app.js";
import type { BackendConfig } from "./config.js";
import type { VoiceTranscriptionServing } from "./modules/voiceTranscription.js";

const config: BackendConfig = {
  allowedOrigins: ["http://localhost:3000"],
  appleSignInAudiences: ["com.talentsignal.app"],
  appleSignInEnabled: true,
  databaseUrl: "postgresql://synthetic-only",
  host: "127.0.0.1",
  passwordAuthEnabled: true,
  passwordRegistrationEnabled: true,
  port: 4317,
  retentionSweepIntervalMs: 60_000,
  sessionTtlSeconds: 28_800,
  simulatedAuthEnabled: true,
};

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("readiness rate limiting", () => {
  it("bounds repeated public database readiness probes", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          version: "032_eval_observability",
        },
      ],
    });
    const app = await buildApp({
      config,
      pool: { query } as unknown as Pool,
    });
    apps.push(app);

    for (let index = 0; index < 60; index += 1) {
      const response = await app.inject({
        method: "GET",
        url: "/health/ready",
      });
      expect(response.statusCode).toBe(200);
    }

    const limited = await app.inject({
      method: "GET",
      url: "/health/ready",
    });

    expect(limited.statusCode).toBe(429);
    expect(query).toHaveBeenCalledTimes(60);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("050_google_auth"),
    );
  }, 10_000);
});

describe("Talent Signal Lab capability policy", () => {
  it("returns a disabled manifest and performs no Lab read in a non-internal build", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          account_id: "30000000-0000-4000-8000-000000000001",
          account_slug: "fixture-alpha",
          user_id: "40000000-0000-4000-8000-000000000001",
          user_email: "recruiter@example.test",
          user_kind: "simulated_human",
          session_id: "50000000-0000-4000-8000-000000000001",
        },
      ],
    });
    const app = await buildApp({
      config: { ...config, internalLabEnabled: false },
      pool: { query } as unknown as Pool,
    });
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/v1/lab",
      headers: { authorization: "Bearer synthetic-session" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      capability: {
        enabled: false,
        canonical_write_access: false,
        external_effect_access: false,
        production_data_access: false,
      },
      scenarios: [],
      active_session: null,
      latest_run: null,
      eval_cases: [],
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("denies real experiments before reading experiment state when disabled", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{
      account_id: "30000000-0000-4000-8000-000000000001", account_slug: "fixture-alpha",
      user_id: "40000000-0000-4000-8000-000000000001", user_email: "reviewer@example.test",
      user_kind: "simulated_human", session_id: "50000000-0000-4000-8000-000000000001",
    }] });
    const app = await buildApp({ config: { ...config, internalLabEnabled: false }, pool: { query } as unknown as Pool });
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/v1/lab/experiments",
      headers: { authorization: "Bearer synthetic-session" } });
    expect(response.statusCode).toBe(403);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("denies feature configuration before reading override state when disabled", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{
      account_id: "30000000-0000-4000-8000-000000000001", account_slug: "fixture-alpha",
      user_id: "40000000-0000-4000-8000-000000000001", user_email: "reviewer@example.test",
      user_kind: "simulated_human", session_id: "50000000-0000-4000-8000-000000000001",
    }] });
    const app = await buildApp({ config: { ...config, internalLabEnabled: false }, pool: { query } as unknown as Pool });
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/v1/lab/feature-configuration",
      headers: { authorization: "Bearer synthetic-session" } });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: "LAB_CAPABILITY_DENIED" } });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("denies Lab mutation when the backend capability is disabled", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          account_id: "30000000-0000-4000-8000-000000000001",
          account_slug: "personal-ava",
          user_id: "40000000-0000-4000-8000-000000000001",
          user_email: "recruiter@example.test",
          user_kind: "password_human",
          session_id: "50000000-0000-4000-8000-000000000001",
        },
      ],
    });
    const app = await buildApp({
      config: { ...config, internalLabEnabled: false },
      pool: { query } as unknown as Pool,
    });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/v1/lab/sessions",
      headers: { authorization: "Bearer synthetic-session" },
      payload: {
        scenario_id: "ambiguous-identity",
        idempotency_key: "internal-lab-disabled",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: { code: "LAB_CAPABILITY_DENIED" },
    });
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe("voice transcription route", () => {
  const audioBase64 = (() => {
    const audio = Buffer.alloc(48);
    audio.write("RIFF", 0, "ascii");
    audio.write("WAVE", 8, "ascii");
    return audio.toString("base64");
  })();

  it("requires an authenticated account before audio reaches the provider", async () => {
    const transcribe = vi.fn();
    const app = await buildApp({
      config,
      pool: { query: vi.fn() } as unknown as Pool,
      voiceTranscriber: { transcribe } as VoiceTranscriptionServing,
    });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/v1/voice-transcriptions",
      payload: {
        audio_base64: audioBase64,
        client_request_id: "10000000-0000-4000-8000-000000000001",
        mime_type: "audio/wav",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("returns only an editable draft receipt from the authenticated provider", async () => {
    const transcribe = vi.fn().mockResolvedValue({
      client_request_id: "10000000-0000-4000-8000-000000000001",
      model: "bigmodel",
      provider: "doubao",
      provider_request_id: "20000000-0000-4000-8000-000000000001",
      status: "draft",
      temporary_audio_stored_by_talent_signal: false,
      transcript: "Prepare the smallest safe next step.",
    });
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          account_id: "30000000-0000-4000-8000-000000000001",
          account_slug: "synthetic-workspace",
          user_id: "40000000-0000-4000-8000-000000000001",
          user_email: "recruiter@example.test",
          user_kind: "password_human",
          session_id: "50000000-0000-4000-8000-000000000001",
        },
      ],
    });
    const app = await buildApp({
      config,
      pool: { query } as unknown as Pool,
      voiceTranscriber: { transcribe } as VoiceTranscriptionServing,
    });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/v1/voice-transcriptions",
      headers: { authorization: "Bearer synthetic-session" },
      payload: {
        audio_base64: audioBase64,
        client_request_id: "10000000-0000-4000-8000-000000000001",
        mime_type: "audio/wav",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "draft",
      temporary_audio_stored_by_talent_signal: false,
      transcript: "Prepare the smallest safe next step.",
    });
    expect(transcribe).toHaveBeenCalledWith({
      audioBase64,
      clientRequestId: "10000000-0000-4000-8000-000000000001",
      mimeType: "audio/wav",
    });
  });
});
