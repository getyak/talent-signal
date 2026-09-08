import { ArrowRight, Check } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import {
  marketingAccessHref,
  marketingCopy,
  relationshipDemoHref,
} from "@/lib/marketing-copy";
import type { MarketingLocale } from "@/lib/marketing-locale";
import styles from "./marketing.module.css";

export type MarketingPageKind =
  "product" | "how-it-works" | "trust" | "pricing";
export const subpageCopy = {
  "zh-CN": {
    product: {
      title: "以人为中心，关系才接得起来。",
      description:
        "一个联系人，不止一张名片。把对话、共同目标与下一步放在一起，让每次交谈都带着背景。",
      rows: [
        [
          "联系人，是起点。",
          "同一个人，可以是候选人、客户，也可以是引荐人。",
          "身份保持连贯，背景按具体关系与目标区分。你不用为每次新的合作重新认识一个人。",
        ],
        [
          "对话，让背景生长。",
          "留住发生过什么，也保留还有什么不确定。",
          "你选择的文字与截图成为可审阅来源。Agent 帮你整理变化；你可以查看原话、纠正理解或暂不确认。",
        ],
        [
          "日程，接回这段关系。",
          "见面之前带上背景，见面之后继续积累。",
          "准备对话与记录后续回到同一位联系人。创建或修改外部日程，仍需你审阅具体对象、时间与效果。",
        ],
      ],
    },
    "how-it-works": {
      title: "少重建一次背景，多认真交谈一次。",
      description:
        "从你主动提供的一段对话开始。一个案例，走完留住背景、审阅变化和准备下一步的过程。",
      rows: [
        [
          "选择一段对话",
          "只带入当前关系需要的内容。",
          "在合成案例中，林澄说新加坡远程安排还没有确认。演示将这句话关联到产品负责人寻访情境。实际使用中，身份不确定时需要先核实。",
        ],
        [
          "审阅发生的变化",
          "区分对方说了什么，与已经确认了什么。",
          "“周三”缺少年份、完整日期与时区，不能直接变成日程。确认候选人的表述，也不能替客户确认远程政策。",
        ],
        [
          "决定下一步",
          "先提出一件有依据、可以审阅的事。",
          "此刻的建议是核实远程政策和具体日期。没有新的授权，不会自动发消息；移除支持原话后，这条建议立即失效。",
        ],
      ],
    },
    trust: {
      title: "有出处的背景，有边界的智能。",
      description: "把原话、解释和决定分开，让每一步都能检查、纠正或停止。",
      rows: [
        [
          "你选择来源",
          "只处理你为当前目的主动提供的内容。",
          "公开演示仅包含合成资料，不读取你的通讯录、聊天或日历。实际接入的来源与权限应在使用前明确。",
        ],
        [
          "原话可以检查",
          "来源、说话人和时间与重要结论保持关联。",
          "身份不明、相对时间或矛盾不会被悄悄补全。Agent 的解释以建议呈现，不给个人价值、性格或录用概率评分。",
        ],
        [
          "行动单独授权",
          "确认事实，不等于发送消息或安排日程。",
          "外部效果需要单独审阅最终对象、内容和时间。本页的确认按钮仅改变当前演示状态，不保存真实记录。",
        ],
        [
          "移除意味着失效",
          "当前结论不能继续使用已移除的支持证据。",
          "依赖来源的建议失效，历史决定仍保留其当时的确认与当前来源状态。演示的“重新开始”创建新一轮演示，不代表恢复任何已删除的真实资料。",
        ],
      ],
    },
    pricing: {
      title: "先体验，再决定是否一起使用。",
      description:
        "公开演示现在就能打开。真实工作空间处于早期申请阶段，付费方案尚未公布。",
      rows: [],
    },
  },
  en: {
    product: {
      title: "Start with a person. Continue a relationship.",
      description:
        "A contact is more than a business card. Bring conversations, shared goals, and next steps together so every meeting starts with context.",
      rows: [
        [
          "A person is the starting point.",
          "One person can be a candidate, a client, or an introducer.",
          "Keep identity continuous while separating context by relationship and goal. You do not have to start from zero for each new collaboration.",
        ],
        [
          "Conversations grow the context.",
          "Remember what happened and what is still uncertain.",
          "The text and screenshots you choose become reviewable sources. The Agent helps organize changes; you can inspect the words, correct an interpretation, or leave it unconfirmed.",
        ],
        [
          "Meetings return to the relationship.",
          "Arrive with context. Keep learning after the conversation.",
          "Preparation and follow-up belong with the same person. Creating or changing an external calendar event still needs your review of the people, time, and effect.",
        ],
      ],
    },
    "how-it-works": {
      title: "Less reconstructing. More real conversation.",
      description:
        "Start with a conversation you choose to provide. Follow one case from remembered context to a reviewed change and a possible next step.",
      rows: [
        [
          "Choose a conversation",
          "Bring only what this relationship needs.",
          "In the synthetic case, Lin Cheng says the Singapore remote arrangement is unresolved. The demo links those words to a product leadership search. In real use, uncertain identity must be resolved first.",
        ],
        [
          "Review what changed",
          "Separate what someone said from what is confirmed.",
          "“Wednesday” lacks a year, complete date, and time zone. It cannot become a calendar event. Confirming the candidate's statement also cannot confirm the client's remote policy.",
        ],
        [
          "Decide the next step",
          "Prepare one supported, reviewable suggestion.",
          "Here, the suggestion is to clarify the remote policy and the exact date. No message is sent without separate authorization. Remove the supporting words and the suggestion loses its support.",
        ],
      ],
    },
    trust: {
      title: "Context with sources. Intelligence with boundaries.",
      description:
        "Keep original words, interpretations, and decisions separate, so each step can be inspected, corrected, or stopped.",
      rows: [
        [
          "You choose the source",
          "Process only the content you provide for the current purpose.",
          "This public demo contains synthetic material only. It does not read your contacts, chats, or calendar. Real source access and permissions should be explicit before use.",
        ],
        [
          "The words stay inspectable",
          "Keep source, speaker, and time attached to important conclusions.",
          "Unknown identities, relative dates, and contradictions are not silently resolved. Agent interpretations remain suggestions, with no scoring of personal worth, personality, or acceptance probability.",
        ],
        [
          "Actions need separate approval",
          "Confirming a fact does not send a message or schedule a meeting.",
          "External effects require review of the final recipient, content, and time. This demo's confirmation button only changes the current page state, never real records.",
        ],
        [
          "Removal invalidates support",
          "Current conclusions cannot keep using a removed source.",
          "Dependent suggestions become unsupported. Earlier decisions keep their confirmation history and current source status. “Start a new demo” starts a fresh simulation; it does not recover deleted real data.",
        ],
      ],
    },
    pricing: {
      title: "Explore first. Decide together when it fits.",
      description:
        "The public demo is ready to explore. Real workspaces are available by early-access request. Paid plans have not been announced.",
      rows: [],
    },
  },
};

