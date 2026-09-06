import { beforeEach, describe, expect, it, vi } from "vitest";
import { decode } from "next-auth/jwt";
const jar = vi.hoisted(() => ({ set: vi.fn(), get: vi.fn(), delete: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => jar }));
vi.mock("./backendAuth", () => ({ authSecret: () => "fixture-secret", backendAuthBaseUrl: () => "https://backend.example.test" }));
import { bindGoogleNonce, finishGoogleSignIn, GOOGLE_NONCE_COOKIE, prepareGoogleSignIn } from "./google-session";
import { CONTRACT_VERSION } from "@talent-signal/contracts";

beforeEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });
describe("Google browser-to-backend challenge binding", () => {
  it("keeps state and PKCE while binding an encrypted provider-specific nonce", async () => {
    const target = await bindGoogleNonce("https://accounts.google.com/o/oauth2/v2/auth?state=state&code_challenge=pkce", "server-nonce");
    expect(new URL(target).searchParams.get("state")).toBe("state");
    expect(new URL(target).searchParams.get("code_challenge")).toBe("pkce");
    expect(new URL(target).searchParams.get("nonce")).toBe("server-nonce");
    const [name, value, options] = jar.set.mock.calls[0]!;
    expect(name).toBe(GOOGLE_NONCE_COOKIE);
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", maxAge: 300 });
    expect(await decode({ token: value, salt: name, secret: "fixture-secret" })).toMatchObject({ value: "server-nonce", provider: "google" });
  });
  it("does not set cookies for an unexpected authorization host", async () => {
    await expect(bindGoogleNonce("https://attacker.test", "nonce")).rejects.toThrow();
    expect(jar.set).not.toHaveBeenCalled();
  });
  it("rejects expired backend challenges before setting cookies", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ contract_version: CONTRACT_VERSION, challenge_id: "id", nonce: "raw", expires_at: "2000-01-01T00:00:00Z" })));
    await expect(prepareGoogleSignIn()).rejects.toThrow();
    expect(jar.set).not.toHaveBeenCalled();
  });
  it("requires a browser-bound attempt before exchanging any token", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(finishGoogleSignIn("opaque-token")).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled(); expect(jar.delete).toHaveBeenCalled();
  });
});
