import {
  ArrowRight,
  ChatsCircle,
  UserCircle,
  CalendarBlank,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import {
  marketingAccessHref,
  marketingCopy,
  relationshipDemoHref,
} from "@/lib/marketing-copy";
import type { MarketingLocale } from "@/lib/marketing-locale";
import { RelationshipBrief } from "./relationship-brief";
import styles from "./marketing.module.css";

export function MarketingHome({ locale }: { locale: MarketingLocale }) {
  const c = marketingCopy(locale);
  const icons = [UserCircle, ChatsCircle, CalendarBlank];
  return (
    <main id="main-content" tabIndex={-1} className={styles.page} lang={locale}>
      <section
        id="product"
        className={styles.hero}
        aria-labelledby="hero-title"
      >
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>{c.audience}</p>
          <h1 id="hero-title">
            {c.headline[0]}
            <span>{c.headline[1]}</span>
          </h1>
          <p className={styles.promise}>{c.promise}</p>
          <div className={styles.actions}>
            <Link className={styles.primary} href={relationshipDemoHref}>
              {c.demo}
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <a className={styles.secondary} href={marketingAccessHref(locale)}>
              {c.access}
              <span>{c.email}</span>
            </a>
          </div>
        </div>
        <div className={styles.heroBrief}>
          <RelationshipBrief />
          <p className={styles.demoCaption}>{c.prototype}</p>
        </div>
      </section>
      <section
        id="method"
        className={styles.process}
        aria-labelledby="method-title"
      >
        <div className={styles.sectionIntro}>
          <h2 id="method-title">{c.methodTitle}</h2>
          <p>{c.methodIntro}</p>
        </div>
        <ol className={styles.processSteps}>
          {c.steps.map((step, i) => {
            const Icon = icons[i];
            return (
              <li key={step.title}>
                <div className={styles.stepVisual}>
                  <Icon size={28} aria-hidden="true" weight="light" />
                  <strong>{step.example}</strong>
                  <span>{step.caption}</span>
                </div>
                <h3>{step.title}</h3>
                <p>{step.detail}</p>
              </li>
            );
          })}
        </ol>
        <Link className={styles.inlineLink} href="/how-it-works">
          {c.methodLink}
          <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </section>
      <section
        id="principles"
        className={styles.trust}
        aria-labelledby="trust-title"
      >
        <div>
          <h2 id="trust-title">{c.trustTitle}</h2>
          <p>{c.trustIntro}</p>
          <Link className={styles.inlineLink} href="/trust">
            {c.trustLink}
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
        <div id="questions" className={styles.faq}>
          {c.faqs.map((item, i) => (
            <details key={item.question} open={i === 0}>
              <summary>
                {item.question}
                <span aria-hidden="true">+</span>
              </summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>
      <section
        id="access"
        className={styles.closing}
        aria-labelledby="access-title"
      >
        <h2 id="access-title">{c.closingTitle}</h2>
        <p>{c.closingDetail}</p>
        <div className={styles.actions}>
          <Link className={styles.primary} href={relationshipDemoHref}>
            {c.demo}
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <a className={styles.secondary} href={marketingAccessHref(locale)}>
            {c.access}
            <span>{c.email}</span>
          </a>
        </div>
        <Link className={styles.inlineLink} href="/pricing">
          {c.pricingLink}
          <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </section>
    </main>
  );
}
