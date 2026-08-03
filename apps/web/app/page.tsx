import {
  ArrowRight,
  CheckCircle,
  Eye,
  LockKey,
  SlidersHorizontal,
} from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import Link from "next/link";
import { FaqList } from "@/components/faq-list";
import { LiveBrief } from "@/components/live-brief";
import { Reveal } from "@/components/reveal";
import { SignalSceneShell } from "@/components/signal-scene-shell";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
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

function StructuredData({ value }: { value: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(value).replaceAll("<", "\\u003c"),
      }}
    />
  );
}

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
              <p className="eyebrow">Candidate momentum, made legible</p>
              <h1 id="hero-title">Know who needs you now.</h1>
              <p className="hero__lede">
                Turn recruiter-owned conversations into evidence-backed actions
                before momentum slips.
              </p>
              <div className="hero__actions">
                <Link className="button" href="/demo">
                  Open live demo
                  <ArrowRight aria-hidden="true" size={17} />
                </Link>
                <Link className="button button--secondary" href="/#method">
                  See the method
                </Link>
              </div>
            </div>
          </div>

          <div className="hero__visual">
            <div className="signal-frame">
              <div className="signal-frame__topline">
                <span>Evidence field</span>
                <span>Live model</span>
              </div>
              <SignalSceneShell />
              <div className="signal-frame__outcome">
                <span>
                  <strong>4</strong> explicit facts
                </span>
                <span>
                  <strong>1</strong> smallest next step
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
              Every change stays editable
            </p>
            <p>
              <LockKey aria-hidden="true" size={20} />
              Nothing mutates silently
            </p>
          </div>
        </section>

        <section id="product" className="evidence-story section shell">
          <Reveal className="evidence-story__heading">
            <h2>The signal is between the lines.</h2>
            <p>
              Deadlines, constraints, and commitments change outcomes. Talent
              Signal separates them from conversational noise without hiding
              the evidence.
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
              <p className="metadata">What matters</p>
              <p>Remote flexibility remains unresolved.</p>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="metadata">What to do</p>
              <p>Confirm policy before adding another interview.</p>
            </Reveal>
          </div>
        </section>

        <section className="live-section section shell" aria-labelledby="live-title">
          <Reveal className="section-heading">
            <h2 id="live-title">A recommendation that can show its work.</h2>
            <p>
              Change the evidence in scope. The verdict and next action respond
              with it.
            </p>
          </Reveal>
          <Reveal delay={0.08}>
            <LiveBrief />
          </Reveal>
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
                The product does not replace the relationship. It protects the
                details that make good judgment possible.
              </p>
            </Reveal>

            <div className="method-list">
              <Reveal>
                <article>
                  <h3>Capture with intent</h3>
                  <p>
                    Import one meaningful conversation and decide whether the
                    source should be retained.
                  </p>
                </article>
              </Reveal>
              <Reveal delay={0.05}>
                <article>
                  <h3>Confirm every change</h3>
                  <p>
                    Review, edit, or dismiss contact and calendar proposals
                    before they leave the workspace.
                  </p>
                </article>
              </Reveal>
              <Reveal delay={0.1}>
                <article>
                  <h3>Advance with context</h3>
                  <p>
                    See one verdict, its rationale, and the smallest action that
                    reduces uncertainty.
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
              High-trust search needs clear boundaries, not invisible
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
                  Contact and calendar actions require an explicit confirmation.
                </p>
              </article>
            </Reveal>
            <Reveal delay={0.1}>
              <article>
                <CheckCircle aria-hidden="true" size={24} />
                <h3>Deletion means deletion</h3>
                <p>
                  Source evidence and derived records are designed to leave
                  together.
                </p>
              </article>
            </Reveal>
          </div>
        </section>

        <section
          id="questions"
          className="faq-section section shell"
          aria-labelledby="faq-title"
        >
          <Reveal className="faq-section__heading">
            <h2 id="faq-title">Before you put trust in the system.</h2>
            <p>
              The boundaries are as important as the recommendation.
            </p>
          </Reveal>
          <Reveal>
            <FaqList />
          </Reveal>
        </section>

        <section className="closing-cta shell">
          <Reveal>
            <div className="closing-cta__inner">
              <h2>Keep the signal. Lose the scramble.</h2>
              <p>
                Test the review loop with sample evidence in your browser.
              </p>
              <Link className="button button--light" href="/demo">
                Open live demo
                <ArrowRight aria-hidden="true" size={17} />
              </Link>
            </div>
          </Reveal>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
