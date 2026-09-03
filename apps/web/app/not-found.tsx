import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="not-found shell" tabIndex={-1}>
        <p className="metadata">找不到页面</p>
        <h1>这条信号暂时安静了。</h1>
        <p>页面可能已移动，或地址并不完整。</p>
        <Link className="button" href="/">
          返回首页
        </Link>
      </main>
    </>
  );
}
