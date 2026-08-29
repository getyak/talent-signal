import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { BlogPostPreview } from "@/components/blog-post-preview";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { StructuredData } from "@/components/structured-data";
import { blogPosts, editorialAuthor } from "@/lib/blog";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "招聘研究与实践方法",
  description:
    "围绕候选人进展、人工监督、持续更新的候选人简报与关系驱动型寻访工作流展开的证据优先研究。",
  alternates: {
    canonical: "/blog",
  },
  openGraph: {
    type: "website",
    title: "Talent Signal 研究与实践方法",
    description:
      "面向候选人进展与关系驱动型寻访的证据优先方法。",
    url: "/blog",
    images: [
      {
        url: blogPosts[0].heroImage,
        width: 1672,
        height: 941,
        alt: blogPosts[0].heroAlt,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Talent Signal 研究与实践方法",
    description:
      "面向候选人进展与关系驱动型寻访的证据优先方法。",
    images: [blogPosts[0].heroImage],
  },
};

const blogSchema = {
  "@context": "https://schema.org",
  "@type": "Blog",
  "@id": `${siteConfig.url}/blog#blog`,
  name: "Talent Signal 研究与实践方法",
  description: metadata.description,
  url: `${siteConfig.url}/blog`,
  inLanguage: "zh-CN",
  author: {
    "@type": "Organization",
    name: editorialAuthor.name,
    url: `${siteConfig.url}${editorialAuthor.url}`,
  },
  publisher: {
    "@type": "Organization",
    name: siteConfig.name,
    url: siteConfig.url,
  },
  blogPost: blogPosts.map((post) => ({
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    url: `${siteConfig.url}/blog/${post.slug}`,
  })),
};

export default function BlogPage() {
  const [featuredPost, ...otherPosts] = blogPosts;

  return (
    <>
      <StructuredData value={blogSchema} />
      <SiteHeader />
      <main id="main-content" className="blog-index">
        <header className="blog-index__hero shell">
          <div>
            <p className="eyebrow">研究与实践方法</p>
            <h1>为关系驱动型寻访保留更好的背景。</h1>
          </div>
          <p>
            在候选人对话之间，保留证据、招聘顾问判断与下一个有用行动的方法。
          </p>
        </header>

        <section
          className="blog-index__featured shell"
          aria-labelledby="featured-article-title"
        >
          <h2 id="featured-article-title" className="sr-only">
            精选文章
          </h2>
          <BlogPostPreview post={featuredPost} priority variant="featured" />
        </section>

        <section
          className="blog-index__latest shell"
          aria-labelledby="latest-articles-title"
        >
          <header>
            <h2 id="latest-articles-title">最新文章</h2>
            <p>
              一组围绕证据、时间与招聘顾问自主决定展开的连贯研究。
            </p>
          </header>
          <div className="blog-index__grid">
            {otherPosts.map((post) => (
              <BlogPostPreview key={post.slug} post={post} />
            ))}
          </div>
        </section>

        <aside className="blog-index__method shell">
          <div>
            <h2>这些内容如何产生</h2>
            <p>
              我们把产品判断与外部事实分开，引用原始来源，明确展示实质性更新，并且不发布私密候选人证据。
            </p>
          </div>
          <Link className="text-link" href="/blog/about">
            阅读编辑方法
            <ArrowRight aria-hidden="true" size={15} />
          </Link>
        </aside>
      </main>
      <SiteFooter />
    </>
  );
}
