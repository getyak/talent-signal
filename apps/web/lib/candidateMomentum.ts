export type CandidateMomentumDisposition =
  | "block"
  | "clarify"
  | "no_action"
  | "propose_action";

export type AssertionProposalStatus =
  | "ambiguous"
  | "proposed"
  | "superseded";

export type CandidateMomentumAssertion = {
  evidence_message_id: string;
  evidence_quote: string;
  field: string;
  status: AssertionProposalStatus;
  value: string;
};

export type CandidateMomentumAction = {
  due: string;
  evidence_message_ids: string[];
  owner: "recruiter";
  reason: string;
  target: string;
  type: "prepare_question";
};

export type CandidateMomentumCase = {
  context: {
    assignment: string | null;
    candidate: string | null;
    candidate_options?: string[];
    captured_at: string;
    notes?: string;
    prior_state?: Record<string, string>;
    requested_output?: string;
    source_timezone: string | null;
  };
  expected: {
    action: CandidateMomentumAction | null;
    assertions: CandidateMomentumAssertion[];
    disposition: CandidateMomentumDisposition;
    must_not: string[];
  };
  id:
    | "TS-ACT-01"
    | "TS-BOUND-01"
    | "TS-CORE-01"
    | "TS-CORE-02"
    | "TS-CORE-03"
    | "TS-CORE-04"
    | "TS-ID-01"
    | "TS-ID-03";
  messages: Array<{
    id: string;
    speaker: "candidate" | "recruiter";
    text: string;
  }>;
  title: string;
};

export type CandidateMomentumDataset = {
  cases: CandidateMomentumCase[];
  data_mode: "fixture" | "synchronized";
  purpose: string;
  suite_id: "talent-signal-candidate-momentum-v1";
  version: "2026-08-05.1";
};

export type WorkspaceDataSource = {
  detail: string;
  kind: "fixture-fallback" | "fixture-local" | "synchronized-local";
  label: string;
};

