export const siteConfig = {
  name: "Talent Signal",
  title: "Talent Signal｜以联系人为中心的关系 CRM",
  description:
    "保留联系人的背景，发现对话里的变化，准备恰当的下一步。面向客户、伙伴、协作者与候选人的关系工作区。",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://gettalentsignal.com",
  email: "hello@talentsignal.ai",
} as const;

export const accessRequestHref =
  `mailto:${siteConfig.email}?subject=${encodeURIComponent("申请使用 Talent Signal")}`;

export const faqs = [
  {
    question: "Talent Signal 用来做什么？",
    answer:
      "它把人物、对话、承诺与日程放回持续的关系背景中，帮助你推进客户合作、伙伴关系、共同项目与招聘。",
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
      "适合需要长期维护关系、跟进承诺与推进合作的人，包括独立顾问、客户负责人、创业者、合作伙伴和招聘顾问。",
  },
  {
    question: "Talent Signal 会给人评分或排名吗？",
    answer:
      "不会。系统只会围绕当前依赖项排列你的工作注意力，不会把一个人简化为匹配度、质量、性格、潜力或接受概率分数。",
  },
] as const;
