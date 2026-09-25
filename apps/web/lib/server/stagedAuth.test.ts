import { describe, expect, it } from "vitest";

import {
  AUTH_OPERATION_TTL_SECONDS,
  LINK_COMPLETE_PATH,
  flowIsLive,
  recoveryOperationFor,
  resolveProviderReturn,
  sealedCookieOptions,
  validateRecoveryProof,
  validateStagedProof,
  type AuthOperation,
  type AuthRound,
  type StagedProof,
} from "./stagedAuth";

const baseTime = Date.parse("2026-09-25T00:00:00.000Z");

function flow(overrides: Partial<AuthOperation> = {}): AuthOperation {
  return {
    ref: "10000000-0000-4000-8000-000000000001",
    intent: "verify_identity",
    reauthProvider: "google",
    reauthChallengeId: "20000000-0000-4000-8000-000000000002",
    clientLabel: "talent-signal-reconciliation",
    accountId: "30000000-0000-4000-8000-000000000003",
    userId: "40000000-0000-4000-8000-000000000004",
    sessionFingerprint: "9d7f7a1f88c1f0f8b6a0f2a4a2b60d1f46f0a2c3d4e5f60718293a4b5c6d7e8f",
    accountRevision: 2,
    userRevision: 1,
    step: "awaiting-reauth",
    roleChallenges: {
      current: { provider: "google", challengeId: "challenge-current" },
      duplicate: { provider: "google", challengeId: "challenge-duplicate" },
    },
    createdAt: new Date(baseTime).toISOString(),
    ...overrides,
  };
}

function round(overrides: Partial<AuthRound> = {}): AuthRound {
  return {
    roundRef: "50000000-0000-4000-8000-000000000005",
    flowRef: flow().ref,
    role: "current",
    provider: "google",
    challengeId: "challenge-current",
    purpose: "reauth",
    createdAt: new Date(baseTime).toISOString(),
    expiresAt: new Date(baseTime + AUTH_OPERATION_TTL_SECONDS * 1000).toISOString(),
    ...overrides,
  };
}

function proof(overrides: Partial<StagedProof> = {}): StagedProof {
  return {
    ref: flow().ref,
    roundRef: round().roundRef,
    purpose: "reauth",
    provider: "google",
    challengeId: "challenge-current",
    identityToken: "fixture-token",
    stagedAt: new Date(baseTime + 10_000).toISOString(),
    ...overrides,
  };
}

describe("explicit OAuth round routing", () => {
  it("keeps ordinary login ordinary without a flow or round", () => {
    expect(
      resolveProviderReturn({
        operation: null,
        round: null,
        provider: "google",
        callbackPath: "/login",
      }),
    ).toEqual({ kind: "ordinary" });
  });

  it("fails closed when an Apple cross-site POST arrives without its Lax cookies", () => {
    // Realistic form_post: the Lax operation/round cookies are absent. A
    // completion return without its round can never fall through to login or
    // borrow another round's authority.
    expect(
      resolveProviderReturn({
        operation: null,
        round: null,
        provider: "apple",
        callbackPath: LINK_COMPLETE_PATH,
      }),
    ).toEqual({ kind: "fail-closed" });
  });

  it("routes the exact sealed round and never guesses from provider equality", () => {
    // Google current then Google duplicate: both rounds use the same provider.
    // The round names the role and challenge; the resolver does not infer it.
    const now = baseTime + 20_000;
    const current = round({ role: "current", challengeId: "challenge-current" });
    expect(
      resolveProviderReturn({
        operation: flow(),
        round: current,
        provider: "google",
        callbackPath: LINK_COMPLETE_PATH,
        now,
      }),
    ).toMatchObject({ kind: "stage" });
    const duplicate = round({
      roundRef: "60000000-0000-4000-8000-000000000006",
      role: "duplicate",
      challengeId: "challenge-duplicate",
    });
    expect(
      resolveProviderReturn({
        operation: flow(),
        round: duplicate,
        provider: "google",
        callbackPath: LINK_COMPLETE_PATH,
        now,
      }),
    ).toMatchObject({ kind: "stage" });
    // A round for another flow/provider/expiry is rejected.
    expect(
      resolveProviderReturn({
        operation: flow(),
        round: { ...current, provider: "apple" },
        provider: "google",
        callbackPath: LINK_COMPLETE_PATH,
        now,
      }),
    ).toEqual({ kind: "fail-closed" });
  });

  it("rejects stale, foreign and expired rounds and flows", () => {
    const now = baseTime + AUTH_OPERATION_TTL_SECONDS * 1000 + 1;
    expect(flowIsLive(flow(), now)).toBe(false);
    expect(
      resolveProviderReturn({
        operation: flow(),
        round: round(),
        provider: "google",
        callbackPath: LINK_COMPLETE_PATH,
        now,
      }),
    ).toEqual({ kind: "fail-closed" });
    expect(
      resolveProviderReturn({
        operation: flow({ createdAt: new Date(baseTime + 20_000).toISOString() }),
        round: round({ flowRef: "some-other-flow" }),
        provider: "google",
        callbackPath: LINK_COMPLETE_PATH,
        now: baseTime + 30_000,
      }),
    ).toEqual({ kind: "fail-closed" });
  });
});

