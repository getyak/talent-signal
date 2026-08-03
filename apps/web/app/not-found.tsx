import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="not-found shell">
        <p className="metadata">Page not found</p>
        <h1>This signal went quiet.</h1>
        <p>The page may have moved, or the address may be incomplete.</p>
        <Link className="button" href="/">
          Return home
        </Link>
      </main>
    </>
  );
}
