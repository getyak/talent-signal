import type { PersonDirectoryItem } from "@talent-signal/contracts";
import { describe, expect, it } from "vitest";

import {
  indistinguishablePersonIds,
  personIdentityChoiceClues,
  screenshotIdentityChoiceIssue,
} from "./person-identity-choice";

function person(
  id: string,
  overrides: Partial<PersonDirectoryItem> = {},
): PersonDirectoryItem {
  return {
    capture_count: 1,
    confirmed_identity_count: 0,
    context_count: 1,
    contexts: [
      {
        display_label: "Chief Product Officer search",
        id: `${id}-context`,
        last_activity_at: "2026-08-30T08:00:00.000Z",
      },
    ],
    display_label: "Leila Hartmann",
    id,
    identity_matches: [{ kind: "name" }],
    last_activity_at: "2026-08-30T08:00:00.000Z",
    avatar: null,
    profile: null,
    ...overrides,
  };
}

describe("person identity choices", () => {
  it("marks same-name records with the same governed clues as indistinguishable", () => {
    const ids = indistinguishablePersonIds([
      person("person-1"),
      person("person-2"),
    ]);

    expect([...ids]).toEqual(["person-1", "person-2"]);
  });

  it("does not treat a different relationship label as identity authority", () => {
    const ids = indistinguishablePersonIds([
      person("person-1"),
      person("person-2", {
        contexts: [
          {
            display_label: "CFO search",
            id: "person-2-context",
            last_activity_at: "2026-08-30T08:00:00.000Z",
          },
        ],
      }),
    ]);

    expect([...ids]).toEqual(["person-1", "person-2"]);
  });

  it("uses masked confirmed handles as visible distinguishing evidence", () => {
    const first = person("person-1", {
      identity_matches: [
        {
          display_hint: "l***@northstar.example",
          handle_type: "email",
          kind: "confirmed_handle",
          source_resource_id: null,
        },
      ],
    });
    const second = person("person-2", {
      identity_matches: [
        {
          display_hint: "l***@cedar.example",
          handle_type: "email",
          kind: "confirmed_handle",
          source_resource_id: null,
        },
      ],
    });

    expect(indistinguishablePersonIds([first, second]).size).toBe(0);
    expect(personIdentityChoiceClues(first)).toContain(
      "已确认邮箱 · l***@northstar.example",
    );
  });

  it("rejects forged selections and new-person creation during ambiguity", () => {
    const people = [person("person-1"), person("person-2")];

    expect(screenshotIdentityChoiceIssue(people, "person-1")).toBe(
      "ambiguous_existing_person",
    );
    expect(screenshotIdentityChoiceIssue(people, null)).toBe(
      "ambiguous_new_person",
    );
    expect(screenshotIdentityChoiceIssue(people, "person-forged")).toBe(
      "selected_person_not_in_candidates",
    );
  });
});