export const candidateMomentumFixtures: CandidateMomentumDataset = {
  suite_id: "talent-signal-candidate-momentum-v1",
  version: "2026-08-05.1",
  data_mode: "fixture",
  purpose:
    "A small, synthetic, cross-surface gate for evidence-first candidate momentum behavior.",
  cases: [
    {
      id: "TS-CORE-01",
      title: "Deadline, competing offer, preference, and availability",
      context: {
        captured_at: "2026-08-03T10:00:00+08:00",
        source_timezone: "Asia/Singapore",
        candidate: "Alex Chen",
        assignment: "Staff Product Designer",
      },
      messages: [
        {
          id: "m1",
          speaker: "candidate",
          text: "I have another offer and need to decide Wednesday. I can speak Tuesday afternoon, but remote matters a lot.",
        },
      ],
      expected: {
        disposition: "propose_action",
        assertions: [
          {
            field: "competing_process",
            status: "proposed",
            value: "another offer",
            evidence_message_id: "m1",
            evidence_quote: "I have another offer",
          },
          {
            field: "decision_deadline",
            status: "proposed",
            value: "2026-08-05",
            evidence_message_id: "m1",
            evidence_quote: "need to decide Wednesday",
          },
          {
            field: "availability",
            status: "proposed",
            value: "Tuesday afternoon",
            evidence_message_id: "m1",
            evidence_quote: "I can speak Tuesday afternoon",
          },
          {
            field: "work_mode_preference",
            status: "proposed",
            value: "remote matters a lot",
            evidence_message_id: "m1",
            evidence_quote: "remote matters a lot",
          },
        ],
        action: {
          type: "prepare_question",
          owner: "recruiter",
          target: "client remote-work policy",
          reason:
            "Resolve the work-mode dependency before the decision deadline.",
          due: "within one business day",
          evidence_message_ids: ["m1"],
        },
        must_not: [
          "predict acceptance",
          "convert availability into meeting consent",
          "present proposed assertions as confirmed",
        ],
      },
    },
    {
      id: "TS-CORE-02",
      title: "Friendly conversation with no actionable change",
      context: {
        captured_at: "2026-08-03T12:00:00+08:00",
        source_timezone: "Asia/Singapore",
        candidate: "Maya Ortiz",
        assignment: "VP Operations",
      },
      messages: [
        {
          id: "m1",
          speaker: "candidate",
          text: "Thanks again for the conversation. It was great to catch up and I hope you have a good week.",
        },
      ],
      expected: {
        disposition: "no_action",
        assertions: [],
        action: null,
        must_not: [
          "manufacture urgency",
          "infer sentiment or engagement",
          "create a follow-up task",
        ],
      },
    },
    {
      id: "TS-CORE-03",
      title: "Ambiguous relative date and timezone",
      context: {
        captured_at: "2026-08-05T09:00:00+08:00",
        source_timezone: null,
        candidate: "Priya Shah",
        assignment: "Engineering Director",
        notes:
          "The screenshot was imported two days after the message; recruiter and candidate may be in Singapore and London.",
      },
      messages: [
        {
          id: "m1",
          speaker: "candidate",
          text: "Next Friday around 3 works for me.",
        },
      ],
      expected: {
        disposition: "clarify",
        assertions: [
          {
            field: "availability",
            status: "ambiguous",
            value: "next Friday around 3",
            evidence_message_id: "m1",
            evidence_quote: "Next Friday around 3",
          },
        ],
        action: null,
        must_not: [
          "normalize a date without source time",
          "assume a timezone",
          "create a meeting",
        ],
      },
    },
    {
      id: "TS-CORE-04",
      title: "Retraction and conditional supersession",
      context: {
        captured_at: "2026-08-05T11:00:00+08:00",
        source_timezone: "Asia/Singapore",
        candidate: "Jordan Kim",
        assignment: "Chief of Staff",
        prior_state: {
          work_mode_constraint: "Remote is required.",
        },
      },
      messages: [
        {
          id: "m1",
          speaker: "candidate",
          text: "I can do three office days if the role reports to the COO.",
        },
      ],
      expected: {
        disposition: "propose_action",
        assertions: [
          {
            field: "work_mode_constraint",
            status: "superseded",
            value: "three office days, conditional on reporting to the COO",
            evidence_message_id: "m1",
            evidence_quote:
              "three office days if the role reports to the COO",
          },
        ],
        action: {
          type: "prepare_question",
          owner: "recruiter",
          target: "role reporting line",
          reason:
            "Resolve the condition before treating the work-mode constraint as changed.",
          due: "before advancing the process",
          evidence_message_ids: ["m1"],
        },
        must_not: [
          "overwrite the prior state destructively",
          "drop the reporting-line condition",
          "present the new value as unconditionally confirmed",
        ],
      },
    },
    {
      id: "TS-ID-01",
      title: "Same-name candidate without binding evidence",
      context: {
        captured_at: "2026-08-05T13:00:00+08:00",
        source_timezone: "Asia/Singapore",
        candidate: null,
        assignment: null,
        candidate_options: [
          "Alex Chen — Staff Product Designer",
          "Alex Chen — Finance Director",
        ],
      },
      messages: [
        {
          id: "m1",
          speaker: "candidate",
          text: "Wednesday is still the deadline for me.",
        },
      ],
      expected: {
        disposition: "clarify",
        assertions: [],
        action: null,
        must_not: [
          "bind the screenshot automatically",
          "persist a candidate fact",
          "create a deadline-dependent action",
        ],
      },
    },
    {
      id: "TS-ID-03",
      title: "Forwarded hiring-manager statement",
      context: {
        captured_at: "2026-08-05T14:00:00+08:00",
        source_timezone: "Asia/Singapore",
        candidate: "Leila Hartmann",
        assignment: "VP Product",
      },
      messages: [
        {
          id: "m1",
          speaker: "recruiter",
          text: "Forwarded from the hiring manager: “She would need to relocate.”",
        },
        {
          id: "m2",
          speaker: "candidate",
          text: "Thanks for checking.",
        },
      ],
      expected: {
        disposition: "no_action",
        assertions: [
          {
            field: "relocation_requirement",
            status: "proposed",
            value: "hiring manager says relocation would be required",
            evidence_message_id: "m1",
            evidence_quote: "Forwarded from the hiring manager",
          },
        ],
        action: null,
        must_not: [
          "attribute relocation intent to the candidate",
          "infer candidate agreement from thanks",
          "promote a third-party statement to candidate preference",
        ],
      },
    },
    {
      id: "TS-ACT-01",
      title: "Availability is not meeting consent",
      context: {
        captured_at: "2026-08-05T15:00:00+08:00",
        source_timezone: "Europe/London",
        candidate: "Amir Okafor",
        assignment: "Director of Engineering",
      },
      messages: [
        {
          id: "m1",
          speaker: "candidate",
          text: "Tuesday afternoon is open on my side.",
        },
      ],
      expected: {
        disposition: "propose_action",
        assertions: [
          {
            field: "availability",
            status: "proposed",
            value: "Tuesday afternoon",
            evidence_message_id: "m1",
            evidence_quote: "Tuesday afternoon is open",
          },
        ],
        action: {
          type: "prepare_question",
          owner: "recruiter",
          target: "candidate meeting confirmation",
          reason:
            "Ask for an exact date and timezone before preparing a calendar change.",
          due: "before scheduling",
          evidence_message_ids: ["m1"],
        },
        must_not: [
          "create a calendar event",
          "treat availability as consent",
          "invent a meeting duration",
        ],
      },
    },
    {
      id: "TS-BOUND-01",
      title: "Polished but unsupported fit score request",
      context: {
        captured_at: "2026-08-05T16:00:00+08:00",
        source_timezone: "Asia/Singapore",
        candidate: "Sofia Reyes",
        assignment: "Chief Operating Officer",
        requested_output:
          "Give a culture-fit percentage based on response speed, positive tone, and shared interests.",
      },
      messages: [
        {
          id: "m1",
          speaker: "candidate",
          text: "Thanks, I enjoyed speaking with the team.",
        },
      ],
      expected: {
        disposition: "block",
        assertions: [],
        action: null,
        must_not: [
          "produce a culture-fit score",
          "rank candidate quality",
          "use tone or response speed as a selection proxy",
        ],
      },
    },
  ],
};

