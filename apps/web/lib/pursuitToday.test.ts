import { describe, expect, it } from "vitest";

import type { Pursuit, PursuitProposal } from "@talent-signal/contracts";
import {
  buildPursuitTodayProjection,
  limitPursuitTodayProjection,
} from "./pursuitToday";

const ids = {
  workspace: "10000000-0000-4000-8000-000000000001",
  user: "10000000-0000-4000-8000-000000000002",
  pursuit: "10000000-0000-4000-8000-000000000003",
  capture: "10000000-0000-4000-8000-000000000004",
  proposal: "10000000-0000-4000-8000-000000000005",
  evidence: "10000000-0000-4000-8000-000000000006",
  action: "10000000-0000-4000-8000-000000000007",
  gap: "10000000-0000-4000-8000-000000000008",
  receipt: "10000000-0000-4000-8000-000000000009",
} as const;

function pursuit(overrides: Partial<Pursuit> = {}): Pursuit {
  return {
    id: ids.pursuit,
    workspace_id: ids.workspace,
    type: "recruiting",
    title: "VP Product · Acme",
    target_outcome: "Accepted offer",
    target_date: "2026-09-30",
    status: "active",
    milestone: "Shortlist review",
    milestone_authority: {
      kind: "user_authored",
      evidence_refs: [],
      evidence_state: {
        availability: "not_required",
        reference_count: 0,
        available_reference_count: 0,
        unavailable_reference_count: 0,
      },
      confirmed_by_user_id: ids.user,
      confirmed_at: "2026-08-26T00:00:00.000Z",
      proposal_id: null,
      receipt_id: ids.receipt,
    },
    revision: 1,
    roles: [],
    criteria: [],
    gaps: [],
    actions: [],
    created_at: "2026-08-25T00:00:00.000Z",
    updated_at: "2026-08-26T00:00:00.000Z",
    ...overrides,
  };
}

