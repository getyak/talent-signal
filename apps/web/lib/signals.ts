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
    label: "Competing offer",
    pattern: /\b(another|competing|other)\s+offer\b|\boffer in hand\b/i,
    modality: "explicit-fact",
  },
  {
    id: "deadline",
    label: "Decision window",
    pattern:
      /\b(by|before|decide|decision|deadline)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|this week|next week)\b/i,
    modality: "commitment",
  },
  {
    id: "preference",
    label: "Remote constraint",
    pattern: /\b(remote|hybrid|work from home|flexibility)\b/i,
    modality: "preference",
  },
  {
    id: "availability",
    label: "Tuesday availability",
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
          "The note states a timezone, but the source date is missing, so the relative time window is unresolved.",
        nextAction:
          "Clarify the exact calendar date before confirming a deadline or preparing a meeting.",
      };
    }

    return {
      verdict: "Resolve blocker",
      rationale:
        "The note contains a relative time window, but the source date or timezone is missing.",
      nextAction:
        "Clarify the exact date and timezone before confirming a deadline or preparing a meeting.",
    };
  }

  if (hasDecisionPressure && hasUnresolvedConstraint) {
    return {
      verdict: "At risk",
      rationale:
        "A near decision window and an unresolved work-location constraint could stall the search.",
      nextAction: "Confirm the remote policy before scheduling a generic interview.",
    };
  }

  if (hasDecisionPressure) {
    return {
      verdict: "Resolve blocker",
      rationale:
        "The candidate has explicit decision pressure, but the deciding constraint is not yet clear.",
      nextAction: "Ask what must be true before the decision deadline.",
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
        "The candidate has offered a concrete window and no explicit blocker is present.",
      nextAction: "Confirm the proposed conversation window.",
    };
  }

  return {
    verdict: "Wait",
    rationale:
      "No explicit deadline, constraint, competing offer, or scheduling commitment was found.",
    nextAction: "Keep the note as context and avoid creating an operational update.",
  };
}

const actionTitles: Record<EvidenceKind, string> = {
  availability: "Review candidate availability",
  "client-dependency": "Record client dependency",
  commitment: "Record candidate commitment",
  "competing-offer": "Record competing offer",
  constraint: "Record candidate constraint",
  deadline: "Record decision deadline",
  "location-or-work-mode": "Record work-mode requirement",
  "next-meeting": "Review proposed meeting",
  "open-question": "Record open candidate question",
  preference: "Record candidate preference",
  "stage-change": "Record process stage change",
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
          ? "Resolve the source date before confirming this relative deadline. Keep the stated timezone attached."
          : "Resolve the source date and timezone before confirming this deadline."
        : temporalContext.hasExplicitTimeZone
          ? "Resolve the exact calendar date and local time before scheduling. Keep the stated timezone attached."
          : "Resolve the exact date, local time, and timezone before scheduling.",
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
          "Create a meeting proposal from the quoted window. Date and time remain editable.",
        evidenceId: item.id,
      };
    }

    return {
      id: `update-${item.id}`,
      type: "update-contact",
      title: actionTitles[item.id],
      detail: "Add as a confirmed candidate fact with its source attached.",
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
