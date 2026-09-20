import { describe, expect, it } from "vitest";

import {
  authCookieSecure,
  decideAuthCookieSecure,
  type AuthCookieEnvironment,
} from "./auth-cookie-policy";

const production: AuthCookieEnvironment = { NODE_ENV: "production" };

function optedIn(authUrl: string): AuthCookieEnvironment {
  return {
    NODE_ENV: "production",
    TALENT_SIGNAL_ALLOW_LAN_HTTP: "true",
    AUTH_URL: authUrl,
  };
}

describe("auth cookie secure policy — defaults stay unchanged", () => {
  it("keeps Secure on for production without any opt-in", () => {
    expect(decideAuthCookieSecure(production)).toMatchObject({
      secure: true,
      lanHttpOverride: false,
    });
  });

  it("keeps Secure off outside production", () => {
    expect(authCookieSecure({ NODE_ENV: "development" })).toBe(false);
    expect(authCookieSecure({ NODE_ENV: "test" })).toBe(false);
    expect(authCookieSecure({})).toBe(false);
  });

  it("does not relax Secure outside production even with a valid opt-in", () => {
    expect(
      authCookieSecure({
        NODE_ENV: "development",
        TALENT_SIGNAL_ALLOW_LAN_HTTP: "true",
        AUTH_URL: "http://127.0.0.1",
      }),
    ).toBe(false);
  });

  it("treats a missing NODE_ENV as non-production, matching the old flag", () => {
    expect(authCookieSecure({})).toBe(false);
  });
});

describe("auth cookie secure policy — valid LAN HTTP opt-in", () => {
  it.each([
    "http://127.0.0.1",
    "http://localhost",
    "http://localhost:3000",
    "http://[::1]:3000",
    "http://10.1.2.3",
    "http://192.168.1.5:8080",
    "http://172.16.5.5",
    "http://172.31.255.254",
  ])("disables Secure for literal private origin %s", (authUrl) => {
    expect(decideAuthCookieSecure(optedIn(authUrl))).toMatchObject({
      secure: false,
      lanHttpOverride: true,
    });
  });

  it("requires the opt-in flag to be exactly true", () => {
    for (const flag of ["TRUE", "True", "1", "yes", " true", "true "]) {
      expect(
        authCookieSecure({
          NODE_ENV: "production",
          TALENT_SIGNAL_ALLOW_LAN_HTTP: flag,
          AUTH_URL: "http://127.0.0.1",
        }),
      ).toBe(true);
    }
  });

  it("keeps Secure on when the flag is set but the origin is missing", () => {
    expect(
      decideAuthCookieSecure({
        NODE_ENV: "production",
        TALENT_SIGNAL_ALLOW_LAN_HTTP: "true",
      }),
    ).toMatchObject({ secure: true, lanHttpOverride: false });
  });

  it("keeps Secure on when the origin is an empty string", () => {
    expect(authCookieSecure(optedIn(""))).toBe(true);
  });
});

describe("auth cookie secure policy — HTTPS is never relaxed", () => {
  it.each([
    "https://127.0.0.1",
    "https://localhost",
    "https://192.168.1.5",
    "https://[::1]",
    "https://10.1.2.3:8443",
  ])("keeps Secure on for opt-in origin %s", (authUrl) => {
    expect(decideAuthCookieSecure(optedIn(authUrl))).toMatchObject({
      secure: true,
      lanHttpOverride: false,
    });
  });
});

describe("auth cookie secure policy — rejected hosts", () => {
  it.each([
    "http://8.8.8.8",
    "http://203.0.113.10",
    "http://1.1.1.1",
    "http://127.0.0.1.evil.com",
    "http://myhost.local",
    "http://lan.example.com",
    "http://attacker.test",
  ])("keeps Secure on for non-literal or public host %s", (authUrl) => {
    expect(decideAuthCookieSecure(optedIn(authUrl))).toMatchObject({
      secure: true,
      lanHttpOverride: false,
    });
  });

  it.each([
    "http://172.15.5.5",
    "http://172.32.5.5",
    "http://172.0.0.1",
    "http://172.255.255.255",
  ])("rejects broad 172/8 boundary %s", (authUrl) => {
    expect(authCookieSecure(optedIn(authUrl))).toBe(true);
  });

  it.each(["http://169.254.1.1", "http://169.254.169.254"])(
    "rejects link-local address %s",
    (authUrl) => {
      expect(authCookieSecure(optedIn(authUrl))).toBe(true);
    },
  );

  it.each([
    "http://256.0.0.1",
    "http://192.168.1.999",
    "http://10.0.0",
    "http://10.0.0.0.1",
  ])("rejects out-of-range or malformed IPv4 literal %s", (authUrl) => {
    expect(authCookieSecure(optedIn(authUrl))).toBe(true);
  });
});

describe("auth cookie secure policy — malformed or normalized input", () => {
  it.each([
    "not a url",
    "127.0.0.1",
    "//127.0.0.1",
    "http://",
    "http://[::1",
  ])("keeps Secure on for unparseable origin %s", (authUrl) => {
    expect(authCookieSecure(optedIn(authUrl))).toBe(true);
  });

  it.each([
    "http://0x7f000001",
    "http://127.1",
    "http://2130706433",
    "http://0177.0.0.1",
    "http://127.0.0.1.",
    "http://[0:0:0:0:0:0:0:1]",
    "http://[::ffff:127.0.0.1]",
    "http://exa%6dple.com",
    "http://127.0.0.1\t.evil.com",
    "http://127.0.0.1\n.evil.com",
  ])("rejects host rewritten by URL normalization %s", (authUrl) => {
    expect(decideAuthCookieSecure(optedIn(authUrl))).toMatchObject({
      secure: true,
      lanHttpOverride: false,
    });
  });

  it.each([
    "http://user@127.0.0.1",
    "http://user:pass@192.168.1.5",
  ])("rejects userinfo in origin %s", (authUrl) => {
    expect(authCookieSecure(optedIn(authUrl))).toBe(true);
  });

  it.each([
    "http://127.0.0.1/admin",
    "http://192.168.1.5/api/",
  ])("rejects non-root path in origin %s", (authUrl) => {
    expect(authCookieSecure(optedIn(authUrl))).toBe(true);
  });

  it.each([
    "http://127.0.0.1?debug=1",
    "http://127.0.0.1#fragment",
    "http://127.0.0.1/?debug=1",
  ])("rejects query or fragment in origin %s", (authUrl) => {
    expect(authCookieSecure(optedIn(authUrl))).toBe(true);
  });

  it("rejects an origin with surrounding whitespace", () => {
    expect(authCookieSecure(optedIn(" http://127.0.0.1 "))).toBe(true);
  });

  it("rejects a non-http scheme", () => {
    expect(authCookieSecure(optedIn("ftp://127.0.0.1"))).toBe(true);
    expect(authCookieSecure(optedIn("javascript://127.0.0.1"))).toBe(true);
  });
});

describe("auth cookie secure policy — diagnostics", () => {
  it("explains an invalid opt-in so operators can act", () => {
    const decision = decideAuthCookieSecure(optedIn("http://8.8.8.8"));
    expect(decision.secure).toBe(true);
    expect(decision.reason).toMatch(/keep Secure|RFC1918|loopback/i);
  });

  it("explains the applied override", () => {
    const decision = decideAuthCookieSecure(optedIn("http://192.168.1.5"));
    expect(decision.reason).toMatch(/private-LAN/i);
  });
});
