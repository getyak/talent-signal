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
  title: "Recruiting research and practical methods",
  description:
    "Evidence-first recruiting research on candidate momentum, human oversight, living candidate briefs, and relationship-led search workflows.",
  alternates: {
    canonical: "/blog",
  },
  openGraph: {
    type: "website",
    title: "Talent Signal research and practical methods",
    description:
      "Evidence-first methods for candidate momentum and relationship-led search.",
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
    title: "Talent Signal research and practical methods",
    description:
      "Evidence-first methods for candidate momentum and relationship-led search.",
    images: [blogPosts[0].heroImage],
  },
};

const blogSchema = {
  "@context": "https://schema.org",
  "@type": "Blog",
  "@id": `${siteConfig.url}/blog#blog`,
  name: "Talent Signal research and practical methods",
  description: metadata.description,
  url: `${siteConfig.url}/blog`,
  inLanguage: "en",
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
            <p className="eyebrow">Research and practical methods</p>
            <h1>Better context for relationship-led search.</h1>
          </div>
          <p>
            Methods for preserving evidence, recruiter judgment, and the next
            useful move across candidate conversations.
          </p>
        </header>

        <section
          className="blog-index__featured shell"
          aria-labelledby="featured-article-title"
        >
          <h2 id="featured-article-title" className="sr-only">
            Featured article
          </h2>
          <BlogPostPreview post={featuredPost} priority variant="featured" />
        </section>

        <section
          className="blog-index__latest shell"
          aria-labelledby="latest-articles-title"
        >
          <header>
            <h2 id="latest-articles-title">Latest articles</h2>
            <p>
              One connected body of work, built around evidence, time, and
              recruiter-owned decisions.
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
            <h2>How this work is made</h2>
            <p>
              We separate product judgment from external fact, cite original
              sources, show substantive updates, and do not publish private
              candidate evidence.
            </p>
          </div>
          <Link className="text-link" href="/blog/about">
            Read the editorial method
            <ArrowRight aria-hidden="true" size={15} />
          </Link>
        </aside>
      </main>
      <SiteFooter />
    </>
  );
}
