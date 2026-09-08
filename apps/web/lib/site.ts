export const siteConfig = {
  name: "Talent Signal",
  title: "Talent Signal｜以联系人为中心的关系 CRM",
  description:
    "保留联系人的背景，发现对话里的变化，准备恰当的下一步。面向独立猎头与精品寻访团队的关系 CRM。",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://gettalentsignal.com",
  email: "hello@talentsignal.ai",
} as const;

export const accessRequestHref =
  `mailto:${siteConfig.email}?subject=${encodeURIComponent("申请使用 Talent Signal")}`;

export const faqs = [
  {
    question: "Talent Signal 是 ATS 吗？",
    answer:
      "不是。它专注于候选人关系进展，保留传统系统常被压缩成备注的对话、承诺与时间变化。",
  },
  {
    question: "它会自动发消息或修改记录吗？",
    answer:
      "不会。每一项联系人或日历变更都先以提案呈现；只有你确认、编辑或驳回后，系统才可能进入下一步。",
  },
  {
    question: "导入的证据会如何处理？",
    answer:
      "产品只处理你主动导入的内容，让事实始终关联来源，并把原始证据及其衍生数据纳入同一删除范围。",
  },
  {
    question: "这款产品适合谁？",
    answer:
      "适合负责高价值、关系驱动型寻访的独立招聘顾问和精品猎头团队——在这类工作中，时机与信任往往决定结果。",
  },
  {
    question: "Talent Signal 会给候选人评分或排名吗？",
    answer:
      "不会。系统只会围绕当前依赖项排列招聘顾问的工作注意力，不会把一个人简化为匹配度、质量、性格、潜力或接受概率分数。",
  },
] as const;
