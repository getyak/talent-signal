import {
  ArrowRight,
  CheckCircle,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { BlogPostPreview } from "@/components/blog-post-preview";
import { FaqList } from "@/components/faq-list";
import { RedlineWorkbench } from "@/components/redline-workbench";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { StructuredData } from "@/components/structured-data";
import { blogPosts } from "@/lib/blog";
import { accessRequestHref, faqs, siteConfig } from "@/lib/site";
import styles from "./redline-home.module.css";

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

const relationshipHistory = [
  {
    state: "Observed",
    detail: "Leila says another offer requires a decision by Wednesday.",
  },
  {
    state: "Proposed",
    detail: "The record drafts a Wednesday window and competing-offer pressure.",
  },
  {
    state: "Corrected",
    detail: "Remote flexibility stays unresolved, not a confirmed preference.",
  },
  {
    state: "Confirmed",
    detail: "The recruiter accepts only the facts supported by the source.",
  },
  {
    state: "Approved",
    detail: "A separate review authorizes one policy-clarification request.",
  },
  {
    state: "Observed again",
    detail: "A client reply would return as evidence. Success is not assumed.",
  },
] as const;

export default function HomePage() {
  return (
    <>
      <StructuredData value={organizationSchema} />
      <StructuredData value={softwareSchema} />
      <StructuredData value={faqSchema} />
      <SiteHeader />

      <main id="main-content" className={styles.page}>
        <section
          id="product"
          className={styles.hero}
          aria-labelledby="hero-title"
        >
          <div className={`shell ${styles.heroIntro}`}>
            <div className={styles.heroThesis}>
              <p>Relationship intelligence for executive search</p>
              <h1 id="hero-title">
                Know what <span>changed.</span> Move the relationship.
              </h1>
            </div>
            <div className={styles.heroAside}>
              <p>
                Turn one candidate conversation into verified context and the
                smallest safe next move.
              </p>
              <div className={styles.heroActions}>
                <Link
                  className={`${styles.action} ${styles.actionPrimary}`}
                  href="/relationships"
                >
                  Explore relationships
                  <ArrowRight aria-hidden="true" size={17} />
                </Link>
                <a
                  className={`${styles.action} ${styles.actionSecondary}`}
                  href={accessRequestHref}
                >
                  Request access
                </a>
              </div>
            </div>
          </div>

          <div className={`shell ${styles.workbenchWrap}`}>
            <RedlineWorkbench />
          </div>
        </section>

        <section
          id="method"
          className={styles.historySection}
          aria-labelledby="history-title"
        >
          <div className="shell">
            <div className={styles.sectionHeading}>
              <h2 id="history-title">
                From exact words to the next right move.
              </h2>
              <p>
                This synthetic case keeps the deadline, open question, and
                every human decision in one reviewable history.
              </p>
            </div>

            <ol className={styles.historyGrid}>
              {relationshipHistory.map((item) => (
                <li key={item.state}>
                  <strong>{item.state}</strong>
                  <p>{item.detail}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          className={styles.counterfactual}
          aria-labelledby="counterfactual-title"
        >
          <div className={`shell ${styles.counterfactualInner}`}>
            <div>
              <h2 id="counterfactual-title">
                Change the evidence. Change the move.
              </h2>
              <p>
                A next step survives only while its supporting evidence remains
                in scope.
              </p>
            </div>

            <div className={styles.retractionRail}>
              <div>
                <span>Source removed</span>
                <strong>“Remote flexibility is important.”</strong>
              </div>
              <ArrowRight aria-hidden="true" size={24} />
              <div>
                <span>State retracted</span>
                <strong>Work-mode change becomes unsupported.</strong>
              </div>
              <ArrowRight aria-hidden="true" size={24} />
              <div>
                <span>Action revised</span>
                <strong>Ask what must be true before the deadline.</strong>
              </div>
            </div>
          </div>
        </section>

        <section
          id="principles"
          className={styles.judgmentSection}
          aria-labelledby="judgment-title"
        >
          <div className={`shell ${styles.judgmentGrid}`}>
            <figure className={styles.judgmentLedger}>
              <div className={styles.judgmentLedgerHeader}>
                <span>Decision boundary · Leila Hartmann</span>
                <span>Two human decisions</span>
              </div>
              <div className={styles.judgmentLedgerStage}>
                <div>
                  <span>Relationship state</span>
                  <strong>Review what changed</strong>
                </div>
                <dl>
                  <div>
                    <dt>Decision window</dt>
                    <dd>Wednesday</dd>
                  </div>
                  <div>
                    <dt>Current pressure</dt>
                    <dd>Competing offer</dd>
                  </div>
                  <div>
                    <dt>Work mode</dt>
                    <dd>Needs clarification</dd>
                  </div>
                </dl>
                <p>Confirm, edit, or dismiss</p>
              </div>
              <div className={styles.authorityBoundary}>
                <span>Confirmation grants no execution authority</span>
              </div>
              <div className={styles.judgmentLedgerStage}>
                <div>
                  <span>External action</span>
                  <strong>Approve one exact effect</strong>
                </div>
                <dl>
                  <div>
                    <dt>Target</dt>
                    <dd>Client stakeholder</dd>
                  </div>
                  <div>
                    <dt>Effect</dt>
                    <dd>Request policy clarification</dd>
                  </div>
                  <div>
                    <dt>Timing</dt>
                    <dd>Before Wednesday</dd>
                  </div>
                </dl>
                <p data-locked="true">Separate approval required</p>
              </div>
              <figcaption>
                The same source can support a fact without authorizing an
                action.
              </figcaption>
            </figure>

            <div className={styles.judgmentCopy}>
              <h2 id="judgment-title">Two decisions. Never one permission.</h2>
              <p>
                Confirming what changed does not authorize a message, calendar
                event, or record mutation.
              </p>

              <div className={styles.decisionPair}>
                <article>
                  <CheckCircle aria-hidden="true" size={25} />
                  <div>
                    <h3>Confirm the relationship state</h3>
                    <p>
                      Accept or edit one proposed fact with its exact source
                      attached.
                    </p>
                  </div>
                </article>
                <article>
                  <CheckCircle aria-hidden="true" size={25} />
                  <div>
                    <h3>Approve the external action</h3>
                    <p>
                      Review the final target, timing, and effect before
                      anything leaves the workspace.
                    </p>
                  </div>
                </article>
              </div>
            </div>
          </div>
        </section>

        <section
          className={styles.researchSection}
          aria-labelledby="research-title"
        >
          <div className={`shell ${styles.researchGrid}`}>
            <div className={styles.researchIntro}>
              <h2 id="research-title">
                Research for relationship-led search.
              </h2>
              <p>
                Practical work on candidate momentum, evidence integrity, and
                human decision authority.
              </p>
              <Link className={styles.textLink} href="/blog">
                Browse all research
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
            </div>

            <div className={styles.researchStories}>
              <BlogPostPreview post={blogPosts[0]} variant="compact" />
              <BlogPostPreview post={blogPosts[1]} variant="compact" />
            </div>
          </div>
        </section>

        <section
          id="questions"
          className={styles.questionsSection}
          aria-labelledby="questions-title"
        >
          <div className={`shell ${styles.questionsGrid}`}>
            <div className={styles.trustBoundaryGrid}>
              <div className={styles.questionsIntro}>
                <span>Relationship authority</span>
                <h2 id="questions-title">
                  The system remembers context. The recruiter keeps authority.
                </h2>
                <p>
                  Talent Signal reconstructs what changed. You decide what is
                  true, what deserves attention, and what happens next.
                </p>
              </div>

              <div
                className={styles.trustBoundary}
                role="group"
                aria-label="Talent Signal relationship authority boundary"
              >
                <div className={styles.systemScope}>
                  <article>
                    <span>Remember</span>
                    <h3>Evidence with provenance</h3>
                    <p>Exact words · speaker · time · assignment</p>
                  </article>
                  <article>
                    <span>Propose</span>
                    <h3>A reviewable change</h3>
                    <p>Dependency · smallest next step · no action</p>
                  </article>
                </div>
                <div className={styles.decisionBoundary}>
                  <span>Decision boundary</span>
                  <strong>Confirmation grants no execution authority</strong>
                </div>
                <article className={styles.humanScope}>
                  <span>Decide</span>
                  <h3>The recruiter keeps authority</h3>
                  <p>Fact confirmation · work attention · exact external effect</p>
                </article>
              </div>
            </div>

            <div className={styles.trustQuestions}>
              <span>Practical questions</span>
              <FaqList />
            </div>
          </div>
        </section>

        <section className={styles.closing} aria-labelledby="closing-title">
          <div className={`shell ${styles.closingInner}`}>
            <div className={styles.closingCopy}>
              <h2 id="closing-title">Every claim needs a source.</h2>
              <p>
                Inspect what this page demonstrates, what it does not claim,
                and what you can verify next.
              </p>
            </div>

            <div className={styles.closingStatus}>
              <span>Current status</span>
              <strong>Working prototype</strong>
              <p>Synthetic evidence. No customer outcomes asserted.</p>
            </div>

            <div className={styles.proofRegister}>
              <article>
                <span>Demonstrated</span>
                <h3>
                  Removing evidence retracts its dependent state and action.
                </h3>
                <p>Inspectable above</p>
              </article>
              <article>
                <span>Demonstrated</span>
                <h3>
                  Confirming facts grants no authority to act externally.
                </h3>
                <p>Inspectable above</p>
              </article>
              <article data-claim="withheld">
                <span>Not claimed</span>
                <h3>
                  Customer outcomes, production adoption, or autonomous
                  execution.
                </h3>
                <p>Not asserted</p>
              </article>
              <article>
                <span>Verify next</span>
                <h3>Explore how relationship judgment returns on mobile.</h3>
                <Link href="/relationships">
                  Open relationship view
                  <ArrowRight aria-hidden="true" size={15} />
                </Link>
              </article>
            </div>

            <div className={styles.closingActions}>
              <Link
                className={`${styles.action} ${styles.actionPrimary}`}
                href="/relationships"
              >
                Explore relationships
                <ArrowRight aria-hidden="true" size={17} />
              </Link>
              <a
                className={`${styles.action} ${styles.actionSecondary}`}
                href={accessRequestHref}
              >
                Request access
              </a>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
