import { describe, expect, it } from "vitest";
import {
  blogPosts,
  getBlogPost,
  getBlogPostsByNewest,
  getBlogPostText,
  getBlogPostWordCount,
  getLatestBlogUpdate,
} from "./blog";

describe("blog content contract", () => {
  it("keeps public article identities unique", () => {
    expect(new Set(blogPosts.map((post) => post.slug)).size).toBe(
      blogPosts.length,
    );
    expect(new Set(blogPosts.map((post) => post.seoTitle)).size).toBe(
      blogPosts.length,
    );
  });

  it("keeps every article substantive and search-ready", () => {
    for (const post of blogPosts) {
      expect(post.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(post.description.length).toBeGreaterThanOrEqual(120);
      expect(post.description.length).toBeLessThanOrEqual(165);
      expect(post.keyTakeaways.length).toBeGreaterThanOrEqual(3);
      expect(getBlogPostWordCount(post)).toBeGreaterThan(650);
      expect(new Date(post.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(post.publishedAt).getTime(),
      );
      expect(new Set(post.sections.map((section) => section.id)).size).toBe(
        post.sections.length,
      );
      expect(post.sources.length).toBeGreaterThan(0);
    }
  });

  it("keeps sources and related reading resolvable", () => {
    for (const post of blogPosts) {
      for (const source of post.sources) {
        expect(source.url.startsWith("https://") || source.url.startsWith("/"))
          .toBe(true);
      }

      for (const relatedSlug of post.relatedSlugs) {
        expect(relatedSlug).not.toBe(post.slug);
        expect(getBlogPost(relatedSlug)).toBeDefined();
      }

      for (const section of post.sections) {
        for (const reference of section.references ?? []) {
          expect(post.sources[reference - 1]).toBeDefined();
        }
      }
    }
  });

  it("avoids typographic dash separators in visible article copy", () => {
    for (const post of blogPosts) {
      expect(getBlogPostText(post)).not.toMatch(/[—–]/);
    }
  });

  it("derives truthful feed and collection freshness", () => {
    const newest = getBlogPostsByNewest();

    expect(newest[0].publishedAt).toBe("2026-08-05T09:30:00+08:00");
    expect(getLatestBlogUpdate()).toBe("2026-08-05T09:30:00+08:00");
  });
});
