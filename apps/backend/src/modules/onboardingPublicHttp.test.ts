import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
const requestMock = vi.hoisted(() => vi.fn());
vi.mock("node:https", () => ({ default: { request: requestMock } }));
import { pinnedProfileRequest, resolveProfileTarget, validateProfileTarget } from "./onboardingPublicHttp.js";
const url = new URL("https://example.com/about");
beforeEach(() => vi.clearAllMocks());
describe("public profile connection boundary", () => {
  it.each(["127.0.0.1", "169.254.169.254", "::ffff:127.0.0.1", "::ffff:c0a8:101", "64:ff9b::a9fe:a9fe"])("blocks resolved private addresses including mapped IPv6: %s", async address => {
    await expect(resolveProfileTarget(url, url.origin, async () => [{ address, family: address.includes(":") ? 6 : 4 }])).rejects.toThrow();
    expect(requestMock).not.toHaveBeenCalled();
  });
  it.each(["https://example.com:8443/about", "https://user:secret@example.com/about", "https://other.example/about", "http://example.com/about"])("rejects a redirected origin or credentials: %s", value => {
    expect(() => validateProfileTarget(new URL(value), url.origin)).toThrow();
  });
  it("pins the verified address for the TLS socket while preserving hostname/SNI", async () => {
    const resolver = vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]);
    const target = await resolveProfileTarget(url, url.origin, resolver);
    requestMock.mockImplementation((_url, options, callback) => {
      const req = new EventEmitter() as EventEmitter & { end: () => void; destroy: (error?: Error) => void };
      req.destroy = error => { if (error) req.emit("error", error); };
      req.end = () => {
        const pinned = vi.fn(); options.lookup("example.com", { all: true }, pinned);
        expect(pinned).toHaveBeenCalledWith(null, [{ address: "93.184.216.34", family: 4 }]);
        expect(options.servername).toBe("example.com"); expect(options.agent).toBe(false);
        const res = Object.assign(new EventEmitter(), { statusCode: 200, headers: { "content-type": "text/plain" } });
        callback(res); res.emit("data", Buffer.from("Synthetic public introduction")); res.emit("end");
      };
      return req;
    });
    const response = await pinnedProfileRequest(target, 500, AbortSignal.timeout(1000));
    expect(new TextDecoder().decode(response.bytes)).toContain("Synthetic");
    expect(resolver).toHaveBeenCalledTimes(1);
  });
});
