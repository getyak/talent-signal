import { describe, expect, it } from "vitest";
import {
  encodeConfiguredPassword,
  getAuthAvailability,
  getDefaultAccount,
  safeRedirectTarget,
  verifyConfiguredPassword,
} from "./auth-config";

const configuredEnvironment = {
  AUTH_DEFAULT_ACCOUNT_EMAIL: "  Recruiter@TalentSignal.ai ",
  AUTH_DEFAULT_ACCOUNT_ENABLED: "true",
  AUTH_DEFAULT_ACCOUNT_NAME: "Morgan Lee",
  AUTH_DEFAULT_ACCOUNT_PASSWORD_SCRYPT: encodeConfiguredPassword(
    "clear-context",
    "00112233445566778899aabbccddeeff",
  ),
  AUTH_DEFAULT_ACCOUNT_QUICK_LOGIN: "true",
  AUTH_GOOGLE_ID: "google-id",
  AUTH_GOOGLE_SECRET: "google-secret",
};

describe("default account configuration", () => {
  it("enables configured email and quick-login paths", () => {
    const account = getDefaultAccount(configuredEnvironment);

    expect(account.email).toBe("recruiter@talentsignal.ai");
    expect(account.emailPasswordEnabled).toBe(true);
    expect(account.quickLoginEnabled).toBe(true);
  });

  it("keeps incomplete providers unavailable", () => {
    const availability = getAuthAvailability(configuredEnvironment);

    expect(availability.google).toBe(true);
    expect(availability.apple).toBe(false);
    expect(availability.email).toBe(true);
  });

  it("accepts a validated server-side Google credentials override", () => {
    const availability = getAuthAvailability(
      {
        ...configuredEnvironment,
        AUTH_GOOGLE_ID: undefined,
        AUTH_GOOGLE_SECRET: undefined,
      },
      { google: true },
    );

    expect(availability.google).toBe(true);
  });
});

describe("configured password verification", () => {
  it("compares the configured scrypt value without storing plaintext", () => {
    const encoded = configuredEnvironment.AUTH_DEFAULT_ACCOUNT_PASSWORD_SCRYPT;

    expect(verifyConfiguredPassword("clear-context", encoded)).toBe(true);
    expect(verifyConfiguredPassword("wrong-context", encoded)).toBe(false);
  });
});

describe("safeRedirectTarget", () => {
  it("accepts only local application paths", () => {
    expect(safeRedirectTarget("/workspace?view=list")).toBe(
      "/workspace?view=list",
    );
    expect(safeRedirectTarget("//host.example")).toBe("/workspace");
    expect(safeRedirectTarget("https://host.example")).toBe("/workspace");
    expect(safeRedirectTarget("/\\host.example")).toBe("/workspace");
  });
});