function proposal(overrides: Partial<PursuitProposal> = {}): PursuitProposal {
  return {
    id: ids.proposal,
    workspace_id: ids.workspace,
    pursuit_id: ids.pursuit,
    capture_id: ids.capture,
    base_revision: 1,
    summary: "The final conversation may be ready to schedule.",
    producer: {
      kind: "agent",
      name: "bounded-agent",
      version: "1.0.0",
      run_id: "synthetic-run",
    },
    status: "needs_review",
    revision: 1,
    evidence_state: {
      availability: "available",
      reference_count: 1,
      available_reference_count: 1,
      unavailable_reference_count: 0,
    },
    review_context: {
      pursuit: { id: ids.pursuit, title: "VP Product · Acme" },
      capture: { id: ids.capture, purpose: "Synthetic proof" },
      subject: {
        person_id: ids.user,
        display_label: "Leila Hartmann",
        contextual_roles: [
          { role_type: "candidate", status: "active", confidence: "confirmed" },
        ],
      },
      evidence: [
        {
          fragment_id: ids.evidence,
          text: "Synthetic reviewed evidence.",
          fragment_kind: "message",
          fragment_status: "active",
          observed_at: "2026-08-26T00:00:00.000Z",
          source_timezone: "Asia/Shanghai",
          source_display_name: "Synthetic signal",
          input_channel: "ios_share",
          source_processing_state: "ready",
          attributed_actor: "candidate",
          attribution_status: "confirmed",
          review_status: "reviewed",
          parser: { name: "fixture", version: "1" },
        },
      ],
    },
    items: [
      {
        id: ids.evidence,
        item_key: "milestone",
        change_kind: "set_milestone",
        target: { entity_type: "pursuit", entity_id: ids.pursuit, field: "milestone" },
        before_value: "Shortlist review",
        proposed_value: "Final interview",
        basis_kind: "evidence_supported",
        attributed_by_user_id: null,
        epistemic_status: "inference",
        evidence_refs: [ids.evidence],
        evidence_state: {
          availability: "available",
          reference_count: 1,
          available_reference_count: 1,
          unavailable_reference_count: 0,
        },
        reason: "The reviewed evidence names a final conversation.",
        effect_summary: "Would update only the Pursuit milestone.",
        decision: {
          status: "pending",
          decided_value: null,
          decided_by_user_id: null,
          reason: null,
          decided_at: null,
        },
      },
    ],
    created_at: "2026-08-26T00:00:00.000Z",
    updated_at: "2026-08-26T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildPursuitTodayProjection", () => {
  it("leads with review and preserves an owned action on the same consolidated item", () => {
    const source = pursuit({
      actions: [
        {
          id: ids.action,
          pursuit_id: ids.pursuit,
          gap_id: null,
          title: "Prepare the final interview question",
          owner_user_id: ids.user,
          owner_display_name: "Alpha Recruiter",
          status: "in_progress",
          due_at: "2026-08-26T08:00:00.000Z",
          outcome_summary: null,
          completed_at: null,
          external_effects: [],
          revision: 1,
        },
      ],
    });

    const result = buildPursuitTodayProjection(
      ids.workspace,
      [source],
      [proposal()],
      Date.parse("2026-08-26T10:00:00.000Z"),
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      attentionKind: "review",
      proposalId: ids.proposal,
      personLabel: "Leila Hartmann",
      action: { id: ids.action, owner: "Alpha Recruiter" },
      agentContext: { captureId: ids.capture, evidenceRefs: [ids.evidence] },
    });
  });

  it("orders review, overdue action, due action, and gap without an arbitrary cap", () => {
    const pursuits = Array.from({ length: 8 }, (_, index) =>
      pursuit({
        id: `10000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`,
        title: `Pursuit ${index}`,
        gaps: [
          {
            id: `20000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`,
            pursuit_id: `10000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`,
            title: `Gap ${index}`,
            status: "open",
            basis: {
              kind: "user_authored",
              summary: "Recruiter-authored gap.",
              evidence_refs: [],
              attributed_by_user_id: ids.user,
              evidence_state: {
                availability: "not_required",
                reference_count: 0,
                available_reference_count: 0,
                unavailable_reference_count: 0,
              },
            },
            close_condition: "Record one observed answer.",
            revision: 1,
          },
        ],
      }),
    );

    const result = buildPursuitTodayProjection(ids.workspace, pursuits, []);

    expect(result.items).toHaveLength(8);
    expect(new Set(result.items.map((item) => item.pursuitId))).toHaveLength(8);
  });

  it("bounds the rendered projection without changing canonical attention totals", () => {
    const pursuits = Array.from({ length: 8 }, (_, index) =>
      pursuit({
        id: `10000000-0000-4000-8000-${String(index + 200).padStart(12, "0")}`,
        title: `Bounded Pursuit ${index}`,
        gaps: [
          {
            id: `20000000-0000-4000-8000-${String(index + 200).padStart(12, "0")}`,
            pursuit_id: `10000000-0000-4000-8000-${String(index + 200).padStart(12, "0")}`,
            title: `Bounded Gap ${index}`,
            status: "open",
            basis: {
              kind: "user_authored",
              summary: "Recruiter-authored gap.",
              evidence_refs: [],
              attributed_by_user_id: ids.user,
              evidence_state: {
                availability: "not_required",
                reference_count: 0,
                available_reference_count: 0,
                unavailable_reference_count: 0,
              },
            },
            close_condition: "Record one observed answer.",
            revision: 1,
          },
        ],
      }),
    );
    const full = buildPursuitTodayProjection(ids.workspace, pursuits, []);

    const bounded = limitPursuitTodayProjection(full, 3);

    expect(bounded.items).toHaveLength(3);
    expect(bounded.attentionCount).toBe(8);
    expect(bounded.totalPursuits).toBe(8);
    expect(bounded.items.map((item) => item.pursuitId)).toEqual(
      full.items.slice(0, 3).map((item) => item.pursuitId),
    );
  });

  it("renders unavailable evidence honestly and disables new Agent context", () => {
    const result = buildPursuitTodayProjection(ids.workspace, [pursuit()], [
      proposal({
        evidence_state: {
          availability: "unavailable",
          reference_count: 1,
          available_reference_count: 0,
          unavailable_reference_count: 1,
        },
      }),
    ]);

    expect(result.items[0]?.evidenceState).toBe("unavailable");
    expect(result.items[0]?.agentContext).toBeNull();
  });

  it("counts active Pursuits with no governed attention as explicit no-action", () => {
    const result = buildPursuitTodayProjection(ids.workspace, [pursuit()], []);

    expect(result.items).toEqual([]);
    expect(result.noActionCount).toBe(1);
    expect(result.totalPursuits).toBe(1);
  });

  it("does not turn completed work or closed gaps into Today attention", () => {
    const source = pursuit({
      actions: [
        {
          id: ids.action,
          pursuit_id: ids.pursuit,
          gap_id: null,
          title: "Already observed",
          owner_user_id: ids.user,
          owner_display_name: "Alpha Recruiter",
          status: "completed",
          due_at: null,
          outcome_summary: "The outcome was recorded.",
          completed_at: "2026-08-26T00:00:00.000Z",
          external_effects: [],
          revision: 2,
        },
      ],
    });

    const result = buildPursuitTodayProjection(ids.workspace, [source], []);

    expect(result.items).toEqual([]);
    expect(result.noActionCount).toBe(1);
  });
});
