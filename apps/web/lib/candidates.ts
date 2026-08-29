export type CandidateFact = {
  label: string;
  provenance: "Confirmed" | "Open question" | "Proposed";
  source: string;
  value: string;
};

export type CandidateTimelineEvent = {
  actor: string;
  id: string;
  source: string;
  state: "Confirmed" | "Imported" | "Proposed";
  time: string;
  title: string;
};

export type CandidateRecord = {
  company: string;
  currentSignal: string;
  facts: CandidateFact[];
  id: string;
  initials: string;
  lastInteraction: string;
  name: string;
  nextAction: string;
  nextDue: string;
  role: string;
  tags: string[];
  timeline: CandidateTimelineEvent[];
  verdict: "Advance" | "At risk" | "Resolve blocker" | "Wait";
};

export const candidateRecords: CandidateRecord[] = [
  {
    company: "Berg & Finch",
    currentSignal: "决策期限前，远程办公政策仍未解决。",
    facts: [
      {
        label: "决策窗口",
        provenance: "Confirmed",
        source: "候选人对话，周一 16:42",
        value: "需要在周三前做出决定",
      },
      {
        label: "工作方式",
        provenance: "Open question",
        source: "候选人对话，周一 16:42",
        value: "远程办公灵活性很重要",
      },
      {
        label: "可沟通时间",
        provenance: "Confirmed",
        source: "候选人对话，周一 16:42",
        value: "周二下午",
      },
    ],
    id: "leila-hartmann",
    initials: "LH",
    lastInteraction: "今天 16:42",
    name: "Leila Hartmann",
    nextAction: "安排日程前，向客户确认远程办公政策。",
    nextDue: "今天截止",
    role: "产品副总裁",
    tags: ["另一份录用意向", "远程办公", "决策窗口"],
    timeline: [
      {
        actor: "Morgan Lee",
        id: "leila-policy-action",
        source:
          "“I have another offer and need to decide by Wednesday, but remote flexibility is important.”",
        state: "Proposed",
        time: "今天 16:45",
        title: "已提议确认远程办公政策",
      },
      {
        actor: "Morgan Lee",
        id: "leila-deadline-confirmed",
        source: "“I need to decide by Wednesday.”",
        state: "Confirmed",
        time: "今天 16:44",
        title: "决策期限已确认",
      },
      {
        actor: "Talent Signal",
        id: "leila-evidence-imported",
        source: "由候选人控制的对话导入",
        state: "Imported",
        time: "今天 16:42",
        title: "对话依据已导入",
      },
    ],
    verdict: "At risk",
  },
  {
    company: "Calder Systems",
    currentSignal: "已有明确的沟通时间窗口。",
    facts: [
      {
        label: "可沟通时间",
        provenance: "Confirmed",
        source: "招聘顾问通话备注，周五 11:08",
        value: "周四上午",
      },
      {
        label: "职责范围",
        provenance: "Open question",
        source: "招聘顾问通话备注，周五 11:08",
        value: "希望明确团队职责归属",
      },
    ],
    id: "amir-okafor",
    initials: "AO",
    lastInteraction: "周五 11:08",
    name: "Amir Okafor",
    nextAction: "通话前发送两个有关团队职责的问题。",
    nextDue: "明天截止",
    role: "工程总监",
    tags: ["有时间", "团队职责"],
    timeline: [
      {
        actor: "Morgan Lee",
        id: "amir-questions",
        source: "“I would like to understand what the team truly owns.”",
        state: "Proposed",
        time: "周五 11:10",
        title: "职责问题已准备",
      },
      {
        actor: "Morgan Lee",
        id: "amir-availability",
        source: "“Thursday morning works well for me.”",
        state: "Confirmed",
        time: "周五 11:09",
        title: "可沟通时间已确认",
      },
    ],
    verdict: "Advance",
  },
  {
    company: "Halden Foods",
    currentSignal: "客户简报中缺少薪酬背景。",
    facts: [
      {
        label: "薪酬",
        provenance: "Open question",
        source: "候选人通话，周四 18:20",
        value: "继续推进前需要完整薪酬方案",
      },
      {
        label: "意向",
        provenance: "Confirmed",
        source: "候选人通话，周四 18:20",
        value: "职位职责范围仍有吸引力",
      },
    ],
    id: "sofia-reyes",
    initials: "SR",
    lastInteraction: "周四 18:20",
    name: "Sofía Reyes",
    nextAction: "向客户索取完整薪酬范围。",
    nextDue: "本周截止",
    role: "首席运营官",
    tags: ["薪酬", "客户依赖"],
    timeline: [
      {
        actor: "Morgan Lee",
        id: "sofia-comp",
        source:
          "“The scope is compelling. I need the complete package before I can continue.”",
        state: "Confirmed",
        time: "周四 18:23",
        title: "薪酬依赖已确认",
      },
      {
        actor: "Talent Signal",
        id: "sofia-import",
        source: "由招聘顾问控制的通话备注",
        state: "Imported",
        time: "周四 18:20",
        title: "通话依据已导入",
      },
    ],
    verdict: "Resolve blocker",
  },
  {
    company: "Aster Compute",
    currentSignal: "尚未出现新的承诺。",
    facts: [
      {
        label: "时间安排",
        provenance: "Confirmed",
        source: "邮件回复，上周",
        value: "产品发布后再联系",
      },
    ],
    id: "nkemdilim-okafor",
    initials: "NO",
    lastInteraction: "上周",
    name: "Nkemdilim Okafor",
    nextAction: "等待约定的跟进窗口。",
    nextDue: "无需行动",
    role: "首席机器学习研究员",
    tags: ["稍后跟进"],
    timeline: [
      {
        actor: "Morgan Lee",
        id: "nkemdilim-timing",
        source: "“Please come back to me after our product launch.”",
        state: "Confirmed",
        time: "上周",
        title: "跟进窗口已确认",
      },
    ],
    verdict: "Wait",
  },
];
