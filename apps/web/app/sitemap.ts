import type { MetadataRoute } from "next";
import { blogPosts, getLatestBlogUpdate } from "../lib/blog";
import { siteConfig } from "../lib/site";

const publicPageLastModified = {
  home: "2026-08-06T16:20:00+08:00",
  relationships: "2026-08-08T08:00:00+08:00",
  demo: "2026-08-05T09:30:00+08:00",
  editorialMethod: "2026-08-05T09:30:00+08:00",
  privacy: "2026-08-05T09:30:00+08:00",
} as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteConfig.url,
      lastModified: publicPageLastModified.home,
    },
    {
      url: `${siteConfig.url}/relationships`,
      lastModified: publicPageLastModified.relationships,
    },
    {
      url: `${siteConfig.url}/demo`,
      lastModified: publicPageLastModified.demo,
    },
    {
      url: `${siteConfig.url}/blog`,
      lastModified: getLatestBlogUpdate(),
    },
    ...blogPosts.map((post) => ({
      url: `${siteConfig.url}/blog/${post.slug}`,
      lastModified: post.updatedAt,
    })),
    {
      url: `${siteConfig.url}/blog/about`,
      lastModified: publicPageLastModified.editorialMethod,
    },
    {
      url: `${siteConfig.url}/privacy`,
      lastModified: publicPageLastModified.privacy,
    },
  ];
}
