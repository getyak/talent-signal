import { CONTRACT_VERSION } from "@talent-signal/contracts";
import { describe, expect, it } from "vitest";

import {
  connectionPresentation,
  webWorkspaceConnections,
} from "./workspace-plugs";

describe("workspace connector presentation", () => {
  it.each(["not_connected", "authorizing", "connected", "expired", "revoked", "error"] as const)(
    "keeps %s distinct",
    (status) => {
      const result = connectionPresentation({
        id: "calendar",
        label: "Calendar",
        description: "Calendar adapter",
        status,
        scopeLabel: "none",
        canAuthorize: false,
        errorCode: status === "error" ? "PROVIDER_TIMEOUT" : null,
      });
      expect(result.status).toBe(status);
      expect(result.statusLabel).toBeTruthy();
      if (["authorizing", "expired", "revoked", "error"].includes(status)) {
        expect(result.recovery).toBeTruthy();
      }
    },
  );

  it("does not promote Google sign-in to calendar authorization", () => {
    const connections = webWorkspaceConnections({
      contract_version: CONTRACT_VERSION,
      user: {
        id: "10000000-0000-4000-8000-000000000001",
        email: "owner@example.test",
        display_name: "Owner",
        username: null,
        kind: "google_human",
        revision: 1,
        login_methods: ["google"],
      },
      workspace: {
        id: "20000000-0000-4000-8000-000000000002",
        name: "Workspace",
        slug: "workspace",
        revision: 1,
        owner_user_id: "10000000-0000-4000-8000-000000000001",
        role: "admin",
        is_owner: true,
        can_manage: true,
        is_test: false,
      },
      sessions: [],
      members: [],
      activity: [],
      lab_enabled: false,
    });
    expect(connections.find((item) => item.id === "account-sign-in")?.status).toBe("connected");
    expect(connections.find((item) => item.id === "google-calendar")).toMatchObject({
      canAuthorize: false,
      status: "not_connected",
    });
  });
});
