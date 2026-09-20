import { describe, expect, it } from "vitest";
import { normalizeOnboardingProfileUrl } from "./onboarding-profile-url";

describe("onboarding profile URL input", () => {
  it.each([
    ["cubxxw.com", "https://cubxxw.com"],
    ["  www.cubxxw.com/about  ", "https://www.cubxxw.com/about"],
    ["linkedin.com/in/example?locale=zh_CN#about", "https://linkedin.com/in/example?locale=zh_CN#about"],
    ["example.com:443/about", "https://example.com:443/about"],
    ["https://example.com/a%2Fb?topic=design#work", "https://example.com/a%2Fb?topic=design#work"],
    ["HTTPS://example.com/About?Topic=Design", "https://example.com/About?Topic=Design"],
    ["https://例子.公司/介绍", "https://例子.公司/介绍"],
    ["   ", ""],
  ])("normalizes %s without changing the destination", (input, expected) => {
    expect(normalizeOnboardingProfileUrl(input)).toBe(expected);
  });

  it.each([
    "not a URL", "just-a-name", "/about", "//example.com", "http://example.com",
    "javascript:alert(1)", "mailto:owner@example.com", "https:example.com",
    "owner:secret@example.com", "https://owner:secret@example.com",
    "https://127.0.0.1", "127.1", "https://0x7f000001", "https://[::1]",
    "localhost", "private.local", "private.internal", "foo.localhost",
    "private.local.", "foo.localhost.", "private.internal.", "https://private.local.",
    "example.com.", "https://example.com.",
    "https://exam\nple.com", "https://example.com\\private", "https://example.com/with space",
  ])("does not turn invalid or private input into a public URL: %s", input => {
    expect(normalizeOnboardingProfileUrl(input)).toBeNull();
  });

  it("checks the length after adding the scheme", () => {
    expect(normalizeOnboardingProfileUrl(`example.com/${"a".repeat(1988)}`)).toBeNull();
  });
});
