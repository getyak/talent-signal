import type { Metadata } from "next";
import { ArrowRight, ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { RelationshipDesktopConcept } from "@/components/relationship-desktop-concept";
import { RelationshipMobileConcept } from "@/components/relationship-mobile-concept";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { accessRequestHref } from "@/lib/site";
import styles from "./relationships-page.module.css";

export const metadata: Metadata = {
  title: "Relationship intelligence",
  description:
    "Explore an evidence-first relationship workspace that returns recruiters to the exact change, uncertainty, or quiet state that deserves judgment.",
  alternates: { canonical: "/relationships" },
};

const principles = [
  {
    label: "Return, not dashboard",
    detail: "Resume one unfinished relationship decision with its context intact.",
  },
  {
    label: "Evidence, not profile",
    detail: "Every proposed change keeps the exact source and uncertainty attached.",
  },
  {
    label: "Agent, not authority",
    detail: "Find, explain, and stage. A human still confirms every consequential change.",
  },
] as const;

export default function RelationshipsPage() {
  return (
    <>
      <SiteHeader />
      <main className={styles.page} id="main-content">
        <section className={styles.hero} aria-labelledby="relationships-title">
          <div className="shell">
            <p className={styles.eyebrow}>The relationship product</p>
            <div className={styles.heroGrid}>
              <h1 id="relationships-title">
                Contacts are not inventory. They are decisions in motion.
              </h1>
              <div className={styles.heroAside}>
                <p>
                  Talent Signal helps an independent recruiter remember what
                  changed, understand why it matters now, and choose the
                  smallest safe next move.
                </p>
                <div className={styles.heroActions}>
                  <a href="#relationship-experience">
                    Explore the product
                    <ArrowRight aria-hidden="true" size={17} />
                  </a>
                  <Link href="/demo">Review one conversation</Link>
                </div>
              </div>
            </div>

            <ol className={styles.principles}>
              {principles.map((principle, index) => (
                <li key={principle.label}>
                  <span>0{index + 1}</span>
                  <div>
                    <strong>{principle.label}</strong>
                    <p>{principle.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          className={styles.experience}
          id="relationship-experience"
          aria-labelledby="experience-title"
        >
          <div className={`shell ${styles.experienceHeading}`}>
            <div>
              <p className={styles.eyebrow}>Interactive product view</p>
              <h2 id="experience-title">Return to what deserves judgment.</h2>
            </div>
            <p>
              This walkthrough uses synthetic people and evidence. It sends no
              message, changes no calendar, and assigns no score to a person.
            </p>
          </div>
          <div className={styles.desktopProduct}>
            <RelationshipDesktopConcept />
          </div>
          <div className={styles.mobileProduct}>
            <RelationshipMobileConcept presentation="product" />
          </div>
        </section>

        <section className={styles.agentBoundary} aria-labelledby="agent-title">
          <div className={`shell ${styles.agentGrid}`}>
            <div>
              <p className={styles.eyebrow}>A quieter Agent</p>
              <h2 id="agent-title">Present when useful. Absent when not.</h2>
              <p>
                The Agent sits at the threshold of the archive. It can locate a
                relationship, explain a change from source evidence, or stage a
                memory. It cannot turn a suggestion into action on its own.
              </p>
            </div>

            <div className={styles.agentJobs}>
              <div>
                <span>Find</span>
                <p>Retrieve relationships from supported evidence, never a person score.</p>
              </div>
              <div>
                <span>Explain</span>
                <p>Show what changed and why it returned to attention.</p>
              </div>
              <div>
                <span>Remember</span>
                <p>Preserve the recruiter&apos;s words before proposing structure.</p>
              </div>
              <p className={styles.boundaryNote}>
                <ShieldCheck aria-hidden="true" size={18} weight="fill" />
                Draft authority only. External effects require a separate human
                decision.
              </p>
            </div>
          </div>
          <div className={`shell ${styles.closingActions}`}>
            <a href={accessRequestHref}>
              Request access
              <ArrowRight aria-hidden="true" size={17} />
            </a>
            <Link href="/blog/about">Read the evidence method</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
