export const evidenceKinds = [
  "availability",
  "client-dependency",
  "commitment",
  "competing-offer",
  "constraint",
  "deadline",
  "location-or-work-mode",
  "next-meeting",
  "open-question",
  "preference",
  "stage-change",
] as const;

export type EvidenceKind = (typeof evidenceKinds)[number];
export type EvidenceModality =
  | "commitment"
  | "constraint"
  | "explicit-fact"
  | "preference";
export type EvidenceSpeaker = "candidate" | "recruiter" | "unknown";

export type Verdict = "Advance" | "At risk" | "Resolve blocker" | "Wait";

export type Evidence = {
  id: EvidenceKind;
  label: string;
  excerpt: string;
  modality: EvidenceModality;
  speaker: EvidenceSpeaker;
  ambiguities: string[];
};

export type ProposedAction = {
  id: string;
  type: "create-meeting" | "update-contact";
  title: string;
  detail: string;
  evidenceId: EvidenceKind;
};

export type Insight = {
  verdict: Verdict;
  rationale: string;
  nextAction: string;
};

export type AnalysisResult = {
  evidence: Evidence[];
  actions: ProposedAction[];
  insight: Insight;
};

type TemporalResolutionContext = {
  hasExplicitTimeZone: boolean;
};

const unresolvedTemporalContext: TemporalResolutionContext = {
  hasExplicitTimeZone: false,
};

const evidenceRules: Array<{
  id: EvidenceKind;
  label: string;
  pattern: RegExp;
  modality: EvidenceModality;
}> = [
  {
    id: "competing-offer",
    label: "其他录用意向",
    pattern: /\b(another|competing|other)\s+offer\b|\boffer in hand\b/i,
    modality: "explicit-fact",
  },
  {
    id: "deadline",
    label: "决策窗口",
    pattern:
      /\b(by|before|decide|decision|deadline)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|this week|next week)\b/i,
    modality: "commitment",
  },
  {
    id: "preference",
    label: "远程工作限制",
    pattern: /\b(remote|hybrid|work from home|flexibility)\b/i,
    modality: "preference",
  },
  {
    id: "availability",
    label: "周二可沟通时间",
    pattern:
      /\b(available|works|speak|call)\b[^.!?\n]{0,48}\b(monday|tuesday|wednesday|thursday|friday)\b(?:[^.!?\n]{0,24}\b(morning|afternoon|evening)\b)?|\b(monday|tuesday|wednesday|thursday|friday)\b[^.!?\n]{0,48}\b(morning|afternoon|evening|available|works|speak|call)\b/i,
    modality: "commitment",
  },
];

export const sampleConversation =
  "I have another offer and need to decide by Wednesday. I can speak Tuesday afternoon, but remote flexibility is important.";

export function deriveInsight(
  evidence: Evidence[],
  temporalContext: TemporalResolutionContext = unresolvedTemporalContext,
): Insight {
  const kinds = new Set(evidence.map((item) => item.id));
  const hasAmbiguousDecisionPressure = evidence.some(
    (item) =>
      (item.id === "deadline" || item.id === "availability") &&
      item.ambiguities.length > 0,
  );
  const hasDecisionPressure =
    kinds.has("deadline") || kinds.has("competing-offer");
  const hasUnresolvedConstraint =
    kinds.has("preference") ||
    kinds.has("constraint") ||
    kinds.has("location-or-work-mode") ||
    kinds.has("client-dependency");

  if (hasAmbiguousDecisionPressure) {
    if (temporalContext.hasExplicitTimeZone) {
      return {
        verdict: "Resolve blocker",
        rationale:
          "笔记写明了时区，但缺少来源日期，因此相对时间窗口仍未解决。",
        nextAction:
          "确认期限或准备会议前，请先澄清准确的日历日期。",
      };
    }

    return {
      verdict: "Resolve blocker",
      rationale:
        "笔记包含相对时间窗口，但缺少来源日期或时区。",
      nextAction:
        "确认期限或准备会议前，请先澄清准确日期与时区。",
    };
  }

  if (hasDecisionPressure && hasUnresolvedConstraint) {
    return {
      verdict: "At risk",
      rationale:
        "临近的决策窗口与尚未解决的工作地点限制可能让寻访停滞。",
      nextAction: "安排常规面试前，请先确认远程办公政策。",
    };
  }

  if (hasDecisionPressure) {
    return {
      verdict: "Resolve blocker",
      rationale:
        "候选人面临明确的决策压力，但决定性限制尚不清楚。",
      nextAction: "询问在决策期限前必须满足什么条件。",
    };
  }

  if (
    kinds.has("availability") ||
    kinds.has("commitment") ||
    kinds.has("next-meeting")
  ) {
    return {
      verdict: "Advance",
      rationale:
        "候选人给出了明确时间窗口，当前没有明显阻碍。",
      nextAction: "确认拟议的沟通时间窗口。",
    };
  }

  return {
    verdict: "Wait",
    rationale:
      "没有发现明确期限、限制、其他录用意向或日程承诺。",
    nextAction: "把笔记保留为背景信息，不创建操作性更新。",
  };
}