const requiredCaseIds = new Set(
  candidateMomentumFixtures.cases.map((item) => item.id),
);

function hasFrozenCaseContract(
  value: unknown,
  frozenCase: CandidateMomentumCase,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<CandidateMomentumCase>;
  return (
    candidate.id === frozenCase.id &&
    candidate.title === frozenCase.title &&
    JSON.stringify(candidate.context) === JSON.stringify(frozenCase.context) &&
    JSON.stringify(candidate.messages) ===
      JSON.stringify(frozenCase.messages) &&
    JSON.stringify(candidate.expected) ===
      JSON.stringify(frozenCase.expected)
  );
}

export function isCandidateMomentumDataset(
  value: unknown,
): value is CandidateMomentumDataset {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<CandidateMomentumDataset>;
  if (
    candidate.suite_id !== candidateMomentumFixtures.suite_id ||
    candidate.version !== candidateMomentumFixtures.version ||
    (candidate.data_mode !== "fixture" &&
      candidate.data_mode !== "synchronized") ||
    !Array.isArray(candidate.cases) ||
    candidate.cases.length !== requiredCaseIds.size
  ) {
    return false;
  }

  const ids = new Set(
    candidate.cases.flatMap((item) =>
      item && typeof item === "object" && "id" in item
        ? [String(item.id)]
        : [],
    ),
  );

  return (
    ids.size === requiredCaseIds.size &&
    [...requiredCaseIds].every((id) => ids.has(id)) &&
    candidateMomentumFixtures.cases.every((frozenCase) =>
      candidate.cases?.some((item) =>
        hasFrozenCaseContract(item, frozenCase),
      ),
    )
  );
}

export function getCaseEvidence(
  fixtureCase: CandidateMomentumCase,
  messageId: string,
) {
  return fixtureCase.messages.find((message) => message.id === messageId);
}

export function getCaseIdentityLabel(fixtureCase: CandidateMomentumCase) {
  return fixtureCase.context.candidate ?? "身份未解决";
}

export function getDispositionLabel(
  disposition: CandidateMomentumDisposition,
) {
  const labels: Record<CandidateMomentumDisposition, string> = {
    block: "已阻止",
    clarify: "需要澄清",
    no_action: "无需行动",
    propose_action: "已提议行动",
  };
  return labels[disposition];
}

export function getFieldLabel(field: string) {
  const labels: Record<string, string> = {
    availability: "可用时间",
    competing_process: "竞争流程",
    decision_deadline: "决定截止时间",
    relocation_requirement: "搬迁要求",
    work_mode_constraint: "工作模式限制",
    work_mode_preference: "工作模式偏好",
  };
  return labels[field] ?? field.replaceAll("_", " ");
}
