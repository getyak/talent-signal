import type { MetadataRoute } from "next";
import { blogPosts, getLatestBlogUpdate } from "@/lib/blog";
import { siteConfig } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const stableSiteUpdate = new Date("2026-08-05T09:30:00+08:00");

  return [
    {
      url: siteConfig.url,
      lastModified: stableSiteUpdate,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${siteConfig.url}/blog`,
      lastModified: new Date(getLatestBlogUpdate()),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    ...blogPosts.map((post) => ({
      url: `${siteConfig.url}/blog/${post.slug}`,
      lastModified: new Date(post.updatedAt),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    {
      url: `${siteConfig.url}/blog/about`,
      lastModified: stableSiteUpdate,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${siteConfig.url}/demo`,
      lastModified: stableSiteUpdate,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${siteConfig.url}/privacy`,
      lastModified: stableSiteUpdate,
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];
}
