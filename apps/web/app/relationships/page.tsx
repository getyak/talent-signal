import type { Metadata } from "next";
import { ArrowRight, ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { RelationshipExperienceSwitcher } from "@/components/relationship-experience-switcher";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { accessRequestHref } from "@/lib/site";
import styles from "./relationships-page.module.css";

export const metadata: Metadata = {
  title: "关系智能",
  description:
    "探索证据优先的关系工作台，让招聘顾问回到真正需要判断的变化、不确定性或安静状态。",
  alternates: { canonical: "/relationships" },
};

const principles = [
  {
    label: "回到关系，而非仪表盘",
    detail: "带着完整背景，继续一项尚未完成的关系决定。",
  },
  {
    label: "证据，而非画像",
    detail: "每项拟议变化都始终关联准确来源与不确定性。",
  },
  {
    label: "智能助理，而非权威",
    detail: "它可以查找、解释和暂存；每项重要变化仍由人确认。",
  },
] as const;

export default function RelationshipsPage() {
  return (
    <>
      <SiteHeader />
      <main className={styles.page} id="main-content" tabIndex={-1}>
        <section className={styles.hero} aria-labelledby="relationships-title">
          <div className="shell">
            <p className={styles.eyebrow}>关系产品</p>
            <div className={styles.heroGrid}>
              <h1 id="relationships-title">
                联系人不是库存，而是持续变化中的决定。
              </h1>
              <div className={styles.heroAside}>
                <p>
                  Talent Signal 帮助独立招聘顾问记住发生了什么变化、理解它为何此刻重要，并选择最小且稳妥的下一步。
                </p>
                <div className={styles.heroActions}>
                  <a href="#relationship-experience">
                    探索产品
                    <ArrowRight aria-hidden="true" size={17} />
                  </a>
                  <Link href="/demo">审阅一段对话</Link>
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
              <p className={styles.eyebrow}>交互式产品视图</p>
              <h2 id="experience-title">回到真正需要判断的地方。</h2>
            </div>
            <p>
              本演示仅使用合成人物与证据；不会发送消息、修改日历，也不会给任何人评分。
            </p>
          </div>
          <RelationshipExperienceSwitcher />
        </section>

        <section className={styles.agentBoundary} aria-labelledby="agent-title">
          <div className={`shell ${styles.agentGrid}`}>
            <div>
              <p className={styles.eyebrow}>更安静的智能助理</p>
              <h2 id="agent-title">有用时出现，无需时退场。</h2>
              <p>
                智能助理守在关系档案的入口。它可以定位一段关系、依据来源解释变化，或暂存一条记忆；但不能自行把建议变成行动。
              </p>
            </div>

            <div className={styles.agentJobs}>
              <div>
                <span>查找</span>
                <p>从有依据的证据中找回关系，绝不依赖人物评分。</p>
              </div>
              <div>
                <span>解释</span>
                <p>说明发生了什么变化，以及它为何重新值得关注。</p>
              </div>
              <div>
                <span>记住</span>
                <p>先保留招聘顾问的原话，再提出结构化建议。</p>
              </div>
              <p className={styles.boundaryNote}>
                <ShieldCheck aria-hidden="true" size={18} weight="fill" />
                仅有草稿权限。任何外部效果都需要一次独立的人工决定。
              </p>
            </div>
          </div>
          <div className={`shell ${styles.closingActions}`}>
            <a href={accessRequestHref}>
              申请使用
              <ArrowRight aria-hidden="true" size={17} />
            </a>
            <Link href="/blog/about">阅读证据方法</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
