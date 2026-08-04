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
    currentSignal: "Remote policy is unresolved before a decision deadline.",
    facts: [
      {
        label: "Decision window",
        provenance: "Confirmed",
        source: "Candidate conversation, Monday 16:42",
        value: "Needs to decide by Wednesday",
      },
      {
        label: "Work mode",
        provenance: "Open question",
        source: "Candidate conversation, Monday 16:42",
        value: "Remote flexibility is important",
      },
      {
        label: "Availability",
        provenance: "Confirmed",
        source: "Candidate conversation, Monday 16:42",
        value: "Tuesday afternoon",
      },
    ],
    id: "leila-hartmann",
    initials: "LH",
    lastInteraction: "Today, 16:42",
    name: "Leila Hartmann",
    nextAction: "Confirm the client remote policy before scheduling.",
    nextDue: "Due today",
    role: "VP Product",
    tags: ["Competing offer", "Remote", "Decision window"],
    timeline: [
      {
        actor: "Morgan Lee",
        id: "leila-policy-action",
        source:
          "“I have another offer and need to decide by Wednesday, but remote flexibility is important.”",
        state: "Proposed",
        time: "Today, 16:45",
        title: "Remote policy confirmation proposed",
      },
      {
        actor: "Morgan Lee",
        id: "leila-deadline-confirmed",
        source: "“I need to decide by Wednesday.”",
        state: "Confirmed",
        time: "Today, 16:44",
        title: "Decision deadline confirmed",
      },
      {
        actor: "Talent Signal",
        id: "leila-evidence-imported",
        source: "Candidate-owned conversation import",
        state: "Imported",
        time: "Today, 16:42",
        title: "Conversation evidence imported",
      },
    ],
    verdict: "At risk",
  },
  {
    company: "Calder Systems",
    currentSignal: "A concrete conversation window is available.",
    facts: [
      {
        label: "Availability",
        provenance: "Confirmed",
        source: "Recruiter call note, Friday 11:08",
        value: "Thursday morning",
      },
      {
        label: "Scope",
        provenance: "Open question",
        source: "Recruiter call note, Friday 11:08",
        value: "Wants clarity on team ownership",
      },
    ],
    id: "amir-okafor",
    initials: "AO",
    lastInteraction: "Friday, 11:08",
    name: "Amir Okafor",
    nextAction: "Send two team-scope questions before the call.",
    nextDue: "Due tomorrow",
    role: "Director of Engineering",
    tags: ["Available", "Team scope"],
    timeline: [
      {
        actor: "Morgan Lee",
        id: "amir-questions",
        source: "“I would like to understand what the team truly owns.”",
        state: "Proposed",
        time: "Friday, 11:10",
        title: "Scope questions prepared",
      },
      {
        actor: "Morgan Lee",
        id: "amir-availability",
        source: "“Thursday morning works well for me.”",
        state: "Confirmed",
        time: "Friday, 11:09",
        title: "Availability confirmed",
      },
    ],
    verdict: "Advance",
  },
  {
    company: "Halden Foods",
    currentSignal: "Compensation context is missing from the client brief.",
    facts: [
      {
        label: "Compensation",
        provenance: "Open question",
        source: "Candidate call, Thursday 18:20",
        value: "Needs the full package before proceeding",
      },
      {
        label: "Interest",
        provenance: "Confirmed",
        source: "Candidate call, Thursday 18:20",
        value: "Role scope remains compelling",
      },
    ],
    id: "sofia-reyes",
    initials: "SR",
    lastInteraction: "Thursday, 18:20",
    name: "Sofía Reyes",
    nextAction: "Ask the client for the complete compensation range.",
    nextDue: "Due this week",
    role: "Chief Operating Officer",
    tags: ["Compensation", "Client dependency"],
    timeline: [
      {
        actor: "Morgan Lee",
        id: "sofia-comp",
        source:
          "“The scope is compelling. I need the complete package before I can continue.”",
        state: "Confirmed",
        time: "Thursday, 18:23",
        title: "Compensation dependency confirmed",
      },
      {
        actor: "Talent Signal",
        id: "sofia-import",
        source: "Recruiter-controlled call note",
        state: "Imported",
        time: "Thursday, 18:20",
        title: "Call evidence imported",
      },
    ],
    verdict: "Resolve blocker",
  },
  {
    company: "Aster Compute",
    currentSignal: "No new commitment has been made.",
    facts: [
      {
        label: "Timing",
        provenance: "Confirmed",
        source: "Email reply, last week",
        value: "Revisit after the product launch",
      },
    ],
    id: "nkemdilim-okafor",
    initials: "NO",
    lastInteraction: "Last week",
    name: "Nkemdilim Okafor",
    nextAction: "Wait until the agreed follow-up window.",
    nextDue: "No action due",
    role: "Principal ML Researcher",
    tags: ["Follow-up later"],
    timeline: [
      {
        actor: "Morgan Lee",
        id: "nkemdilim-timing",
        source: "“Please come back to me after our product launch.”",
        state: "Confirmed",
        time: "Last week",
        title: "Follow-up window confirmed",
      },
    ],
    verdict: "Wait",
  },
];
