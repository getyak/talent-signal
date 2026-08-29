import {
  editorialAuthor,
  getBlogPostsByNewest,
  getLatestBlogUpdate,
} from "@/lib/blog";
import { siteConfig } from "@/lib/site";

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function GET() {
  const items = getBlogPostsByNewest()
    .map((post) => {
      const url = `${siteConfig.url}/blog/${post.slug}`;

      return `
    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <description>${escapeXml(post.description)}</description>
      <author>${escapeXml(`${siteConfig.email} (${editorialAuthor.name})`)}</author>
      <category>${escapeXml(post.category)}</category>
      <pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>
    </item>`;
    })
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml("Talent Signal 招聘研究与实践方法")}</title>
    <link>${escapeXml(`${siteConfig.url}/blog`)}</link>
    <description>${escapeXml("面向候选人进展与关系驱动寻访的证据优先方法。")}</description>
    <language>zh-CN</language>
    <lastBuildDate>${new Date(getLatestBlogUpdate()).toUTCString()}</lastBuildDate>
    <atom:link href="${escapeXml(`${siteConfig.url}/rss.xml`)}" rel="self" type="application/rss+xml" />${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}
