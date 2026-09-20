import { describe, expect, it, vi } from "vitest";
import { activeDirectorySessions, readWorkspaceDirectory } from "./workspace-search";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

const sessions = { session_version: "account-a", sessions: [] };

describe("disposable workspace directory", () => {
  it("does not publish the old account after cancellation during body decoding", async () => {
    const body = deferred<unknown>();
    const controller = new AbortController();
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json({ people: [{ id: "a", display_label: "Private A" }] }))
      .mockResolvedValueOnce({ ok: true, json: () => body.promise });
    const pending = readWorkspaceDirectory("account-a", controller.signal, request);
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    controller.abort();
    body.resolve(sessions);
    expect(await pending).toBeNull();
  });

  it("fails closed for a different credential binding even when people were returned", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json({ people: [{ id: "a", display_label: "Private A" }] }))
      .mockResolvedValueOnce(Response.json(sessions));
    await expect(readWorkspaceDirectory("account-b", new AbortController().signal, request)).rejects.toThrow("binding");
  });

  it("performs fresh uncached reads on each directory activation", async () => {
    const request = vi.fn(async (url: RequestInfo | URL, options?: RequestInit) => {
      expect(options?.cache).toBe("no-store");
      return String(url).includes("people") ? Response.json({ people: [] }) : Response.json(sessions);
    });
    await readWorkspaceDirectory("account-a", new AbortController().signal, request);
    await readWorkspaceDirectory("account-a", new AbortController().signal, request);
    expect(request).toHaveBeenCalledTimes(4);
    expect(request.mock.calls.every(([, options]) => options?.cache === "no-store")).toBe(true);
  });

  it("removes exact-deadline, deleted and malformed rows without another request", () => {
    const row = { session_id: "a", state: "active", expires_at: "2030-01-01T00:00:00Z" };
    const expiry = Date.parse(row.expires_at);
    const payload = { sessions: [row, { ...row, state: "deleted" }, { ...row, expires_at: "invalid" }] };
    expect(activeDirectorySessions(payload, expiry - 1).sessions).toEqual([row]);
    expect(activeDirectorySessions(payload, expiry).sessions).toEqual([]);
  });
});
