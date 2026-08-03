import Link from "next/link";
import { BrandMark } from "./brand-mark";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell site-footer__inner">
        <div className="site-footer__brand">
          <BrandMark />
          <p>
            Candidate momentum for relationship-led search.
          </p>
        </div>

        <nav className="site-footer__links" aria-label="Footer navigation">
          <div>
            <p className="footer-heading">Explore</p>
            <Link href="/#product">Product</Link>
            <Link href="/#method">Method</Link>
            <Link href="/demo">Open live demo</Link>
          </div>
          <div>
            <p className="footer-heading">Trust</p>
            <Link href="/#principles">Principles</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/#questions">Questions</Link>
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
