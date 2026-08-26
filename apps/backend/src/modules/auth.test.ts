import type { Pool, PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";

import type { BackendConfig } from "../config.js";
import {
  createAppleLoginChallenge,
  createAppleSession,
  createPasswordSession,
  registerPasswordSession,
  type AppleIdentityToken,
  type AppleTokenVerifying,
} from "./auth.js";
import { encodePasswordCredential } from "./passwordCredential.js";

const config: BackendConfig = {
  allowedOrigins: [],
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

function token(overrides: Partial<AppleIdentityToken> = {}): AppleIdentityToken {
  return {
    audience: "com.talentsignal.app",
    email: "recruiter@example.test",
    emailVerified: true,
    expiresAt: new Date("2026-08-25T00:00:00.000Z"),
    issuer: "https://appleid.apple.com",
    nonce: "expected-nonce-hash",
    subject: "apple-user-1",
    ...overrides,
  };
}

const request = {
  challenge_id: "10000000-0000-4000-8000-000000000001",
  client_label: "ios",
  identity_token: `${"x".repeat(120)}.token`,
  given_name: "Ada",
  family_name: "Lovelace",
};

describe("Apple authentication", () => {
  it("creates a short-lived challenge and stores only its nonce hash", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const challenge = await createAppleLoginChallenge(
      { query } as unknown as Pool,
      config,
      { client_label: "ios" },
    );

    expect(challenge.nonce.length).toBeGreaterThanOrEqual(32);
    const parameters = query.mock.calls[0]?.[1] as unknown[];
    expect(parameters[1]).not.toBe(challenge.nonce);
    expect(String(parameters[1])).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects a token whose nonce does not bind to the challenge", async () => {
    const pool = {
      connect: vi.fn(),
      query: vi.fn().mockResolvedValue({
        rows: [{ client_label: "ios", expected_nonce_hash: "expected" }],
      }),
    } as unknown as Pool;
    const verifier: AppleTokenVerifying = {
      verify: vi.fn().mockResolvedValue(token({ nonce: "different" })),
    };

    await expect(
      createAppleSession(pool, config, request, verifier),
    ).rejects.toMatchObject({ code: "APPLE_NONCE_MISMATCH" });
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("rejects a verified token issued for another app", async () => {
    const pool = {
      connect: vi.fn(),
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            client_label: "ios",
            expected_nonce_hash: "expected-nonce-hash",
          },
        ],
      }),
    } as unknown as Pool;
    const verifier: AppleTokenVerifying = {
      verify: vi.fn().mockResolvedValue(token({ audience: "other.app" })),
    };

    await expect(
      createAppleSession(pool, config, request, verifier),
    ).rejects.toMatchObject({ code: "APPLE_AUDIENCE_MISMATCH" });
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("rejects a challenge consumed by a concurrent or replayed request", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [] };
        if (sql.includes("UPDATE apple_login_challenges")) return { rows: [] };
        throw new Error(`Unexpected query: ${sql}`);
      }),
      release: vi.fn(),
    } as unknown as PoolClient;
    const pool = {
      connect: vi.fn().mockResolvedValue(client),
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            client_label: "ios",
            expected_nonce_hash: "expected-nonce-hash",
          },
        ],
      }),
    } as unknown as Pool;
    const verifier: AppleTokenVerifying = {
      verify: vi.fn().mockResolvedValue(token()),
    };

    await expect(
      createAppleSession(pool, config, request, verifier),
    ).rejects.toMatchObject({ code: "APPLE_CHALLENGE_REPLAYED" });
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("opens an account-scoped session for an existing Apple identity", async () => {
    const insertedSession: unknown[][] = [];
    const client = {
      query: vi.fn(async (sql: string, parameters?: unknown[]) => {
        if (sql === "BEGIN" || sql === "COMMIT") return { rows: [] };
        if (sql.includes("UPDATE apple_login_challenges")) {
          return { rows: [{ id: request.challenge_id }] };
        }
        if (sql.includes("INSERT INTO consumed_auth_assertions")) {
          return { rows: [{ id: "assertion" }] };
        }
        if (sql.includes("FROM auth_identities")) {
          return {
            rows: [
              {
                account_id: "20000000-0000-4000-8000-000000000001",
                account_name: "Ada's workspace",
                account_slug: "personal-ada",
                display_name: "Ada Lovelace",
                user_email: "recruiter@example.test",
                user_id: "30000000-0000-4000-8000-000000000001",
              },
            ],
          };
        }
        if (sql.includes("UPDATE auth_identities")) return { rows: [] };
        if (sql.includes("INSERT INTO sessions")) {
          insertedSession.push(parameters ?? []);
          return { rows: [] };
        }
        throw new Error(`Unexpected query: ${sql}`);
      }),
      release: vi.fn(),
    } as unknown as PoolClient;
    const pool = {
      connect: vi.fn().mockResolvedValue(client),
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            client_label: "ios",
            expected_nonce_hash: "expected-nonce-hash",
          },
        ],
      }),
    } as unknown as Pool;
    const verifier: AppleTokenVerifying = {
      verify: vi.fn().mockResolvedValue(token()),
    };

    const session = await createAppleSession(pool, config, request, verifier);

    expect(session.account.id).toBe("20000000-0000-4000-8000-000000000001");
    expect(session.user.kind).toBe("apple_human");
    expect(session.access_token.length).toBeGreaterThanOrEqual(32);
    expect(insertedSession).toHaveLength(1);
    expect(client.release).toHaveBeenCalledOnce();
  });
});

