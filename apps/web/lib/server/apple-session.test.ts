import { beforeEach, describe, expect, it, vi } from "vitest";
import { decode, encode } from "next-auth/jwt";
import { CONTRACT_VERSION } from "@talent-signal/contracts";

const jar = vi.hoisted(() => ({ set: vi.fn(), get: vi.fn(), delete: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => jar }));
vi.mock("./backendAuth", () => ({
  authSecret: () => "fixture-secret",
  backendAuthBaseUrl: () => "https://backend.example.test",
}));

import {
  bindAppleNonce,
  finishAppleSignIn,
  prepareAppleSignIn,
} from "./apple-session";
import { OAUTH_NONCE_COOKIE, OAuthAccountLinkRequired, postOAuthEndpoint } from "./oauth-session";

const attemptSalt = "talent-signal.apple-attempt";

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

describe("Apple browser-to-backend challenge binding", () => {
  it("binds a Secure SameSite=None provider-tagged nonce for the form_post callback", async () => {
    const target = await bindAppleNonce(
      "https://appleid.apple.com/auth/authorize?state=state",
      "hashed-nonce",
    );
    expect(new URL(target).searchParams.get("state")).toBe("state");
    expect(new URL(target).searchParams.get("nonce")).toBe("hashed-nonce");
    const [name, value, options] = jar.set.mock.calls[0]!;
    expect(name).toBe(OAUTH_NONCE_COOKIE);
    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: "none",
      secure: true,
      maxAge: 300,
    });
    expect(
      await decode({ token: value, salt: name, secret: "fixture-secret" }),
    ).toMatchObject({ value: "hashed-nonce", provider: "apple" });
  });

  it("retains the backend attempt on Apple cross-site POST callbacks", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      contract_version: CONTRACT_VERSION, challenge_id: "challenge-1", nonce: "raw-nonce",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    })));
    await prepareAppleSignIn();
    expect(jar.set).toHaveBeenCalledWith(attemptSalt, expect.any(String), expect.objectContaining({ sameSite: "none", secure: true, httpOnly: true }));
  });

  it("does not set cookies for an unexpected authorization host", async () => {
    await expect(
      bindAppleNonce("https://attacker.test/auth", "nonce"),
    ).rejects.toThrow();
    expect(jar.set).not.toHaveBeenCalled();
  });

  it("rejects expired backend challenges before setting cookies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          contract_version: CONTRACT_VERSION,
          challenge_id: "id",
          nonce: "raw",
          expires_at: "2000-01-01T00:00:00Z",
        }),
      ),
    );
    await expect(prepareAppleSignIn()).rejects.toThrow();
    expect(jar.set).not.toHaveBeenCalled();
  });

  it("preserves a safe account-link error without exposing backend details", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { code: "APPLE_ACCOUNT_LINK_REQUIRED", message: "private backend details" } }, { status: 409 })));
    await expect(postOAuthEndpoint("/v1/auth/apple", {}, "Apple")).rejects.toBeInstanceOf(OAuthAccountLinkRequired);
  });

  it("requires a browser-bound attempt before exchanging any token", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      finishAppleSignIn({ identityToken: "opaque-token" }),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    expect(jar.delete).toHaveBeenCalled();
  });

  it("exchanges the identity token and reads the backend session back", async () => {
    const attempt = await encode({
      secret: "fixture-secret",
      salt: attemptSalt,
      maxAge: 300,
      token: {
        challengeID: "challenge-1",
        endpoint: "https://backend.example.test",
        provider: "apple",
      },
    });
    jar.get.mockReturnValue({ value: attempt });
    const session = {
      contract_version: CONTRACT_VERSION,
      access_token: "t".repeat(40),
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      account: { id: "account-1", slug: "personal-1", name: "Ada's workspace" },
      user: {
        id: "user-1",
        email: "ada@example.test",
        display_name: "Ada",
        kind: "apple_human",
        role: "member",
        username: null,
      },
    };
    const fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
      const target = String(url);
      if (target.endsWith("/v1/auth/apple")) {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          challenge_id: "challenge-1",
          identity_token: "x".repeat(120),
          client_label: "talent-signal-web",
          given_name: "Ada",
          family_name: "Lovelace",
        });
        return Response.json(session);
      }
      if (target.endsWith("/v1/auth/session")) {
        return Response.json(session);
      }
      throw new Error(`Unexpected fetch ${target}`);
    });
    vi.stubGlobal("fetch", fetch);

    const result = await finishAppleSignIn({
      identityToken: "x".repeat(120),
      givenName: "Ada",
      familyName: "Lovelace",
    });

    expect(result.access_token).toBe(session.access_token);
    expect(jar.delete).toHaveBeenCalledWith(attemptSalt);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("rejects a backend session that does not match the readback account", async () => {
    const attempt = await encode({
      secret: "fixture-secret",
      salt: attemptSalt,
      maxAge: 300,
      token: {
        challengeID: "challenge-1",
        endpoint: "https://backend.example.test",
        provider: "apple",
      },
    });
    jar.get.mockReturnValue({ value: attempt });
    const session = {
      contract_version: CONTRACT_VERSION,
      access_token: "t".repeat(40),
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      account: { id: "account-1", slug: "personal-1", name: "Ada's workspace" },
      user: {
        id: "user-1",
        email: "ada@example.test",
        display_name: "Ada",
        kind: "apple_human",
        role: "member",
        username: null,
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) =>
        String(url).endsWith("/v1/auth/apple")
          ? Response.json(session)
          : Response.json({ ...session, account: { ...session.account, id: "other" } }),
      ),
    );

    await expect(
      finishAppleSignIn({ identityToken: "x".repeat(120) }),
    ).rejects.toThrow(/does not match/);
  });
});
