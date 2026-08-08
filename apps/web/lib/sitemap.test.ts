import { describe, expect, it } from "vitest";
import sitemap from "../app/sitemap";
import { blogPosts, getLatestBlogUpdate } from "./blog";
import { siteConfig } from "./site";

describe("public sitemap", () => {
  const entries = sitemap();

  it("lists every canonical public page once in deterministic order", () => {
    const expectedUrls = [
      siteConfig.url,
      `${siteConfig.url}/relationships`,
      `${siteConfig.url}/demo`,
      `${siteConfig.url}/blog`,
      ...blogPosts.map((post) => `${siteConfig.url}/blog/${post.slug}`),
      `${siteConfig.url}/blog/about`,
      `${siteConfig.url}/privacy`,
    ];
    const urls = entries.map((entry) => entry.url);

    expect(urls).toEqual(expectedUrls);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("keeps private and account routes out of discovery", () => {
    const urls = entries.map((entry) => new URL(entry.url).pathname);

    expect(urls).not.toContain("/login");
    expect(urls).not.toContain("/workspace");
    expect(urls.every((path) => !path.startsWith("/api/"))).toBe(true);
  });

  it("uses canonical same-origin URLs and valid truthful update dates", () => {
    const canonicalOrigin = new URL(siteConfig.url).origin;

    for (const entry of entries) {
      expect(new URL(entry.url).origin).toBe(canonicalOrigin);
      expect(entry.lastModified).toBeTruthy();
      expect(Number.isNaN(Date.parse(String(entry.lastModified)))).toBe(false);
      expect(entry).not.toHaveProperty("priority");
      expect(entry).not.toHaveProperty("changeFrequency");
    }

    expect(entries.find((entry) => entry.url === `${siteConfig.url}/blog`))
      .toMatchObject({ lastModified: getLatestBlogUpdate() });
  });
});
