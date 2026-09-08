import type { Metadata } from "next";
import { RelationshipExperienceSwitcher } from "@/components/relationship-experience-switcher";
import { DemoEntry } from "@/components/marketing/demo-entry";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { marketingCopy } from "@/lib/marketing-copy";
import { getMarketingLocale } from "@/lib/server/marketing-locale";
import styles from "@/components/marketing/marketing.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getMarketingLocale();
  const c = marketingCopy(locale);
  return {
    title: c.demo,
    description: c.prototype,
    alternates: { canonical: "/relationships" },
    openGraph: {
      title: c.demo,
      description: c.prototype,
      url: "/relationships",
      locale: locale === "en" ? "en_US" : "zh_CN",
    },
  };
}
export default async function RelationshipsPage() {
  const locale = await getMarketingLocale();
  const c = marketingCopy(locale);
  const en = locale === "en";
  return (
    <>
      <SiteHeader />
      <main
        className={styles.page}
        id="main-content"
        tabIndex={-1}
        lang={locale}
      >
        <section className={styles.subHero}>
          <p className={styles.eyebrow}>{c.prototype}</p>
          <h1>{c.demo}</h1>
          <p>
            {en
              ? "One person. One unresolved question. Inspect the words, review the change, then remove the source."
              : "一个人，一个待解问题。查看原话、审阅变化，再试试移除来源。"}
          </p>
        </section>
        <section className={styles.demoPage} aria-labelledby="experience-title">
          <div className={styles.demoIntro}>
            <h2 id="experience-title">
              {en ? "What would you do next?" : "这一次，你会怎么接着聊？"}
            </h2>
            <p>
              {en
                ? "Lin Cheng needs to make a decision, but the remote arrangement is unresolved. The exact date is still unclear."
                : "林澄需要作出决定，但远程安排还没落定，具体日期也仍需澄清。"}
            </p>
            <p>
              {en
                ? "Review confirms the candidate's statement only. Try removing the evidence: the next step loses its support immediately."
                : "审阅只确认候选人的表述。移除支持原话后，下一步会立即失去依据。"}
            </p>
            <p>{c.brief.local}</p>
          </div>
          <DemoEntry />
        </section>
        <details className={styles.legacy}>
          <summary>
            {en
              ? "Explore earlier desktop & iPhone concepts · Chinese"
              : "继续探索桌面端与 iPhone 概念视图"}
          </summary>
          <div lang="zh-CN">
            <RelationshipExperienceSwitcher />
          </div>
        </details>
      </main>
      <SiteFooter />
    </>
  );
}
