import type { Pursuit, PursuitProposal } from "@talent-signal/contracts";

export const TODAY_FOCUSED_ITEM_LIMIT = 6;

export type TodayEvidenceState =
  | "available"
  | "partial"
  | "unavailable"
  | "not_required";

export type TodayAgentContext = {
  captureId: string;
  evidenceRefs: string[];
};

export type PursuitTodayItem = {
  pursuitId: string;
  title: string;
  targetOutcome: string;
  targetDate: string;
  milestone: string;
  revision: number;
  personLabel: string | null;
  attentionKind: "review" | "action" | "gap";
  attentionTitle: string;
  attentionDetail: string;
  proposalId: string | null;
  proposalStatus: PursuitProposal["status"] | null;
  proposalItemCount: number;
  action: {
    id: string;
    title: string;
    owner: string;
    dueAt: string | null;
    status: Pursuit["actions"][number]["status"];
  } | null;
  gap: {
    id: string;
    title: string;
    closeCondition: string;
  } | null;
  evidenceState: TodayEvidenceState;
  agentContext: TodayAgentContext | null;
};

export type PursuitTodayProjection = {
  workspaceId: string;
  items: PursuitTodayItem[];
  attentionCount: number;
  noActionCount: number;
  totalPursuits: number;
};

const attentionProposalStatuses = new Set<PursuitProposal["status"]>([
  "needs_review",
  "conflict",
  "failed",
]);
const openActionStatuses = new Set<Pursuit["actions"][number]["status"]>([
  "drafted",
  "awaiting_confirmation",
  "scheduled",
  "in_progress",
]);

function timestamp(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function latestFirst(left: PursuitProposal, right: PursuitProposal): number {
  return timestamp(right.updated_at) - timestamp(left.updated_at);
}

function proposalForAgent(
  proposals: readonly PursuitProposal[],
): PursuitProposal | null {
  return (
    proposals.find(
      (proposal) =>
        proposal.evidence_state.availability === "available" &&
        proposal.items.some((item) => item.evidence_refs.length > 0),
    ) ?? null
  );
}

function agentContext(
  proposal: PursuitProposal | null,
): TodayAgentContext | null {
  if (!proposal) return null;
  const evidenceRefs = [
    ...new Set(proposal.items.flatMap((item) => item.evidence_refs)),
  ];
  return evidenceRefs.length > 0
    ? { captureId: proposal.capture_id, evidenceRefs }
    : null;
}

function evidenceState(
  proposal: PursuitProposal | null,
  gap: Pursuit["gaps"][number] | null,
  pursuit: Pursuit,
): TodayEvidenceState {
  return (
    proposal?.evidence_state.availability ??
    gap?.basis.evidence_state.availability ??
    pursuit.milestone_authority.evidence_state.availability
  );
}

function rank(item: PursuitTodayItem, now: number): [number, number, string] {
  if (item.attentionKind === "review") return [0, 0, item.targetDate];
  if (item.action) {
    const due = timestamp(item.action.dueAt);
    return [due <= now ? 1 : 2, due, item.targetDate];
  }
  return [3, timestamp(`${item.targetDate}T23:59:59Z`), item.targetDate];
}

export function buildPursuitTodayProjection(
  workspaceId: string,
  pursuits: readonly Pursuit[],
  proposals: readonly PursuitProposal[],
  now = Date.now(),
): PursuitTodayProjection {
  const proposalsByPursuit = new Map<string, PursuitProposal[]>();
  for (const proposal of proposals) {
    const grouped = proposalsByPursuit.get(proposal.pursuit_id) ?? [];
    grouped.push(proposal);
    proposalsByPursuit.set(proposal.pursuit_id, grouped);
  }
  for (const grouped of proposalsByPursuit.values()) grouped.sort(latestFirst);

  const activePursuits = pursuits.filter((pursuit) =>
    new Set<Pursuit["status"]>(["draft", "active", "paused"]).has(
      pursuit.status,
    ),
  );
  const items = activePursuits.flatMap<PursuitTodayItem>((pursuit) => {
    const pursuitProposals = proposalsByPursuit.get(pursuit.id) ?? [];
    const proposal =
      pursuitProposals.find((item) => attentionProposalStatuses.has(item.status)) ??
      null;
    const action =
      [...pursuit.actions]
        .filter((item) => openActionStatuses.has(item.status))
        .sort((left, right) => timestamp(left.due_at) - timestamp(right.due_at))[0] ??
      null;
    const gap = pursuit.gaps.find((item) => item.status === "open") ?? null;
    if (!proposal && !action && !gap) return [];

    const primaryKind = proposal ? "review" : action ? "action" : "gap";
    const attentionTitle = proposal
      ? proposal.status === "needs_review"
        ? proposal.summary
        : proposal.status === "conflict"
          ? "Review no longer matches the current Pursuit revision"
          : "Proposal processing needs attention"
      : action
        ? action.title
        : gap?.title ?? "Open dependency";
    const attentionDetail = proposal
      ? `${proposal.items.length} proposed ${proposal.items.length === 1 ? "change" : "changes"}; no state changes before review.`
      : action
        ? `Owned by ${action.owner_display_name}${
            action.due_at ? ` · due ${action.due_at}` : " · no due time recorded"
          }.`
        : gap?.close_condition ?? "No close condition is recorded.";
    const sourceProposal = proposalForAgent(pursuitProposals);

    return [
      {
        pursuitId: pursuit.id,
        title: pursuit.title,
        targetOutcome: pursuit.target_outcome,
        targetDate: pursuit.target_date,
        milestone: pursuit.milestone,
        revision: pursuit.revision,
        personLabel: proposal?.review_context.subject.display_label ?? null,
        attentionKind: primaryKind,
        attentionTitle,
        attentionDetail,
        proposalId: proposal?.id ?? null,
        proposalStatus: proposal?.status ?? null,
        proposalItemCount: proposal?.items.length ?? 0,
        action: action
          ? {
              id: action.id,
              title: action.title,
              owner: action.owner_display_name,
              dueAt: action.due_at,
              status: action.status,
            }
          : null,
        gap: gap
          ? {
              id: gap.id,
              title: gap.title,
              closeCondition: gap.close_condition,
            }
          : null,
        evidenceState: evidenceState(proposal, gap, pursuit),
        agentContext: agentContext(sourceProposal),
      },
    ];
  });

  items.sort((left, right) => {
    const leftRank = rank(left, now);
    const rightRank = rank(right, now);
    return (
      leftRank[0] - rightRank[0] ||
      leftRank[1] - rightRank[1] ||
      leftRank[2].localeCompare(rightRank[2]) ||
      left.title.localeCompare(right.title)
    );
  });

  return {
    workspaceId,
    items,
    attentionCount: items.length,
    noActionCount: activePursuits.length - items.length,
    totalPursuits: activePursuits.length,
  };
}

export function limitPursuitTodayProjection(
  projection: PursuitTodayProjection,
  visibleItemLimit: number,
): PursuitTodayProjection {
  const safeLimit = Math.max(1, Math.floor(visibleItemLimit));
  if (projection.items.length <= safeLimit) {
    return projection;
  }
  return {
    ...projection,
    items: projection.items.slice(0, safeLimit),
  };
}
