import Link from "next/link";
import { BrandMark } from "./brand-mark";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell site-footer__inner">
        <div className="site-footer__brand">
          <BrandMark />
          <p>
            Relationship intelligence for high-value, relationship-led search.
          </p>
        </div>

        <nav className="site-footer__links" aria-label="Footer navigation">
          <div>
            <p className="footer-heading">Explore</p>
            <Link href="/#product">Product</Link>
            <Link href="/demo">Live demo</Link>
            <Link href="/#method">Method</Link>
            <Link href="/blog">Research</Link>
            <Link href="/login?callbackUrl=/workspace">Workspace</Link>
          </div>
          <div>
            <p className="footer-heading">Trust</p>
            <Link href="/#principles">Decision boundary</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/blog/about">Editorial method</Link>
            <Link href="/#questions">Questions</Link>
            <Link href="/rss.xml">RSS</Link>
          </div>
        </nav>
      </div>
      <div className="shell site-footer__base">
        <p>© {new Date().getFullYear()} Talent Signal</p>
        <p>Built for judgment, not surveillance.</p>
      </div>
    </footer>
  );
}
