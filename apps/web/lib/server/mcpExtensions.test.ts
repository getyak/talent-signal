import { afterEach, describe, expect, it, vi } from "vitest";

const { authenticated } = vi.hoisted(() => ({ authenticated: vi.fn() }));
vi.mock("./backendAuth", () => ({
  authenticatedBackendClient: authenticated,
}));

import { loadMcpExtensionSnapshot } from "./mcpExtensions";

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("server-side MCP extension snapshot", () => {
  it("fails with the auth error when there is no backend client", async () => {
    authenticated.mockResolvedValue(null);
    await expect(loadMcpExtensionSnapshot()).rejects.toMatchObject({
      code: "AUTH_REQUIRED",
    });
  });

  it("loads the three projections under one bounded signal", async () => {
    const signals = new Map<string, AbortSignal | undefined>();
    const tracked = <T>(key: string, value: T) =>
      vi.fn(async (signal?: AbortSignal) => {
        signals.set(key, signal);
        return value;
      });
    authenticated.mockResolvedValue({
      listMcpConnections: tracked("connections", { connections: [{ id: "c" }] }),
      listMcpClientGrants: tracked("grants", { grants: [{ id: "g" }] }),
      getMcpEndpoints: tracked("endpoints", { configured: true }),
    });
    const snapshot = await loadMcpExtensionSnapshot();
    expect(snapshot).toMatchObject({
      connections: [{ id: "c" }],
      endpoints: { configured: true },
      grants: [{ id: "g" }],
    });
    for (const key of ["connections", "grants", "endpoints"]) {
      expect(signals.get(key)).toBeInstanceOf(AbortSignal);
    }
  });

  it("aborts every projection when the deadline elapses", async () => {
    vi.useFakeTimers();
    const hanging = vi.fn(
      (signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          });
        }),
    );
    authenticated.mockResolvedValue({
      listMcpConnections: hanging,
      listMcpClientGrants: hanging,
      getMcpEndpoints: hanging,
    });
    const pending = loadMcpExtensionSnapshot();
    const assertion = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.advanceTimersByTimeAsync(8_500);
    await assertion;
  });
});
