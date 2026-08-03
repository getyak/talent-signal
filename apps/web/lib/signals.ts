export type EvidenceKind =
  | "availability"
  | "competing-offer"
  | "deadline"
  | "preference";

export type Verdict = "Advance" | "At risk" | "Resolve blocker" | "Wait";

export type Evidence = {
  id: EvidenceKind;
  label: string;
  excerpt: string;
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

const evidenceRules: Array<{
  id: EvidenceKind;
  label: string;
  pattern: RegExp;
  excerpt: string;
}> = [
  {
    id: "competing-offer",
    label: "Competing offer",
    pattern: /\b(another|competing|other)\s+offer\b|\boffer in hand\b/i,
    excerpt: "Another offer is active.",
  },
  {
    id: "deadline",
    label: "Decision window",
    pattern:
      /\b(by|before|decide|decision|deadline)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|this week|next week)\b/i,
    excerpt: "A decision deadline is explicit.",
  },
  {
    id: "preference",
    label: "Remote constraint",
    pattern: /\b(remote|hybrid|work from home|flexibility)\b/i,
    excerpt: "Work-location flexibility matters.",
  },
  {
    id: "availability",
    label: "Tuesday availability",
    pattern:
      /\b(monday|tuesday|wednesday|thursday|friday)\b.*\b(morning|afternoon|evening|available|works|speak|call)\b|\b(available|works|speak|call)\b.*\b(monday|tuesday|wednesday|thursday|friday)\b/i,
    excerpt: "A concrete conversation window is available.",
  },
];

export const sampleConversation =
  "I have another offer and need to decide by Wednesday. I can speak Tuesday afternoon, but remote flexibility is important.";

export function deriveInsight(evidence: Evidence[]): Insight {
  const kinds = new Set(evidence.map((item) => item.id));
  const hasDecisionPressure =
    kinds.has("deadline") || kinds.has("competing-offer");
  const hasUnresolvedConstraint = kinds.has("preference");

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

  if (kinds.has("availability")) {
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

export function analyzeConversation(input: string): AnalysisResult {
  const normalized = input.trim();
  const evidence = normalized
    ? evidenceRules
        .filter((rule) => rule.pattern.test(normalized))
        .map(({ id, label, excerpt }) => ({ id, label, excerpt }))
    : [];

  const actions: ProposedAction[] = evidence.map((item) => {
    if (item.id === "availability") {
      return {
        id: "meeting-tuesday",
        type: "create-meeting",
        title: "Create Tuesday meeting",
        detail: "Propose Tuesday afternoon. Time remains editable.",
        evidenceId: item.id,
      };
    }

    const titles: Record<Exclude<EvidenceKind, "availability">, string> = {
      "competing-offer": "Record competing offer",
      deadline: "Record decision deadline",
      preference: "Record remote preference",
    };

    return {
      id: `update-${item.id}`,
      type: "update-contact",
      title: titles[item.id],
      detail: "Add as a confirmed candidate fact with its source attached.",
      evidenceId: item.id,
    };
  });

  return {
    evidence,
    actions,
    insight: deriveInsight(evidence),
  };
}
