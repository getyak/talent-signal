import { beforeEach, describe, expect, it, vi } from "vitest";

const { signInMock } = vi.hoisted(() => ({ signInMock: vi.fn() }));

vi.mock("@/auth", () => ({ signIn: signInMock, signOut: vi.fn() }));
vi.mock("@/lib/server/backendAuth", () => ({
  authenticatedBackendClient: vi.fn().mockResolvedValue(null),
  backendAuthBaseUrl: () => "http://127.0.0.1:4317",
  readPrimaryBackendSessionClaims: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/server/testWorkspaceSession", () => ({
  clearTestWorkspaceSession: vi.fn(),
}));
vi.mock("@/lib/server/google-session", () => ({
  bindGoogleNonce: vi.fn(),
  prepareGoogleSignIn: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next-auth", () => {
  class AuthError extends Error {
    type = "AuthError";
  }
  class CredentialsSignin extends AuthError {
    type = "CredentialsSignin";
    code = "credentials";
  }
  return { AuthError, CredentialsSignin };
});

import { CredentialsSignin } from "next-auth";
import {
  registerPasswordAccount,
  signInWithEmail,
  signInWithPasswordAccount,
  type SignInState,
} from "./actions";

const initialState: SignInState = { error: "" };

class ServiceCredentialsError extends CredentialsSignin {
  code = "service_unavailable";
}

class RateLimitedCredentialsError extends CredentialsSignin {
  code = "rate_limited";
}

class AccountExistsCredentialsError extends CredentialsSignin {
  code = "account_exists";
}

function formOf(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

beforeEach(() => {
  signInMock.mockReset();
});

describe("login action failure contract", () => {
  it("keeps the identifier and stores a retryable outage state", async () => {
    signInMock.mockRejectedValue(new ServiceCredentialsError());
    const state = await signInWithPasswordAccount(
      initialState,
      formOf({
        identifier: "recruiter@example.com",
        password: "correct horse battery",
        redirectTo: "/workspace/pursuits/42",
      }),
    );

    expect(state.code).toBe("service_unavailable");
    expect(state.retryable).toBe(true);
    expect(state.values).toEqual({ identifier: "recruiter@example.com" });
    expect(signInMock).toHaveBeenCalledWith(
      "password-account",
      expect.objectContaining({
        identifier: "recruiter@example.com",
        mode: "sign-in",
        redirectTo: "/workspace/pursuits/42",
      }),
    );
  });

  it("reports a rate limit without retrying automatically", async () => {
    signInMock.mockRejectedValue(new RateLimitedCredentialsError());
    const state = await signInWithPasswordAccount(
      initialState,
      formOf({ identifier: "a@b.c", password: "secret" }),
    );

    expect(state.code).toBe("rate_limited");
    expect(state.retryable).toBe(false);
    expect(signInMock).toHaveBeenCalledTimes(1);
  });

  it("keeps registration inputs on a duplicate account", async () => {
    signInMock.mockRejectedValue(new AccountExistsCredentialsError());
    const state = await registerPasswordAccount(
      initialState,
      formOf({
        displayName: "Recruiter",
        email: "recruiter@example.com",
        password: "correct horse battery",
        confirmPassword: "correct horse battery",
      }),
    );

    expect(state.code).toBe("account_exists");
    expect(state.values).toEqual({
      displayName: "Recruiter",
      email: "recruiter@example.com",
    });
  });

  it("rejects mismatched registration passwords before calling the backend", async () => {
    const state = await registerPasswordAccount(
      initialState,
      formOf({
        displayName: "Recruiter",
        email: "recruiter@example.com",
        password: "a".repeat(12),
        confirmPassword: "b".repeat(12),
      }),
    );

    expect(state.error).toContain("不一致");
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("preserves the callback destination and email on email sign-in failure", async () => {
    signInMock.mockRejectedValue(new ServiceCredentialsError());
    const state = await signInWithEmail(
      initialState,
      formOf({
        email: "recruiter@example.com",
        password: "secret",
        redirectTo: "/workspace/today",
      }),
    );

    expect(state.values).toEqual({ email: "recruiter@example.com" });
    expect(signInMock).toHaveBeenCalledWith(
      "email-password",
      expect.objectContaining({
        email: "recruiter@example.com",
        redirectTo: "/workspace/today",
      }),
    );
  });
});