const actionTitles: Record<EvidenceKind, string> = {
  availability: "审阅候选人可沟通时间",
  "client-dependency": "记录客户依赖项",
  commitment: "记录候选人承诺",
  "competing-offer": "记录其他录用意向",
  constraint: "记录候选人限制",
  deadline: "记录决策期限",
  "location-or-work-mode": "记录工作方式要求",
  "next-meeting": "审阅拟议会议",
  "open-question": "记录候选人的待解问题",
  preference: "记录候选人偏好",
  "stage-change": "记录流程阶段变化",
};

const relativeTimePattern =
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|this week|next week|next month)\b/i;

const explicitTimeZonePattern =
  /\b(?:time\s*zone|timezone)\s*(?:is|:)?\s*[a-z0-9_+:/-]{2,40}\b|\b(?:utc|gmt)\s*[+-]\s*\d{1,2}(?::?\d{2})?\b|\b(?:pst|pdt|est|edt|cst|cdt|mst|mdt|sgt|cet|cest|bst|ist|jst|aest|aedt)\b/i;

function addDeterministicTemporalAmbiguity(
  item: Evidence,
  temporalContext: TemporalResolutionContext,
): Evidence {
  if (
    item.ambiguities.length > 0 ||
    (item.id !== "deadline" &&
      item.id !== "availability" &&
      item.id !== "next-meeting") ||
    !relativeTimePattern.test(item.excerpt)
  ) {
    return item;
  }

  return {
    ...item,
    ambiguities: [
      item.id === "deadline"
        ? temporalContext.hasExplicitTimeZone
          ? "确认相对期限前，请先明确来源日期，并保留已声明的时区。"
          : "确认期限前，请先明确来源日期与时区。"
        : temporalContext.hasExplicitTimeZone
          ? "安排日程前，请先明确准确的日历日期与当地时间，并保留已声明的时区。"
          : "安排日程前，请先明确准确日期、当地时间与时区。",
    ],
  };
}

export function buildAnalysis(
  evidence: Evidence[],
  temporalContext: TemporalResolutionContext = unresolvedTemporalContext,
): AnalysisResult {
  const reviewEvidence = evidence.map((item) =>
    addDeterministicTemporalAmbiguity(item, temporalContext),
  );
  const actions = reviewEvidence.flatMap<ProposedAction>((item) => {
    if (item.speaker !== "candidate" || item.ambiguities.length > 0) {
      return [];
    }

    if (item.id === "availability" || item.id === "next-meeting") {
      return {
        id: `meeting-${item.id}`,
        type: "create-meeting",
        title: actionTitles[item.id],
        detail:
          "根据引文中的时间窗口创建会议提案，日期与时间仍可编辑。",
        evidenceId: item.id,
      };
    }

    return {
      id: `update-${item.id}`,
      type: "update-contact",
      title: actionTitles[item.id],
      detail: "添加为已确认的候选人事实，并继续关联其来源。",
      evidenceId: item.id,
    };
  });

  return {
    evidence: reviewEvidence,
    actions,
    insight: deriveInsight(reviewEvidence, temporalContext),
  };
}

export function analyzeConversation(input: string): AnalysisResult {
  const normalized = input.trim();
  const evidence = normalized
    ? evidenceRules.flatMap<Evidence>((rule) => {
        const match = rule.pattern.exec(normalized);
        if (!match) {
          return [];
        }

        return [
          {
            id: rule.id,
            label: rule.label,
            excerpt: match[0],
            modality: rule.modality,
            speaker: "candidate",
            ambiguities: [],
          },
        ];
      })
    : [];

  return buildAnalysis(evidence, {
    hasExplicitTimeZone: explicitTimeZonePattern.test(normalized),
  });
}
