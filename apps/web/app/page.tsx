import {
  ArrowRight,
  CheckCircle,
  Eye,
  LockKey,
  SlidersHorizontal,
} from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import Link from "next/link";
import { BlogPostPreview } from "@/components/blog-post-preview";
import { CandidateLibraryPreview } from "@/components/candidate-library-preview";
import { FaqList } from "@/components/faq-list";
import { Reveal } from "@/components/reveal";
import { SignalSceneShell } from "@/components/signal-scene-shell";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { StructuredData } from "@/components/structured-data";
import { blogPosts } from "@/lib/blog";
import { faqs, siteConfig } from "@/lib/site";

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: siteConfig.name,
  url: siteConfig.url,
  description: siteConfig.description,
};

const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: siteConfig.name,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web, iOS",
  description: siteConfig.description,
  audience: {
    "@type": "Audience",
    audienceType: "Independent recruiters and boutique search firms",
  },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.answer,
    },
  })),
};

export default function HomePage() {
  return (
    <>
      <StructuredData value={organizationSchema} />
      <StructuredData value={softwareSchema} />
      <StructuredData value={faqSchema} />
      <SiteHeader />

      <main id="main-content">
        <section className="hero shell" aria-labelledby="hero-title">
          <div className="hero__copy">
            <div>
              <p className="eyebrow">Relational intelligence for search</p>
              <h1 id="hero-title">Know who needs you now.</h1>
              <p className="hero__lede">
                Turn candidate conversations into a living, source-linked brief
                with one clear next move.
              </p>
              <div className="hero__actions">
                <Link
                  className="button"
                  href="/login?callbackUrl=/workspace"
                >
                  Enter workspace
                  <ArrowRight aria-hidden="true" size={17} />
                </Link>
                <Link className="button button--secondary" href="/#product">
                  See the product
                </Link>
              </div>
            </div>
          </div>

          <div className="hero__visual">
            <div className="signal-frame">
              <div className="signal-frame__topline">
                <span>Relationship context</span>
                <span>One-hop view</span>
              </div>
              <SignalSceneShell />
              <div className="signal-frame__outcome">
                <span>
                  <strong>4</strong> confirmed facts
                </span>
                <span>
                  <strong>1</strong> next action
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="principle-rail" aria-label="Product guarantees">
          <div className="shell principle-rail__inner">
            <p>
              <Eye aria-hidden="true" size={20} />
              Every claim keeps its source
            </p>
            <p>
              <SlidersHorizontal aria-hidden="true" size={20} />
              Every view keeps its context
            </p>
            <p>
              <LockKey aria-hidden="true" size={20} />
              Nothing changes silently
            </p>
          </div>
        </section>

        <section
          id="product"
          className="workspace-story section shell"
          aria-labelledby="workspace-story-title"
        >
          <Reveal className="workspace-story__heading">
            <h2 id="workspace-story-title">
              One candidate. Every useful view.
            </h2>
            <p>
              Cards help you scan. Lists help you compare. The candidate page
              keeps the facts, decisions, and history intact.
            </p>
          </Reveal>
          <Reveal delay={0.08}>
            <CandidateLibraryPreview />
          </Reveal>
        </section>

        <section className="evidence-story section shell">
          <Reveal className="evidence-story__heading">
            <h2>A living page, not another summary.</h2>
            <p>
              New information appends to the record. Earlier facts remain
              visible, so every decision can be traced to its evidence.
            </p>
          </Reveal>

          <Reveal className="evidence-story__image" delay={0.08}>
            <Image
              src="/images/evidence-thread.webp"
              alt="Paper evidence fragments connected by one red thread through a clear glass frame."
              width={1568}
              height={1003}
              sizes="(max-width: 767px) 100vw, 88vw"
            />
          </Reveal>

          <div className="evidence-story__notes">
            <Reveal>
              <p className="metadata">What changed</p>
              <p>A competing offer created decision pressure.</p>
            </Reveal>
            <Reveal delay={0.05}>
              <p className="metadata">What remains open</p>
              <p>Remote flexibility still needs client confirmation.</p>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="metadata">Smallest next move</p>
              <p>Confirm policy before adding another interview.</p>
            </Reveal>
          </div>
        </section>

        <section id="method" className="method-section section shell">
          <div className="method-section__visual">
            <Reveal>
              <Image
                src="/images/recruiter-notes.webp"
                alt="An executive recruiter using a red pencil to review handwritten candidate notes."
                width={1122}
                height={1402}
                sizes="(max-width: 767px) 100vw, 42vw"
              />
            </Reveal>
          </div>

          <div className="method-section__content">
            <Reveal>
              <h2>Designed around recruiter judgment.</h2>
              <p>
                Talent Signal protects the context behind a relationship
                without pretending to replace the person who earned it.
              </p>
            </Reveal>

            <div className="method-list">
              <Reveal>
                <article>
                  <h3>Capture with intent</h3>
                  <p>
                    Import one meaningful conversation and choose whether its
                    source should be retained.
                  </p>
                </article>
              </Reveal>
              <Reveal delay={0.05}>
                <article>
                  <h3>Confirm every change</h3>
                  <p>
                    Review, edit, or dismiss proposed updates before they leave
                    the workspace.
                  </p>
                </article>
              </Reveal>
              <Reveal delay={0.1}>
                <article>
                  <h3>Advance with context</h3>
                  <p>
                    See one decision, its evidence, and the smallest action
                    that reduces uncertainty.
                  </p>
                </article>
              </Reveal>
            </div>
          </div>
        </section>

        <section
          id="principles"
          className="trust-section section shell"
          aria-labelledby="trust-title"
        >
          <Reveal className="trust-section__heading">
            <h2 id="trust-title">Restraint is a product feature.</h2>
            <p>
              High-trust search needs visible boundaries, not invisible
              automation.
            </p>
          </Reveal>

          <div className="trust-principles">
            <Reveal>
              <article>
                <CheckCircle aria-hidden="true" size={24} />
                <h3>Facts before inference</h3>
                <p>
                  Verified statements stay distinct from product judgment.
                </p>
              </article>
            </Reveal>
            <Reveal delay={0.05}>
              <article>
                <CheckCircle aria-hidden="true" size={24} />
                <h3>Consent before mutation</h3>
                <p>
                  Contact and calendar actions require explicit confirmation.
                </p>
              </article>
            </Reveal>
            <Reveal delay={0.1}>
              <article>
                <CheckCircle aria-hidden="true" size={24} />
                <h3>History before overwrite</h3>
                <p>
                  New facts may supersede old ones, but the chain stays
                  readable.
                </p>
              </article>
            </Reveal>
          </div>
        </section>

        <section
          className="home-journal section shell"
          aria-labelledby="home-journal-title"
        >
          <Reveal className="home-journal__heading">
            <h2 id="home-journal-title">Research for the next conversation.</h2>
            <p>
              Practical methods for candidate momentum, human oversight, and
              context that survives between conversations.
            </p>
          </Reveal>
          <div className="home-journal__layout">
            <Reveal>
              <BlogPostPreview post={blogPosts[0]} />
            </Reveal>
            <div className="home-journal__secondary">
              {blogPosts.slice(1).map((post, index) => (
                <Reveal key={post.slug} delay={index * 0.05}>
                  <BlogPostPreview post={post} variant="compact" />
                </Reveal>
              ))}
              <Reveal delay={0.1}>
                <Link className="text-link" href="/blog">
                  Browse all research
                  <ArrowRight aria-hidden="true" size={15} />
                </Link>
              </Reveal>
            </div>
          </div>
        </section>

        <section
          id="questions"
          className="faq-section section shell"
          aria-labelledby="faq-title"
        >
          <Reveal className="faq-section__heading">
            <h2 id="faq-title">Before you put trust in the system.</h2>
            <p>The boundaries matter as much as the recommendation.</p>
          </Reveal>
          <Reveal>
            <FaqList />
          </Reveal>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
