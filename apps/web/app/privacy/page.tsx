import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Privacy principles",
  description:
    "How Talent Signal approaches intentional evidence import, user confirmation, source traceability, and deletion.",
  alternates: {
    canonical: "/privacy",
  },
};

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="prose-page">
        <article className="shell prose-page__inner">
          <header>
            <p className="eyebrow">Privacy principles</p>
            <h1>Candidate context deserves deliberate handling.</h1>
            <p>
              Talent Signal is designed around intentional import, explicit
              confirmation, and evidence that remains inspectable.
            </p>
          </header>

          <section>
            <h2>Intentional input</h2>
            <p>
              The product starts with a recruiter choosing a conversation
              screenshot or note. It is not designed as a silent monitoring
              layer across private communication tools.
            </p>
          </section>

          <section>
            <h2>Source-linked facts</h2>
            <p>
              Extracted facts and proposed actions keep a reference to their
              source. Verified statements remain separate from inferences and
              recommendations.
            </p>
          </section>

          <section>
            <h2>Workspace sign-in</h2>
            <p>
              The initialized web workspace uses encrypted session cookies.
              Google and Apple sign-in sends the authentication request to the
              selected identity provider under that provider&apos;s privacy
              terms. Configured email sign-in verifies a server-side password
              hash and does not store the plaintext password in the
              application.
            </p>
          </section>

          <section>
            <h2>Confirmation before change</h2>
            <p>
              Contact and calendar mutations require a clear review step. A
              recruiter can confirm, edit, or dismiss each proposal.
            </p>
          </section>

          <section>
            <h2>Deletion across derivatives</h2>
            <p>
              The product architecture treats source evidence and derived data
              as one deletion scope. The goal is to avoid leaving detached
              summaries after the original evidence is removed.
            </p>
          </section>

          <aside>
            <h2>About the live demo</h2>
            <p>
              Local mode uses deterministic browser-side rules and does not
              transmit the conversation text. When the optional private AI
              route is configured, it runs only after the user selects it. The
              note is sent to the configured model provider with zero-retention
              and no-data-collection routing requested; Talent Signal does not
              persist the note or include it in application logs.
            </p>
            <Link className="text-link" href="/demo">
              Open live demo
            </Link>
          </aside>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
