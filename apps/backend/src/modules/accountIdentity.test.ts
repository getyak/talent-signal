import { describe, expect, it } from "vitest";

import { ApiError } from "../lib/apiError.js";
import {
  EMPTY_DUPLICATE_BASELINE_ACCOUNT_TABLES,
  EMPTY_DUPLICATE_IDENTITY_TABLES,
  EMPTY_DUPLICATE_SYSTEM_TABLES,
  EMPTY_DUPLICATE_USER_BOUND_TABLES,
  EmailClaimConflict,
  emailClaimConflictError,
  normalizeEmail,
  providerSubjectHash,
} from "./accountIdentity.js";

describe("normalized email ownership rules", () => {
  it("normalizes by trim and lowercase only", () => {
    expect(normalizeEmail("  Recruiter@Example.Test  ")).toBe("recruiter@example.test");
    // Gmail dots, plus tags, distinct domains, and Apple relay addresses are
    // never collapsed or rewritten: each stays a distinct visible address.
    expect(normalizeEmail("r.e.c.r.u.i.t.e.r+x@example.test")).toBe(
      "r.e.c.r.u.i.t.e.r+x@example.test",
    );
    expect(normalizeEmail("recruiter@privaterelay.appleid.com")).toBe(
      "recruiter@privaterelay.appleid.com",
    );
    expect(normalizeEmail("recruiter@example.test")).not.toBe(
      normalizeEmail("recruiter@example2.test"),
    );
  });

  it("keeps provider identity on validated issuer/subject, not email", () => {
    const first = providerSubjectHash("apple", "https://appleid.apple.com", "subject-1");
    const same = providerSubjectHash("apple", "https://appleid.apple.com", "subject-1");
    const otherIssuer = providerSubjectHash("google", "https://accounts.google.com", "subject-1");
    expect(first).toBe(same);
    expect(first).not.toBe(otherIssuer);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    // An email change alone can never move a subject hash.
    expect(providerSubjectHash("google", "https://accounts.google.com", "a@b.test")).not.toBe(
      providerSubjectHash("google", "https://accounts.google.com", "c@d.test"),
    );
  });

  it("maps claim conflicts to non-enumerating public errors per flow", () => {
    const owned = new EmailClaimConflict("owned", "a@example.test");
    const conflict = new EmailClaimConflict("conflict", "a@example.test");
    // Password signup never discloses whether an account exists.
    for (const reason of [owned, conflict]) {
      const error = emailClaimConflictError(reason, "password");
      expect(error).toBeInstanceOf(ApiError);
      expect(error.code).toBe("PASSWORD_ACCOUNT_EXISTS");
    }
    // Unbound OAuth says to sign in with the existing method, not that a
    // workspace or owner exists.
    const google = emailClaimConflictError(conflict, "google");
    expect(google.code).toBe("GOOGLE_ACCOUNT_LINK_REQUIRED");
    // Public guidance only: no data counts, no email echo, no owner identity.
    expect(google.message).not.toContain(conflict.normalizedEmail);
    expect(google.message).not.toMatch(/\d/);
    expect(google.message).not.toMatch(/owner|member|titled/i);
    const apple = emailClaimConflictError(conflict, "apple");
    expect(apple.code).toBe("APPLE_ACCOUNT_LINK_REQUIRED");
  });

  it("requires the full emptiness baseline instead of ignoring known rows", () => {
    // Credentials and login-management artifacts are validated against the
    // expected sole user; the harness generation baseline is system state.
    expect(EMPTY_DUPLICATE_IDENTITY_TABLES.has("account_access_events")).toBe(true);
    expect(EMPTY_DUPLICATE_USER_BOUND_TABLES.has("auth_identities")).toBe(true);
    expect(EMPTY_DUPLICATE_USER_BOUND_TABLES.has("password_credentials")).toBe(true);
    expect(EMPTY_DUPLICATE_USER_BOUND_TABLES.has("retired_login_aliases")).toBe(true);
    expect(EMPTY_DUPLICATE_SYSTEM_TABLES.has("harness_source_generations")).toBe(true);
    // Baseline account columns are exactly the validated ones; every other
    // *_account_id column is indirect ownership that must reference zero rows.
    for (const table of [
      "users",
      "sessions",
      "auth_identities",
      "password_credentials",
      "harness_source_generations",
    ]) {
      expect(EMPTY_DUPLICATE_BASELINE_ACCOUNT_TABLES.has(table)).toBe(true);
    }
    // Product data is never part of the baseline.
    for (const table of ["subjects", "agent_sessions", "product_feedback"]) {
      expect(EMPTY_DUPLICATE_BASELINE_ACCOUNT_TABLES.has(table)).toBe(false);
    }
  });
});
