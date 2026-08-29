import {
  ArrowRight,
  CheckCircle,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { BlogPostPreview } from "@/components/blog-post-preview";
import { FaqList } from "@/components/faq-list";
import { HeroSignalPreview } from "@/components/hero-signal-preview";
import { SignalJourney } from "@/components/signal-journey";
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
    audienceType: "独立招聘顾问与精品猎头团队",
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
    state: "已观察",
    detail: "候选人说：“我需要在周三前做决定。”",
  },
  {
    state: "已提议",
    detail: "另一份录用意向已被识别；相对日期仍保持为待澄清。",
  },
  {
    state: "已关联",
    detail: "招聘顾问选择对应联系人与关系情境。",
  },
  {
    state: "已审阅",
    detail: "原话继续关联在事实旁，具体日期仍需澄清。",
  },
  {
    state: "无需行动",
    detail: "在时间尚未明确时，不安排日程，也不发送消息。",
  },
  {
    state: "再次观察",
    detail: "客户回复会作为新证据返回；系统不会预设行动成功。",
  },
] as const;

const heroProof = [
  {
    label: "来源",
    detail: "保留准确原话、说话人和时间",
  },
  {
    label: "变化",
    detail: "只提出可审阅的关系状态",
  },
  {
    label: "决定",
    detail: "事实确认与行动授权始终分开",
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
              <p className={styles.heroEyebrow}>
                证据优先的关系智能
              </p>
              <h1 id="hero-title">
                让一张截图成为持续更新的
                <span>关系。</span>
              </h1>
              <p className={styles.heroPromise}>
                输入原话，得到可审阅的关系背景。没有你的决定，任何状态都不会改变。
              </p>
              <div className={styles.heroActions}>
                <Link
                  className={`${styles.action} ${styles.actionPrimary}`}
                  href="/relationships"
                >
                  探索关系工作台
                  <ArrowRight aria-hidden="true" size={17} />
                </Link>
                <a
                  className={`${styles.action} ${styles.actionSecondary}`}
                  href="#signal-journey"
                >
                  看一条信号如何流动
                </a>
              </div>
              <ol className={styles.heroProof} aria-label="产品工作边界">
                {heroProof.map((item, index) => (
                  <li key={item.label}>
                    <span>0{index + 1}</span>
                    <div>
                      <strong>{item.label}</strong>
                      <p>{item.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div className={styles.heroVisual}>
              <HeroSignalPreview />
            </div>
          </div>
        </section>

        <SignalJourney />

        <section
          id="method"
          className={styles.historySection}
          aria-labelledby="history-title"
        >
          <div className="shell">
            <div className={styles.sectionHeading}>
              <h2 id="history-title">
                从一字不差的原话，到一个诚实的待解问题。
              </h2>
              <p>
                这个经过验证的合成案例，把相对日期、待解问题和每一次人的决定都保留在同一条可审阅历史中。
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
                证据改变，下一步也随之改变。
              </h2>
              <p>
                只有支持它的证据仍在授权范围内，下一步才继续成立。
              </p>
            </div>

            <div className={styles.retractionRail}>
              <div>
                <span>来源已移除</span>
                <strong>“Remote from Singapore is still unresolved.”</strong>
              </div>
              <ArrowRight aria-hidden="true" size={24} />
              <div>
                <span>状态已撤回</span>
                <strong>工作方式的变化不再有证据支持。</strong>
              </div>
              <ArrowRight aria-hidden="true" size={24} />
              <div>
                <span>行动已修订</span>
                <strong>失去支持证据后，当前结论变为无需行动。</strong>
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
                <span>决策边界 · 合成候选人</span>
                <span>两次人的决定</span>
              </div>
              <div className={styles.judgmentLedgerStage}>
                <div>
                  <span>关系状态</span>
                  <strong>审阅发生了什么变化</strong>
                </div>
                <dl>
                  <div>
                    <dt>决策窗口</dt>
                    <dd>需要完整日期</dd>
                  </div>
                  <div>
                    <dt>当前压力</dt>
                    <dd>另一份录用意向</dd>
                  </div>
                  <div>
                    <dt>工作方式</dt>
                    <dd>需要澄清</dd>
                  </div>
                </dl>
                <p>确认、编辑或驳回</p>
              </div>
              <div className={styles.authorityBoundary}>
                <span>确认事实不会授予执行权限</span>
              </div>
              <div className={styles.judgmentLedgerStage}>
                <div>
                  <span>外部行动</span>
                  <strong>尚无证据支持任何行动</strong>
                </div>
                <dl>
                  <div>
                    <dt>缺少</dt>
                    <dd>明确的日历日期</dd>
                  </div>
                  <div>
                    <dt>权限</dt>
                    <dd>尚未授予</dd>
                  </div>
                  <div>
                    <dt>下一步</dt>
                    <dd>由招聘顾问决定</dd>
                  </div>
                </dl>
                <p data-locked="true">当前不可批准</p>
              </div>
              <figcaption>
                同一来源可以支持一项事实，但不会因此授权一次行动。
              </figcaption>
            </figure>

            <div className={styles.judgmentCopy}>
              <h2 id="judgment-title">两次决定，绝不是一次授权。</h2>
              <p>
                确认发生了什么变化，并不等于授权发送消息、创建日历事件或修改记录。即使某项外部效果有充分依据，它仍需单独批准。
              </p>

              <div className={styles.decisionPair}>
                <article>
                  <CheckCircle aria-hidden="true" size={25} />
                  <div>
                    <h3>确认关系状态</h3>
                    <p>
                      在原始来源始终关联可见的情况下，接受或编辑一项拟议事实。
                    </p>
                  </div>
                </article>
                <article>
                  <CheckCircle aria-hidden="true" size={25} />
                  <div>
                    <h3>批准外部行动</h3>
                    <p>
                      在任何内容离开工作台前，审阅最终对象、时间与具体效果。
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
                面向关系驱动型寻访的研究。
              </h2>
              <p>
                围绕候选人进展、证据完整性与人的决策权限展开的实践研究。
              </p>
              <Link className={styles.textLink} href="/blog">
                浏览全部研究
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
                <span>关系权限</span>
                <h2 id="questions-title">
                  系统记住背景，招聘顾问保留权限。
                </h2>
                <p>
                  Talent Signal 还原发生了什么变化；由你决定什么是真的、什么值得关注，以及接下来发生什么。
                </p>
              </div>

              <div
                className={styles.trustBoundary}
                role="group"
                aria-label="Talent Signal 关系权限边界"
              >
                <div className={styles.systemScope}>
                  <article>
                    <span>记住</span>
                    <h3>带来源的证据</h3>
                    <p>原话 · 说话人 · 时间 · 寻访项目</p>
                  </article>
                  <article>
                    <span>提议</span>
                    <h3>可审阅的变化</h3>
                    <p>依赖项 · 最小下一步 · 无需行动</p>
                  </article>
                </div>
                <div className={styles.decisionBoundary}>
                  <span>决策边界</span>
                  <strong>确认事实不会授予执行权限</strong>
                </div>
                <article className={styles.humanScope}>
                  <span>决定</span>
                  <h3>招聘顾问保留权限</h3>
                  <p>事实确认 · 工作注意力 · 明确的外部效果</p>
                </article>
              </div>
            </div>

            <div className={styles.trustQuestions}>
              <span>常见问题</span>
              <FaqList />
            </div>
          </div>
        </section>

        <section className={styles.closing} aria-labelledby="closing-title">
          <div className={`shell ${styles.closingInner}`}>
            <div className={styles.closingCopy}>
              <h2 id="closing-title">每个结论都需要来源。</h2>
              <p>
                看清这个页面证明了什么、没有声称什么，以及你接下来可以核验什么。
              </p>
            </div>

            <div className={styles.closingStatus}>
              <span>当前状态</span>
              <strong>可运行原型</strong>
              <p>使用合成证据，不声称已取得客户结果。</p>
            </div>

            <div className={styles.proofRegister}>
              <article>
                <span>已演示</span>
                <h3>
                  移除证据会撤回依赖它的状态与行动。
                </h3>
                <p>可在上方查验</p>
              </article>
              <article>
                <span>已演示</span>
                <h3>
                  确认事实不会授予外部行动权限。
                </h3>
                <p>可在上方查验</p>
              </article>
              <article data-claim="withheld">
                <span>未作声称</span>
                <h3>
                  客户结果、生产环境采用情况或自主执行能力。
                </h3>
                <p>不作断言</p>
              </article>
              <article>
                <span>下一步核验</span>
                <h3>探索关系判断如何在移动端重新浮现。</h3>
                <Link href="/relationships">
                  打开关系视图
                  <ArrowRight aria-hidden="true" size={15} />
                </Link>
              </article>
            </div>

            <div className={styles.closingActions}>
              <Link
                className={`${styles.action} ${styles.actionPrimary}`}
                href="/relationships"
              >
                探索关系工作台
                <ArrowRight aria-hidden="true" size={17} />
              </Link>
              <a
                className={`${styles.action} ${styles.actionSecondary}`}
                href={accessRequestHref}
              >
                申请使用
              </a>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