describe("staged proof consumption", () => {
  it("accepts only the exact round that produced the proof", () => {
    const now = baseTime + 30_000;
    expect(
      validateStagedProof({
        operation: flow(),
        round: round(),
        proof: proof(),
        role: "current",
        now,
      }),
    ).not.toBeNull();
    // Role swap: the duplicate round's proof never satisfies the current role.
    expect(
      validateStagedProof({
        operation: flow(),
        round: round({ role: "duplicate", challengeId: "challenge-duplicate" }),
        proof: proof({ challengeId: "challenge-duplicate" }),
        role: "current",
        now,
      }),
    ).toBeNull();
    // Tampered provider/challenge/purpose is rejected before backend use.
    for (const tampered of [
      proof({ provider: "apple" }),
      proof({ challengeId: "challenge-duplicate" }),
      proof({ purpose: "target" }),
      proof({ roundRef: "70000000-0000-4000-8000-000000000007" }),
    ]) {
      expect(
        validateStagedProof({ operation: flow(), round: round(), proof: tampered, role: "current", now }),
      ).toBeNull();
    }
  });

  it("validates recovery proofs against the frozen role challenges in either order", () => {
    const now = baseTime + 60_000;
    // Duplicate first, then current (providers may match or differ).
    const duplicateFirst = proof({
      roundRef: "round-dup",
      challengeId: "challenge-duplicate",
      stagedAt: new Date(baseTime + 10_000).toISOString(),
    });
    expect(
      validateRecoveryProof({ operation: flow(), proof: duplicateFirst, role: "duplicate", now }),
    ).not.toBeNull();
    const currentLater = proof({
      roundRef: "round-cur",
      challengeId: "challenge-current",
      stagedAt: new Date(baseTime + 50_000).toISOString(),
    });
    expect(
      validateRecoveryProof({ operation: flow(), proof: currentLater, role: "current", now }),
    ).not.toBeNull();
    // The duplicate proof never satisfies the current role and vice versa.
    expect(
      validateRecoveryProof({ operation: flow(), proof: duplicateFirst, role: "current", now }),
    ).toBeNull();
  });

  it("refuses any proof after the frozen flow expiry", () => {
    // t0 flow, t550 current, t580 duplicate, t650 prepare: the flow's absolute
    // expiry at t600 must be checked by every consumer.
    const afterExpiry = baseTime + 650_000;
    expect(flowIsLive(flow(), afterExpiry)).toBe(false);
    expect(
      validateRecoveryProof({
        operation: flow(),
        proof: proof({ stagedAt: new Date(baseTime + 550_000).toISOString() }),
        role: "current",
        now: afterExpiry,
      }),
    ).toBeNull();
    expect(
      validateStagedProof({
        operation: flow(),
        round: round(),
        proof: proof({ stagedAt: new Date(baseTime + 580_000).toISOString() }),
        role: "current",
        now: afterExpiry,
      }),
    ).toBeNull();
  });

  it("never refreshes the first authority when the second round is created", () => {
    const first = recoveryOperationFor(
      null,
      {
        intent: "verify_identity",
        reauthProvider: "google",
        reauthChallengeId: "challenge-current",
        clientLabel: "talent-signal-reconciliation",
        accountId: flow().accountId,
        userId: flow().userId,
        sessionFingerprint: flow().sessionFingerprint,
        accountRevision: 2,
        userRevision: 1,
      },
      "current",
      "challenge-current",
      new Date(baseTime).toISOString(),
    );
    const second = recoveryOperationFor(
      first,
      {
        intent: "verify_identity",
        reauthProvider: "apple",
        reauthChallengeId: "challenge-duplicate",
        clientLabel: "talent-signal-reconciliation",
        accountId: first.accountId,
        userId: first.userId,
        sessionFingerprint: first.sessionFingerprint,
        accountRevision: 2,
        userRevision: 1,
      },
      "duplicate",
      "challenge-duplicate",
      new Date(baseTime + 550_000).toISOString(),
    );
    // Same immutable ref and creation time: the second round adds its own
    // role challenge but cannot extend the flow lifetime.
    expect(second.ref).toBe(first.ref);
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.roleChallenges?.current).toEqual(first.roleChallenges?.current);
    expect(second.roleChallenges?.duplicate).toEqual({
      provider: "apple",
      challengeId: "challenge-duplicate",
    });
  });

  it("uses a deliberately reviewed cross-site cookie policy only where required", () => {
    expect(sealedCookieOptions(true)).toMatchObject({ sameSite: "none", secure: true, httpOnly: true });
    expect(sealedCookieOptions(false)).toMatchObject({ sameSite: "lax", httpOnly: true });
  });
});
