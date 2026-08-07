import type { Pool, PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";

import { sha256 } from "../lib/hash.js";
import {
  confirmIdentityHandles,
  sweepDueIdentityHandles,
} from "./identityHandles.js";

const accountId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const personId = "33333333-3333-4333-8333-333333333333";
const resourceId = "44444444-4444-4444-8444-444444444444";
const contextId = "55555555-5555-4555-8555-555555555555";
const handleId = "66666666-6666-4666-8666-666666666666";
const confirmedAt = new Date("2026-08-07T00:00:00.000Z");
const freshnessPolicy = {
  version: "identity-freshness-2026-08-07.v1",
  max_override_days: 1825,
  policy_document: {
    default_validity_days: {
      email: 365,
      phone: 365,
      wechat: 365,
      linkedin_url: 730,
      public_profile_url: 730,
      source_native_id: 180,
    },
  },
};

describe("confirmed identity handles", () => {
  it("stores only a normalized hash, masked hint, and governed source link", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [freshnessPolicy] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const count = await confirmIdentityHandles(
      { query } as unknown as PoolClient,
      {
        accountId,
        confirmedByUserId: userId,
        confirmedAt,
        handles: [
          {
            type: "email",
            value: "ZHOU.YU@example.com",
            source_client_resource_id: "contact-1",
          },
        ],
        personId,
        relationshipContextId: contextId,
        sourceResourceId: resourceId,
      },
    );

    expect(count).toBe(1);
    const insertParameters = query.mock.calls[2]?.[1] as unknown[];
    expect(insertParameters).toEqual(
      expect.arrayContaining([
        accountId,
        personId,
        "email",
        sha256("zhou.yu@example.com"),
        "z•••@example.com",
        resourceId,
        confirmedAt,
        userId,
        freshnessPolicy.version,
        "policy_default",
      ]),
    );
    expect(insertParameters).not.toContain("ZHOU.YU@example.com");
    expect(insertParameters).not.toContain("zhou.yu@example.com");
    expect(query.mock.calls[3]?.[0]).toContain(
      "identity_handle_lifecycle_events",
    );
    expect(query.mock.calls[4]?.[0]).toContain("audit_events");
  });

  it("does not duplicate a handle already confirmed for the same person", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [freshnessPolicy] })
      .mockResolvedValueOnce({
        rows: [
          {
            account_id: accountId,
            id: handleId,
            subject_id: personId,
            handle_type: "phone",
            display_hint: "•••• 4567",
            source_resource_id: resourceId,
            status: "confirmed",
            valid_from: confirmedAt,
            valid_until: new Date("2027-08-07T00:00:00.000Z"),
            freshness_policy_version: freshnessPolicy.version,
            validity_basis: "policy_default",
            validity_override_reason: null,
          },
        ],
      });

    await expect(
      confirmIdentityHandles({ query } as unknown as PoolClient, {
        accountId,
        confirmedAt,
        confirmedByUserId: userId,
        handles: [{ type: "phone", value: "+65 9123 4567" }],
        personId,
        relationshipContextId: contextId,
        sourceResourceId: resourceId,
      }),
    ).resolves.toBe(0);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("fails closed when a confirmed handle belongs to another person", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [freshnessPolicy] })
      .mockResolvedValueOnce({
        rows: [
          {
            account_id: accountId,
            id: handleId,
            subject_id: "55555555-5555-4555-8555-555555555555",
            handle_type: "wechat",
            display_hint: "zh•••yu",
            source_resource_id: resourceId,
            status: "confirmed",
            valid_from: confirmedAt,
            valid_until: new Date("2027-08-07T00:00:00.000Z"),
            freshness_policy_version: freshnessPolicy.version,
            validity_basis: "policy_default",
            validity_override_reason: null,
          },
        ],
      });

    await expect(
      confirmIdentityHandles({ query } as unknown as PoolClient, {
        accountId,
        confirmedAt,
        confirmedByUserId: userId,
        handles: [{ type: "wechat", value: "zhou-yu" }],
        personId,
        relationshipContextId: contextId,
        sourceResourceId: resourceId,
      }),
    ).rejects.toMatchObject({
      code: "IDENTITY_HANDLE_CONFIRMED_ELSEWHERE",
      statusCode: 409,
    });
  });

  it("reconfirms an expired clue for the same person from a fresh governed source", async () => {
    const freshResourceId =
      "77777777-7777-4777-8777-777777777777";
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [freshnessPolicy] })
      .mockResolvedValueOnce({
        rows: [
          {
            account_id: accountId,
            id: handleId,
            subject_id: personId,
            handle_type: "email",
            display_hint: "z•••@example.com",
            source_resource_id: resourceId,
            status: "expired",
            valid_from: new Date("2025-08-07T00:00:00.000Z"),
            valid_until: confirmedAt,
            freshness_policy_version: freshnessPolicy.version,
            validity_basis: "policy_default",
            validity_override_reason: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ sequence: "1" }] });

    await expect(
      confirmIdentityHandles({ query } as unknown as PoolClient, {
        accountId,
        confirmedAt,
        confirmedByUserId: userId,
        handles: [{ type: "email", value: "zhou.yu@example.com" }],
        personId,
        relationshipContextId: contextId,
        sourceResourceId: freshResourceId,
      }),
    ).resolves.toBe(1);

    expect(query.mock.calls[2]?.[0]).toContain(
      "SET status = 'confirmed'",
    );
    expect(query.mock.calls[2]?.[1]).toEqual(
      expect.arrayContaining([
        accountId,
        handleId,
        freshResourceId,
        userId,
        confirmedAt,
      ]),
    );
    expect(query.mock.calls[3]?.[1]).toEqual(
      expect.arrayContaining(["reconfirmed", "expired", "confirmed"]),
    );
  });

  it("requires a reviewable reason for a custom deadline", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [freshnessPolicy] });

    await expect(
      confirmIdentityHandles({ query } as unknown as PoolClient, {
        accountId,
        confirmedAt,
        confirmedByUserId: userId,
        handles: [
          {
            type: "email",
            value: "zhou.yu@example.com",
            valid_until: "2027-02-07T00:00:00.000Z",
          },
        ],
        personId,
        relationshipContextId: contextId,
        sourceResourceId: resourceId,
      }),
    ).rejects.toMatchObject({
      code: "IDENTITY_HANDLE_VALIDITY_OVERRIDE_REASON_REQUIRED",
      statusCode: 422,
    });
    expect(query).toHaveBeenCalledOnce();
  });

  it("rejects an override reason without a custom deadline", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [freshnessPolicy] });

    await expect(
      confirmIdentityHandles({ query } as unknown as PoolClient, {
        accountId,
        confirmedAt,
        confirmedByUserId: userId,
        handles: [
          {
            type: "email",
            value: "zhou.yu@example.com",
            validity_override_reason:
              "This reason has no matching custom review deadline.",
          },
        ],
        personId,
        relationshipContextId: contextId,
        sourceResourceId: resourceId,
      }),
    ).rejects.toMatchObject({
      code: "IDENTITY_HANDLE_VALIDITY_OVERRIDE_WITHOUT_DEADLINE",
      statusCode: 422,
    });
    expect(query).toHaveBeenCalledOnce();
  });

  it("records the policy version and human basis for a custom deadline", async () => {
    const validUntil = "2027-02-07T00:00:00.000Z";
    const overrideReason =
      "The issuer rotates this shared address every six months.";
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [freshnessPolicy] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      confirmIdentityHandles({ query } as unknown as PoolClient, {
        accountId,
        confirmedAt,
        confirmedByUserId: userId,
        handles: [
          {
            type: "email",
            value: "zhou.yu@example.com",
            valid_until: validUntil,
            validity_override_reason: overrideReason,
          },
        ],
        personId,
        relationshipContextId: contextId,
        sourceResourceId: resourceId,
      }),
    ).resolves.toBe(1);

    expect(query.mock.calls[2]?.[1]).toEqual(
      expect.arrayContaining([
        new Date(validUntil),
        freshnessPolicy.version,
        "human_override",
        overrideReason,
      ]),
    );
    expect(query.mock.calls[3]?.[1]).toEqual(
      expect.arrayContaining([
        freshnessPolicy.version,
        "human_override",
        overrideReason,
      ]),
    );
  });

  it("expires due clues durably with a system audit event", async () => {
    const validUntil = new Date("2026-08-06T00:00:00.000Z");
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            account_id: accountId,
            id: handleId,
            subject_id: personId,
            handle_type: "email",
            display_hint: "z•••@example.com",
            source_resource_id: resourceId,
            status: "confirmed",
            valid_from: new Date("2025-08-06T00:00:00.000Z"),
            valid_until: validUntil,
            freshness_policy_version: freshnessPolicy.version,
            validity_basis: "policy_default",
            validity_override_reason: null,
            relationship_context_id: contextId,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: handleId }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ sequence: "2" }] })
      .mockResolvedValueOnce({ rows: [] });
    const client = {
      query,
      release: vi.fn(),
    } as unknown as PoolClient;
    const pool = {
      connect: vi.fn().mockResolvedValue(client),
    } as unknown as Pool;

    await expect(
      sweepDueIdentityHandles(pool, confirmedAt),
    ).resolves.toEqual([handleId]);
    expect(query.mock.calls[2]?.[0]).toContain(
      "SET status = 'expired'",
    );
    expect(query.mock.calls[3]?.[0]).toContain(
      "identity_handle_lifecycle_events",
    );
    expect(query.mock.calls[4]?.[0]).toContain("audit_events");
  });
});
