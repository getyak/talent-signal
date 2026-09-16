import { describe, expect, it } from "vitest";

import {
  sessionReturnHref,
  validReturnSessionId,
  withReturnSession,
} from "./session-return-navigation";

const SESSION_ID = "10000000-0000-4000-8000-000000000001";

describe("Session return navigation", () => {
  it("accepts only a canonical UUID-shaped Session identifier", () => {
    expect(validReturnSessionId(SESSION_ID)).toBe(SESSION_ID);
    expect(validReturnSessionId("../../another-account")).toBeNull();
    expect(validReturnSessionId(undefined)).toBeNull();
  });

  it("preserves the Session through relationship routes and anchors", () => {
    expect(
      withReturnSession(
        "/workspace?person=person-1&context=context-1#proposed-changes",
        SESSION_ID,
      ),
    ).toBe(
      `/workspace?person=person-1&context=context-1&session=${SESSION_ID}#proposed-changes`,
    );
  });

  it("returns only to the local canonical Session route", () => {
    expect(sessionReturnHref(SESSION_ID)).toBe(
      `/workspace/sessions/${SESSION_ID}`,
    );
    expect(sessionReturnHref(null)).toBeNull();
  });
});
