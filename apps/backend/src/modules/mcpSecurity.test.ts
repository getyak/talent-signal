import { describe, expect, it } from "vitest";

import {
  decryptMcpCredential,
  encryptMcpCredential,
  isPublicIpAddress,
  loadMcpEncryptionKey,
  parseAllowedMcpOrigins,
  parsePublicMcpOrigin,
  resolveMcpServerUrl,
  McpUrlRejectedError,
} from "./mcpSecurity.js";

const key = loadMcpEncryptionKey(
  Buffer.alloc(32, 7).toString("base64"),
);
if (!key) throw new Error("synthetic key");

function resolve(hostname: string, address: string, family = 4) {
  return async () => [{ address, family }];
}

describe("MCP server URL policy", () => {
  it("accepts a public HTTPS endpoint and pins its resolved address", async () => {
    const target = await resolveMcpServerUrl("https://mcp.example.com/mcp", {
      allowedOrigins: [],
      resolver: resolve("mcp.example.com", "93.184.216.34"),
    });
    expect(target).toMatchObject({
      address: "93.184.216.34",
      origin: "https://mcp.example.com",
      trustedLocal: false,
    });
  });

  it.each([
    ["https://mcp.example.com/mcp", "127.0.0.1"],
    ["https://mcp.example.com/mcp", "10.1.2.3"],
    ["https://mcp.example.com/mcp", "172.16.5.5"],
    ["https://mcp.example.com/mcp", "192.168.1.10"],
    ["https://mcp.example.com/mcp", "169.254.169.254"],
    ["https://mcp.example.com/mcp", "100.64.1.1"],
    ["https://mcp.example.com/mcp", "::1"],
    ["https://mcp.example.com/mcp", "fc00::1"],
    ["https://mcp.example.com/mcp", "fe80::1"],
    ["https://mcp.example.com/mcp", "::ffff:192.168.0.1"],
    ["https://mcp.example.com/mcp", "2001:db8::1"],
  ])("rejects %s resolving to %s", async (url, address) => {
    await expect(
      resolveMcpServerUrl(url, {
        allowedOrigins: [],
        resolver: resolve("mcp.example.com", address, address.includes(":") ? 6 : 4),
      }),
    ).rejects.toMatchObject({ code: "MCP_ENDPOINT_REJECTED" });
  });

  it("rejects a hostname when any resolved address is private (rebinding)", async () => {
    await expect(
      resolveMcpServerUrl("https://mcp.example.com/mcp", {
        allowedOrigins: [],
        resolver: async () => [
          { address: "93.184.216.34", family: 4 },
          { address: "10.0.0.5", family: 4 },
        ],
      }),
    ).rejects.toBeInstanceOf(McpUrlRejectedError);
  });

  it.each([
    "https://user:pass@mcp.example.com/mcp",
    "https://mcp.example.com/mcp?token=abc",
    "https://mcp.example.com/mcp#frag",
    "ftp://mcp.example.com/mcp",
    "http://mcp.example.com/mcp",
    "https://localhost/mcp",
    "https://metadata.google.internal/mcp",
  ])("rejects %s before any network IO", async (url) => {
    await expect(
      resolveMcpServerUrl(url, {
        allowedOrigins: [],
        resolver: resolve("mcp.example.com", "93.184.216.34"),
      }),
    ).rejects.toBeInstanceOf(McpUrlRejectedError);
  });

  it("allows an exact deployment-allowlisted local developer origin", async () => {
    const target = await resolveMcpServerUrl("http://127.0.0.1:4519/mcp", {
      allowedOrigins: ["http://127.0.0.1:4519"],
      resolver: resolve("127.0.0.1", "127.0.0.1"),
    });
    expect(target.trustedLocal).toBe(true);
    await expect(
      resolveMcpServerUrl("http://127.0.0.1:4520/mcp", {
        allowedOrigins: ["http://127.0.0.1:4519"],
        resolver: resolve("127.0.0.1", "127.0.0.1"),
      }),
    ).rejects.toBeInstanceOf(McpUrlRejectedError);
  });

  it("parses deployment configuration strictly", () => {
    expect(parseAllowedMcpOrigins("https://a.example, http://127.0.0.1:9")).toEqual([
      "https://a.example",
      "http://127.0.0.1:9",
    ]);
    expect(() => parseAllowedMcpOrigins("https://a.example/path")).toThrow();
    expect(() => parseAllowedMcpOrigins("https://user:pass@a.example")).toThrow();
    expect(() => parseAllowedMcpOrigins("https://a.example?x=1")).toThrow();
    expect(() => parseAllowedMcpOrigins("https://a.example#frag")).toThrow();
    expect(() => parseAllowedMcpOrigins("http://a.example")).toThrow();
    expect(parsePublicMcpOrigin("https://app.example.com")).toBe(
      "https://app.example.com",
    );
    expect(parsePublicMcpOrigin(undefined)).toBeNull();
    expect(() => parsePublicMcpOrigin("http://app.example.com")).toThrow();
    expect(() => parsePublicMcpOrigin("https://user:pass@app.example.com")).toThrow();
    expect(() => parsePublicMcpOrigin("https://app.example.com/path")).toThrow();
    expect(() => parsePublicMcpOrigin("https://app.example.com?q=1")).toThrow();
    expect(parsePublicMcpOrigin("http://localhost:3000")).toBe(
      "http://localhost:3000",
    );
  });
});

describe("MCP address classification", () => {
  it.each(["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700::1111"])(
    "accepts public %s",
    (address) => {
      expect(isPublicIpAddress(address)).toBe(true);
    },
  );
  it.each([
    "0.0.0.0",
    "10.0.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.20.0.1",
    "192.168.0.1",
    "100.100.100.200",
    "::",
    "::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "ff02::1",
    "2001:db8::1",
    "::ffff:10.0.0.1",
    "64:ff9b::7f00:1",
    "2002:7f00:0001::",
  ])("rejects reserved %s", (address) => {
    expect(isPublicIpAddress(address)).toBe(false);
  });
});

describe("MCP credential encryption", () => {
  it("round-trips a secret and detects tampering", () => {
    const encrypted = encryptMcpCredential("synthetic-bearer", key);
    expect(encrypted).not.toContain("synthetic-bearer");
    expect(decryptMcpCredential(encrypted, key)).toBe("synthetic-bearer");
    const parts = encrypted.split(".");
    const tampered = [parts[0], parts[1], parts[2], `${parts[3]}AA`].join(".");
    expect(() => decryptMcpCredential(tampered, key)).toThrow();
  });

  it("fails with a different key", () => {
    const other = loadMcpEncryptionKey(Buffer.alloc(32, 9).toString("base64"));
    if (!other) throw new Error("synthetic key");
    expect(() =>
      decryptMcpCredential(encryptMcpCredential("s", key), other),
    ).toThrow();
  });

  it("requires a 32-byte base64 key", () => {
    expect(loadMcpEncryptionKey(undefined)).toBeNull();
    expect(loadMcpEncryptionKey("")).toBeNull();
    expect(() => loadMcpEncryptionKey(Buffer.alloc(16).toString("base64"))).toThrow();
  });
});
