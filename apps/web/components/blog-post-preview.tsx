import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import Link from "next/link";
import {
  type BlogPost,
  formatBlogDate,
  getBlogPostReadingMinutes,
} from "@/lib/blog";

type BlogPostPreviewProps = {
  post: BlogPost;
  priority?: boolean;
  variant?: "featured" | "standard" | "compact";
};

export function BlogPostPreview({
  post,
  priority = false,
  variant = "standard",
}: BlogPostPreviewProps) {
  const href = `/blog/${post.slug}`;

  if (variant === "compact") {
    return (
      <article className="blog-preview blog-preview--compact">
        <div className="blog-preview__meta">
          <span>{post.category}</span>
          <span>{getBlogPostReadingMinutes(post)} min read</span>
        </div>
        <h3>
          <Link href={href}>{post.title}</Link>
        </h3>
        <p>{post.excerpt}</p>
        <Link className="text-link" href={href}>
          Read article
          <ArrowRight aria-hidden="true" size={15} />
        </Link>
      </article>
    );
  }

  return (
    <article
      className={`blog-preview blog-preview--${variant}`}
    >
      <Link
        className="blog-preview__image"
        href={href}
        aria-label={`Read ${post.title}`}
      >
        <Image
          src={post.heroImage}
          alt={post.heroAlt}
          width={1672}
          height={941}
          preload={priority}
          fetchPriority={priority ? "high" : undefined}
          sizes={
            variant === "featured"
              ? "(max-width: 767px) 100vw, 62vw"
              : "(max-width: 767px) 100vw, 46vw"
          }
        />
      </Link>
      <div className="blog-preview__copy">
        <div className="blog-preview__meta">
          <span>{post.category}</span>
          <span>
            {formatBlogDate(post.publishedAt)} ·{" "}
            {getBlogPostReadingMinutes(post)} min read
          </span>
        </div>
        <h2>
          <Link href={href}>{post.title}</Link>
        </h2>
        <p>{post.excerpt}</p>
        <Link className="text-link" href={href}>
          Read article
          <ArrowRight aria-hidden="true" size={15} />
        </Link>
      </div>
    </article>
  );
}