export function MarketingSubpage({
  kind,
  locale,
}: {
  kind: MarketingPageKind;
  locale: MarketingLocale;
}) {
  const c = marketingCopy(locale);
  const copy = subpageCopy[locale][kind];
  const en = locale === "en";
  return (
    <main id="main-content" tabIndex={-1} className={styles.page} lang={locale}>
      <section className={styles.subHero}>
        <p className={styles.eyebrow}>
          {c.nav[["product", "how-it-works", "trust", "pricing"].indexOf(kind)]}
        </p>
        <h1>{copy.title}</h1>
        <p>{copy.description}</p>
      </section>
      {kind === "pricing" ? (
        <>
          <div className={styles.pricingGrid}>
            <article className={styles.pricePlan}>
              <h2>{en ? "Public demo" : "公开演示"}</h2>
              <p className={styles.price}>
                {en ? "Free to explore" : "免费体验"}
              </p>
              <p>
                {en
                  ? "Understand the workflow before bringing your own data."
                  : "先理解工作方式，再决定是否带入自己的资料。"}
              </p>
              <ul>
                {(en
                  ? [
                      "Synthetic relationship brief",
                      "Inspect, review, and remove evidence",
                      "No login or card required",
                    ]
                  : [
                      "合成关系简报",
                      "查看、审阅和移除证据",
                      "无需登录或绑定支付方式",
                    ]
                ).map((item) => (
                  <li key={item}>
                    <Check size={16} aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link className={styles.primary} href={relationshipDemoHref}>
                {c.demo}
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </article>
            <article className={styles.pricePlan}>
              <h2>{en ? "Early workspace access" : "早期工作空间"}</h2>
              <p className={styles.price}>{en ? "By request" : "申请开放"}</p>
              <p>
                {en
                  ? "For independent recruiters and boutique search teams."
                  : "面向独立猎头与精品寻访团队。"}
              </p>
              <ul>
                {(en
                  ? [
                      "Discuss your relationship workflow",
                      "Confirm available features and data scope",
                      "Paid plans and billing are not yet available",
                    ]
                  : [
                      "交流你的联系人工作方式",
                      "使用前确认可用功能与资料范围",
                      "付费方案与在线订阅尚未开放",
                    ]
                ).map((item) => (
                  <li key={item}>
                    <Check size={16} aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
              <a className={styles.primary} href={marketingAccessHref(locale)}>
                {c.access}
                <ArrowRight size={18} aria-hidden="true" />
              </a>
              <p className={styles.notice}>{c.email}</p>
            </article>
          </div>
          <p className={styles.callout}>
            {en
              ? "An access request opens your email app. It does not start a trial, create a subscription, or authorize a payment. Availability and any future price will be confirmed before you commit."
              : "申请入口会打开你的邮件应用，不会启动试用期、创建订阅或授权付款。实际开放范围及未来收费会在使用前明确。"}
          </p>
        </>
      ) : (
        <div className={styles.featureRows}>
          {copy.rows.map(([title, lead, text]) => (
            <section className={styles.featureRow} key={title}>
              <h2>{title}</h2>
              <div>
                <strong>{lead}</strong>
                <p>{text}</p>
              </div>
            </section>
          ))}
        </div>
      )}
      {kind === "product" && (
        <section className={styles.callout}>
          <h2>
            {en
              ? "Connections can reveal a possibility."
              : "关系之间，也可能出现新的可能。"}
          </h2>
          <div className={styles.path}>
            <div>
              {en ? "You" : "你"}
              <small>
                {en ? "Product leadership search" : "产品负责人寻访"}
              </small>
            </div>
            <span aria-hidden="true">→</span>
            <div>
              {en ? "Lin Cheng" : "林澄"}
              <small>
                {en ? "Remote policy unresolved" : "远程政策待明确"}
              </small>
            </div>
            <span aria-hidden="true">→</span>
            <div>
              {en ? "Client stakeholder" : "客户负责人"}
              <small>
                {en ? "Possible clarification path" : "可能的政策核实路径"}
              </small>
            </div>
          </div>
          <p>
            {en
              ? "An illustrative, synthetic path. Surfacing possible introductions from authorized context is an exploration, not a claim of verified acquaintance or autonomous action."
              : "这是一条合成的情境路径。基于授权背景发现可能的引荐是探索方向，不代表已核实相识，更不代表自动采取行动。"}
          </p>
        </section>
      )}
      {kind === "trust" && (
        <p className={styles.callout}>
          <Link className={styles.inlineLink} href="/privacy">
            {c.privacy}
            {en ? ` · ${c.original}` : ""}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </p>
      )}
      {kind !== "pricing" && (
        <section className={styles.closing}>
          <h2>
            {en
              ? "See what changes when the source changes."
              : "亲手看看，来源改变时会发生什么。"}
          </h2>
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
        </section>
      )}
    </main>
  );
}