describe("password authentication", () => {
  it("opens an account-scoped session for a verified username", async () => {
    const passwordScrypt = await encodePasswordCredential(
      "quiet-context",
      "00112233445566778899aabbccddeeff",
    );
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql === "BEGIN" || sql === "COMMIT") return { rows: [] };
        if (sql.includes("FROM users") && sql.includes("password_credentials")) {
          return {
            rows: [
              {
                account_id: "10000000-0000-4000-8000-000000000001",
                account_name: "Fixture Alpha Search",
                account_role: "admin",
                account_slug: "fixture-alpha",
                display_name: "Cubxxw",
                failed_attempts: 0,
                locked_until: null,
                password_scrypt: passwordScrypt,
                user_email: "cubxxw@talentsignal.local",
                user_id: "10000000-0000-4000-8000-000000000013",
                username: "cubxxw",
              },
            ],
          };
        }
        if (sql.includes("UPDATE password_credentials")) return { rows: [] };
        if (sql.includes("INSERT INTO sessions")) return { rows: [] };
        throw new Error(`Unexpected query: ${sql}`);
      }),
      release: vi.fn(),
    } as unknown as PoolClient;
    const pool = {
      connect: vi.fn().mockResolvedValue(client),
    } as unknown as Pool;

    const session = await createPasswordSession(pool, config, {
      identifier: "CUBXXW",
      password: "quiet-context",
      client_label: "web",
    });

    expect(session.account.slug).toBe("fixture-alpha");
    expect(session.user).toMatchObject({
      kind: "password_human",
      role: "admin",
      username: "cubxxw",
    });
    expect(session.access_token.length).toBeGreaterThanOrEqual(32);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("records a failed attempt and returns one non-enumerating error", async () => {
    const passwordScrypt = await encodePasswordCredential(
      "quiet-context",
      "00112233445566778899aabbccddeeff",
    );
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql === "BEGIN" || sql === "COMMIT") return { rows: [] };
        if (sql.includes("FROM users") && sql.includes("password_credentials")) {
          return {
            rows: [
              {
                account_id: "10000000-0000-4000-8000-000000000001",
                account_name: "Fixture Alpha Search",
                account_role: "admin",
                account_slug: "fixture-alpha",
                display_name: "Cubxxw",
                failed_attempts: 0,
                locked_until: null,
                password_scrypt: passwordScrypt,
                user_email: "cubxxw@talentsignal.local",
                user_id: "10000000-0000-4000-8000-000000000013",
                username: "cubxxw",
              },
            ],
          };
        }
        if (sql.includes("UPDATE password_credentials")) return { rows: [] };
        throw new Error(`Unexpected query: ${sql}`);
      }),
      release: vi.fn(),
    } as unknown as PoolClient;
    const pool = {
      connect: vi.fn().mockResolvedValue(client),
    } as unknown as Pool;

    await expect(
      createPasswordSession(pool, config, {
        identifier: "cubxxw",
        password: "wrong-context",
        client_label: "web",
      }),
    ).rejects.toMatchObject({
      code: "PASSWORD_SIGN_IN_FAILED",
      message: "The username, email, or password is not recognized.",
    });
    expect(
      (client.query as ReturnType<typeof vi.fn>).mock.calls.some(([sql]) =>
        String(sql).includes("failed_attempts = failed_attempts + 1"),
      ),
    ).toBe(true);
  });

  it("rejects duplicate registration without creating a second account", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [] };
        if (sql.includes("SELECT 1") && sql.includes("FROM users")) {
          return { rows: [{ exists: 1 }] };
        }
        throw new Error(`Unexpected query: ${sql}`);
      }),
      release: vi.fn(),
    } as unknown as PoolClient;
    const pool = {
      connect: vi.fn().mockResolvedValue(client),
    } as unknown as Pool;

    await expect(
      registerPasswordSession(pool, config, {
        username: "cubxxw",
        email: "other@example.test",
        display_name: "Other",
        password: "quiet-context",
        client_label: "web",
      }),
    ).rejects.toMatchObject({ code: "PASSWORD_ACCOUNT_EXISTS" });
    expect(
      (client.query as ReturnType<typeof vi.fn>).mock.calls.some(([sql]) =>
        String(sql).includes("INSERT INTO accounts"),
      ),
    ).toBe(false);
  });
});
