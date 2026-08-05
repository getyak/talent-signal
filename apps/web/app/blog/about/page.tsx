import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { StructuredData } from "@/components/structured-data";
import { editorialAuthor } from "@/lib/blog";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Editorial method",
  description:
    "How Talent Signal researches, writes, sources, updates, and corrects public work about evidence-first relationship intelligence.",
  alternates: {
    canonical: "/blog/about",
  },
};

const editorialSchema = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  "@id": `${siteConfig.url}/blog/about#page`,
  name: "Talent Signal editorial method",
  description: metadata.description,
  url: `${siteConfig.url}/blog/about`,
  mainEntity: {
    "@type": "Organization",
    "@id": `${siteConfig.url}/blog/about#editorial`,
    name: editorialAuthor.name,
    description: editorialAuthor.description,
    url: `${siteConfig.url}/blog/about`,
    parentOrganization: {
      "@type": "Organization",
      name: siteConfig.name,
      url: siteConfig.url,
    },
  },
};

export default function EditorialMethodPage() {
  return (
    <>
      <StructuredData value={editorialSchema} />
      <SiteHeader />
      <main id="main-content" className="editorial-page">
        <article className="shell editorial-page__inner">
          <header>
            <p className="eyebrow">Editorial method</p>
            <h1>Trust starts with how a claim is made.</h1>
            <p>
              Talent Signal Editorial turns product research into practical
              guidance for independent recruiters and boutique search teams.
            </p>
          </header>

          <div className="editorial-page__principles">
            <section id="who-writes">
              <h2>Who writes</h2>
              <p>
                Articles are published under Talent Signal Editorial while a
                named publication owner is being established. The byline is an
                organization identity, not a fictional person.
              </p>
            </section>
            <section id="how-we-research">
              <h2>How we research</h2>
              <p>
                We begin with a recruiter question, inspect existing product
                evidence, and use primary documentation for external claims.
                Product judgment, examples, and external facts remain distinct.
              </p>
            </section>
            <section id="ai-assistance">
              <h2>How AI may assist</h2>
              <p>
                AI may help organize research or draft language. Its output is
                not treated as evidence, authority, or publication approval.
                Sources and visible claims must still agree.
              </p>
            </section>
            <section id="updates">
              <h2>How we update</h2>
              <p>
                The modified date changes only after a substantive visible
                edit. Material corrections preserve the canonical URL and are
                explained when they could change a reader&apos;s decision.
              </p>
            </section>
            <section id="privacy">
              <h2>What we do not publish</h2>
              <p>
                We do not publish private candidate conversations, screenshots,
                identities, or derived personal facts without explicit,
                purpose-bound authorization. Illustrative examples remain
                generic and are labeled by context.
              </p>
            </section>
          </div>

          <aside>
            <h2>Questions or corrections</h2>
            <p>
              Send the article URL, the claim in question, and the primary
              source that supports the correction.
            </p>
            <a className="text-link" href={`mailto:${siteConfig.email}`}>
              Contact editorial
              <ArrowRight aria-hidden="true" size={15} />
            </a>
          </aside>

          <Link className="editorial-page__back" href="/blog">
            Back to all articles
          </Link>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
