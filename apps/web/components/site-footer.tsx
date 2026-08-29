import Link from "next/link";
import { BrandMark } from "./brand-mark";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell site-footer__inner">
        <div className="site-footer__brand">
          <BrandMark />
          <p>
            为高价值、关系驱动型寻访而生的关系智能工作台。
          </p>
        </div>

        <nav className="site-footer__links" aria-label="页脚导航">
          <div>
            <p className="footer-heading">探索</p>
            <Link href="/#product">产品</Link>
            <Link href="/relationships">关系工作台</Link>
            <Link href="/demo">在线演示</Link>
            <Link href="/#method">方法</Link>
            <Link href="/blog">研究</Link>
            <Link href="/login?callbackUrl=/workspace">工作台</Link>
          </div>
          <div>
            <p className="footer-heading">信任</p>
            <Link href="/#principles">决策边界</Link>
            <Link href="/privacy">隐私</Link>
            <Link href="/blog/about">编辑方法</Link>
            <Link href="/#questions">常见问题</Link>
            <Link href="/rss.xml">RSS</Link>
          </div>
        </nav>
      </div>
      <div className="shell site-footer__base">
        <p>© {new Date().getFullYear()} Talent Signal</p>
        <p>为判断而建，不为监控而生。</p>
      </div>
    </footer>
  );
}
