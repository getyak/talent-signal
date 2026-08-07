import { describe, expect, it } from "vitest";
import {
  maskIdentityHandle,
  parseIdentityHandleQuery,
} from "@talent-signal/contracts";

import {
  normalizeIdentityHandle,
  resolveIdentityCandidates,
  type ExistingPersonIdentity,
} from "./identityResolution.js";

const zhouId = "11111111-1111-4111-8111-111111111111";
const otherZhouId = "22222222-2222-4222-8222-222222222222";
const contextId = "33333333-3333-4333-8333-333333333333";

const people: ExistingPersonIdentity[] = [
  {
    personId: zhouId,
    displayLabel: "周屿",
    confirmedHandles: [
      { type: "email", value: "zhou.yu@example.com" },
      {
        type: "linkedin_url",
        value: "https://www.linkedin.com/in/zhou-yu/",
      },
    ],
  },
  {
    personId: otherZhouId,
    displayLabel: "周宇",
    confirmedHandles: [
      { type: "email", value: "another.zhou@example.com" },
    ],
  },
];

describe("stable person identity resolution", () => {
  it("normalizes public profile URLs without tracking identity", () => {
    expect(
      normalizeIdentityHandle(
        "public_profile_url",
        "http://EXAMPLE.com/profile/zhou/?utm_source=resume&ref=portfolio#about",
      ),
    ).toBe("https://example.com/profile/zhou?ref=portfolio");
  });

  it("detects supported identity clues and masks them for review", () => {
    expect(parseIdentityHandleQuery("微信: zhou-yu")).toEqual({
      type: "wechat",
      value: "zhou-yu",
    });
    expect(parseIdentityHandleQuery("+65 9123 4567")).toEqual({
      type: "phone",
      value: "+65 9123 4567",
    });
    expect(maskIdentityHandle("phone", "+65 9123 4567")).toBe(
      "•••• 4567",
    );
    expect(
      maskIdentityHandle("linkedin_url", "https://linkedin.com/in/zhou-yu"),
    ).toBe("linkedin.com/in/…");
  });

  it("proposes the same person for resume email and browser profile captures", () => {
    const resumeResult = resolveIdentityCandidates({
      displayNameHint: "周屿",
      hints: [
        {
          type: "email",
          value: "ZHOU.YU@example.com",
          source_client_resource_id: "resume-1",
        },
      ],
      existingPeople: people,
      relationshipContext: {
        status: "existing",
        relationship_context_id: contextId,
      },
    });
    const browserResult = resolveIdentityCandidates({
      displayNameHint: "周屿",
      hints: [
        {
          type: "linkedin_url",
          value:
            "http://www.linkedin.com/in/zhou-yu/?utm_source=browser",
          source_client_resource_id: "browser-1",
        },
      ],
      existingPeople: people,
      relationshipContext: {
        status: "proposed",
        label: "Industry contact · product leadership",
        purpose: "Preserve a separate industry relationship context",
      },
    });

    expect(resumeResult).toMatchObject({
      status: "proposed",
      candidate_person_id: zhouId,
      relationship_context: {
        status: "existing",
        relationship_context_id: contextId,
      },
    });
    expect(browserResult).toMatchObject({
      status: "proposed",
      candidate_person_id: zhouId,
      relationship_context: {
        status: "proposed",
        label: "Industry contact · product leadership",
      },
    });
  });

  it("does not merge a person from a matching name alone", () => {
    const result = resolveIdentityCandidates({
      displayNameHint: "周屿",
      hints: [],
      existingPeople: people,
    });

    expect(result).toEqual({
      status: "unresolved",
      display_name_hint: "周屿",
      handles: [],
      reason: "No usable confirmed identity handle was supplied.",
    });
  });

  it("surfaces conflicting handles instead of selecting one person", () => {
    const result = resolveIdentityCandidates({
      displayNameHint: "周屿",
      hints: [
        { type: "email", value: "zhou.yu@example.com" },
        { type: "email", value: "another.zhou@example.com" },
      ],
      existingPeople: people,
    });

    expect(result).toEqual({
      status: "candidates",
      candidate_person_ids: [zhouId, otherZhouId],
      reason:
        "The supplied identity handles conflict across more than one existing person.",
    });
  });
});
