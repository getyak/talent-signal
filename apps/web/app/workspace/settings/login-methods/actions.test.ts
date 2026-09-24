import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claims: vi.fn(),
  accountSettings: vi.fn(),
  startLoginMethodChange: vi.fn(),
  completeLoginMethodChange: vi.fn(),
  sealCredentialAttempt: vi.fn(),
  readSealedCredentialAttempt: vi.fn(),
}));

vi.mock("@/lib/server/backendAuth", () => ({
  readPrimaryBackendSessionClaims: mocks.claims,
  authenticatedBackendClient: vi.fn(async () => ({ accountSettings: mocks.accountSettings })),
  backendAuthBaseUrl: () => "http://127.0.0.1:4317",
}));
vi.mock("@/lib/server/loginMethods", () => ({
  startLoginMethodChange: mocks.startLoginMethodChange,
  completeLoginMethodChange: mocks.completeLoginMethodChange,
  sealCredentialAttempt: mocks.sealCredentialAttempt,
}));
vi.mock("@/lib/server/stagedAuth", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  readAuthOperation: vi.fn().mockResolvedValue(null),
  readAuthProof: vi.fn().mockResolvedValue(null),
  clearStagedAuth: vi.fn(),
  sealAuthOperation: vi.fn(),
}));
vi.mock("@/lib/server/google-session", () => ({ bindGoogleNonce: vi.fn() }));
vi.mock("@/lib/server/apple-session", () => ({ bindAppleNonce: vi.fn() }));
vi.mock("@/auth", () => ({ signIn: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { saveAccountPassword, unlinkLoginMethod } from "./actions";

function formOf(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

const renderedScope = {
  accountId: "10000000-0000-4000-8000-00000000000a",
  userId: "20000000-0000-4000-8000-00000000000b",
  accountRevision: "2",
  userRevision: "2",
};

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  // The rival account B is signed in with the SAME revisions and password.
  mocks.claims.mockResolvedValue({
    backendAccessToken: "bearer-b",
    backendAccountId: "30000000-0000-4000-8000-00000000000c",
    backendUserId: "40000000-0000-4000-8000-00000000000d",
  });
  mocks.accountSettings.mockResolvedValue({
    workspace: { revision: 2 },
    user: { revision: 2 },
  });
  mocks.startLoginMethodChange.mockResolvedValue({
    attempt_id: "attempt-1",
    attempt_secret: "secret",
  });
  mocks.completeLoginMethodChange.mockResolvedValue({
    status: "password_set",
    settings: { sign_in_methods: [] },
  });
});

describe("rendered actor binding", () => {
  it("refuses a stale form on another signed-in account even with identical revisions and password", async () => {
    const state = await saveAccountPassword(
      {},
      formOf({
        ...renderedScope,
        currentPassword: "same-password",
        newPassword: "brand-new-password",
        hasPassword: "true",
      }),
    );
    // Account B is live; A's form must not mutate B or even mint an attempt.
    expect(state.error).toContain("登录账户已变化");
    expect(state.data).toBeUndefined();
    expect(mocks.startLoginMethodChange).not.toHaveBeenCalled();
    expect(mocks.completeLoginMethodChange).not.toHaveBeenCalled();
  });

  it("refuses unlink for a stale actor the same way", async () => {
    const state = await unlinkLoginMethod(
      {},
      formOf({
        ...renderedScope,
        provider: "google",
        currentPassword: "same-password",
      }),
    );
    expect(state.error).toContain("登录账户已变化");
    expect(mocks.startLoginMethodChange).not.toHaveBeenCalled();
  });

  it("proceeds when the rendered actor matches the live session", async () => {
    mocks.claims.mockResolvedValue({
      backendAccessToken: "bearer-a",
      backendAccountId: renderedScope.accountId,
      backendUserId: renderedScope.userId,
    });
    const state = await saveAccountPassword(
      {},
      formOf({
        ...renderedScope,
        currentPassword: "same-password",
        newPassword: "brand-new-password",
        hasPassword: "true",
      }),
    );
    expect(state.error).toBeUndefined();
    // The rendered revisions are the authorization the backend enforces.
    expect(mocks.startLoginMethodChange).toHaveBeenCalledWith(
      expect.objectContaining({
        expected_account_revision: 2,
        expected_user_revision: 2,
      }),
    );
    expect(mocks.completeLoginMethodChange).toHaveBeenCalled();
  });

  it("rejects when live revisions drifted from the rendered form", async () => {
    mocks.claims.mockResolvedValue({
      backendAccessToken: "bearer-a",
      backendAccountId: renderedScope.accountId,
      backendUserId: renderedScope.userId,
    });
    mocks.accountSettings.mockResolvedValue({
      workspace: { revision: 3 },
      user: { revision: 2 },
    });
    const state = await saveAccountPassword(
      {},
      formOf({
        ...renderedScope,
        currentPassword: "same-password",
        newPassword: "brand-new-password",
        hasPassword: "true",
      }),
    );
    expect(state.error).toContain("登录账户已变化");
    expect(mocks.startLoginMethodChange).not.toHaveBeenCalled();
  });
});
