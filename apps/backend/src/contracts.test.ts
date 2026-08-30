import {
  AgentRunResponseSchema,
  AgentTaskResponseSchema,
  CreatePursuitAgentTaskRequestSchema,
  CreatePursuitAgentRunRequestSchema,
  CreatePursuitRequestSchema,
  CreateCaptureRequestSchema,
  PursuitMutationResponseSchema,
  PursuitProposalReviewResponseSchema,
  ReviewPursuitProposalRequestSchema,
  RevisePursuitRequestSchema,
  StagePursuitProposalRequestSchema,
  SimulatedEffectPreviewSchema,
} from "@talent-signal/contracts";
import { FormatRegistry } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  if (!FormatRegistry.Has("uuid")) {
    FormatRegistry.Set("uuid", (value) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      ),
    );
  }
  if (!FormatRegistry.Has("date-time")) {
    FormatRegistry.Set("date-time", (value) =>
      Number.isFinite(Date.parse(value)),
    );
  }
});

describe("shared HTTP contract", () => {
  it("keeps governed Task authority bounded and projects only non-canonical briefing output", () => {
    const request = {
      idempotency_key: "task-1",
      client_event_id: "11111111-1111-4111-8111-111111111111",
      expected_revision: 4,
      task_kind: "pre_call_briefing",
      capture_id: "22222222-2222-4222-8222-222222222222",
      objective: "Prepare one grounded pre-call briefing.",
      evidence_refs: ["33333333-3333-4333-8333-333333333333"],
    };
    expect(Value.Check(CreatePursuitAgentTaskRequestSchema, request)).toBe(true);
    expect(
      Value.Check(CreatePursuitAgentTaskRequestSchema, {
        ...request,
        permission_ceiling: ["send_message"],
      }),
    ).toBe(false);

    const hash = "a".repeat(64);
    const response = {
      contract_version: "2026-08-24.10",
      task: {
        id: "44444444-4444-4444-8444-444444444444",
        workspace_id: "55555555-5555-4555-8555-555555555555",
        pursuit_id: "66666666-6666-4666-8666-666666666666",
        requested_by_user_id: "77777777-7777-4777-8777-777777777777",
        kind: "pre_call_briefing",
        objective: request.objective,
        task_revision: 2,
        status: "no_action",
        permission_ceiling: [
          "read_pursuit",
          "read_evidence",
          "create_briefing_artifact",
          "stage_pursuit_proposal",
          "record_no_action",
        ],
        semantic_snapshot: {
          pursuit_revision: 4,
          evidence_manifest_digest: hash,
          agent_definition_digest: hash,
          tool_schema_digest: hash,
          policy_digest: hash,
          model_digest: hash,
          created_at: "2026-08-30T00:00:00.000Z",
        },
        latest_run: {
          id: "88888888-8888-4888-8888-888888888888",
          attempt: 1,
          status: "completed",
          agent_run_status: "no_action",
          reason_code: "NO_ACTION_RECORDED",
          proposal_id: null,
          no_action_id: "99999999-9999-4999-8999-999999999999",
        },
        artifact: {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          task_id: "44444444-4444-4444-8444-444444444444",
          run_id: "88888888-8888-4888-8888-888888888888",
          type: "pursuit_briefing",
          authority: "non_canonical",
          status: "current",
          title: "Briefing · VP Engineering",
          summary: "No new canonical change is supported.",
          what_changed: [],
          what_matters_now: {
            dependency: "No unresolved dependency is supported.",
            reason: "Wait for newly reviewed evidence.",
            authority: "agent_interpretation",
            evidence_refs: [],
          },
          next_move: {
            kind: "no_action",
            label: "No action now",
            reason: "Wait for a material change.",
          },
          limitations: ["This artifact is non-canonical."],
          evidence_manifest_digest: hash,
          observed_at: "2026-08-30T00:00:01.000Z",
          expires_at: "2026-08-31T00:00:01.000Z",
        },
        clarification: null,
        decision_bundle: null,
        latest_sequence: 6,
        latest_cursor: "41",
        continue_allowed: false,
        external_effects: [],
        created_at: "2026-08-30T00:00:00.000Z",
        updated_at: "2026-08-30T00:00:01.000Z",
        completed_at: "2026-08-30T00:00:01.000Z",
      },
    };
    expect(Value.Check(AgentTaskResponseSchema, response)).toBe(true);
    expect(
      Value.Check(AgentTaskResponseSchema, {
        ...response,
        task: { ...response.task, external_effects: ["send_message"] },
      }),
    ).toBe(false);
  });

  it("keeps Agent provider, tools, budgets, and effects outside caller authority", () => {
    const request = {
      idempotency_key: "agent-run-1",
      capture_id: "11111111-1111-4111-8111-111111111111",
      base_revision: 4,
      objective: "Check whether reviewed evidence supports one Proposal.",
      evidence_refs: ["22222222-2222-4222-8222-222222222222"],
    };
    expect(Value.Check(CreatePursuitAgentRunRequestSchema, request)).toBe(true);
    expect(
      Value.Check(CreatePursuitAgentRunRequestSchema, {
        ...request,
        provider: "claude",
        tools: ["Bash"],
        max_budget_usd: 100,
      }),
    ).toBe(false);

    const hash = "a".repeat(64);
    const usage = {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      estimated_usd: 0,
      turns: 1,
      tool_calls: 2,
      duration_ms: 12,
    };
    const fingerprints = {
      definition: hash,
      system_prompt: hash,
      tool_manifest: hash,
      sdk: hash,
      model: hash,
      policy: hash,
      contract: hash,
      context: hash,
    };
    const terminalReceipt = {
      run_id: "33333333-3333-4333-8333-333333333333",
      status: "no_action",
      reason_code: "NO_ACTION_RECORDED",
      proposal_id: null,
      no_action_id: "44444444-4444-4444-8444-444444444444",
      candidate_fingerprint: hash,
      external_effects: [],
      fingerprints,
      usage,
      permission_denials: [],
      provider_session_id: null,
      completed_at: "2026-08-24T00:00:01.000Z",
    };
    const response = {
      contract_version: "2026-08-24.10",
      run: {
        id: "33333333-3333-4333-8333-333333333333",
        workspace_id: "55555555-5555-4555-8555-555555555555",
        user_id: "66666666-6666-4666-8666-666666666666",
        pursuit_id: "77777777-7777-4777-8777-777777777777",
        capture_id: request.capture_id,
        base_revision: 4,
        objective: request.objective,
        definition: {
          name: "pursuit-momentum",
          version: "1.0.0",
          policy_version: "agent-policy.v1",
          contract_version: "2026-08-24.10",
          tool_manifest: [
            "read_pursuit",
            "read_evidence",
            "stage_pursuit_proposal",
          ],
        },
        provider: {
          id: "deterministic-safe",
          model: "talent-signal-no-action-v1",
          sdk_version: "deterministic-provider.v1",
        },
        budget: {
          max_turns: 6,
          max_tool_calls: 12,
          max_duration_ms: 60_000,
          max_task_tokens: 32_000,
          max_estimated_usd: 1,
        },
        context_manifest: {
          pursuit_revision: 4,
          evidence: [
            {
              fragment_id: request.evidence_refs[0],
              content_hash: hash,
              inclusion_reason: "Synthetic contract proof",
              authorization_scope: "reviewed_selected_text",
            },
          ],
        },
        fingerprints,
        status: "no_action",
        usage,
        terminal_receipt: terminalReceipt,
        external_effects: [],
        telemetry: null,
        created_at: "2026-08-24T00:00:00.000Z",
        started_at: "2026-08-24T00:00:00.000Z",
        completed_at: "2026-08-24T00:00:01.000Z",
      },
    };
    expect(Value.Check(AgentRunResponseSchema, response)).toBe(true);
    expect(
      Value.Check(AgentRunResponseSchema, {
        ...response,
        run: { ...response.run, external_effects: ["send_message"] },
      }),
    ).toBe(false);
  });

  it("requires an explicit identity state for intentional capture", () => {
    const candidate = {
      idempotency_key: "capture-1",
      source: {
        kind: "fixture",
        captured_at: "2026-08-05T00:00:00.000Z",
        source_timezone: "Asia/Singapore",
        purpose: "Synthetic evaluation",
      },
      messages: [
        {
          source_message_id: "m1",
          sequence: 0,
          speaker: "candidate",
          text: "Tuesday afternoon works.",
        },
      ],
    };
    expect(Value.Check(CreateCaptureRequestSchema, candidate)).toBe(false);
  });

  it("exposes only the labeled local deterministic effect adapter", () => {
    const preview = {
      simulated: true,
      capability: "local.simulated_attention.create",
      adapter: "local_deterministic",
      target: {
        destination_key: "fixture:queue",
        label: "Local simulated queue",
      },
      change: {
        kind: "create_attention",
        title: "Prepare one question",
      },
      expected_destination_version: 0,
      simulation_behavior: "success",
    };
    expect(Value.Check(SimulatedEffectPreviewSchema, preview)).toBe(true);
    expect(
      Value.Check(SimulatedEffectPreviewSchema, {
        ...preview,
        capability: "calendar.create",
        simulated: false,
      }),
    ).toBe(false);
  });

  it.each(["recruiting", "sales"] as const)(
    "uses one evidence-first Pursuit contract for the %s template",
    (type) => {
      const request = {
        idempotency_key: `pursuit-${type}`,
        type,
        title:
          type === "recruiting"
            ? "VP Engineering · Acme"
            : "Acme expansion",
        target_outcome:
          type === "recruiting" ? "accepted_offer" : "signed_expansion",
        target_date: "2026-10-15",
        status: "active",
        milestone:
          type === "recruiting" ? "interviewing" : "decision_review",
        criteria: [
          {
            key: "outcome-evidence",
            label: "Outcome evidence",
            requirement: "The agreed target outcome has direct evidence.",
          },
        ],
        gaps: [
          {
            title: "Decision evidence is incomplete",
            basis: {
              kind: "user_authored",
              summary: "The recruiter recorded this as an open question.",
              evidence_refs: [],
            },
            close_condition: "The accountable owner records a direct answer.",
          },
        ],
        actions: [
          {
            title: "Prepare the unresolved question",
            owner_user_id: "22222222-2222-4222-8222-222222222222",
            status: "drafted",
          },
        ],
      };

      expect(Value.Check(CreatePursuitRequestSchema, request)).toBe(true);
      expect(
        Value.Check(CreatePursuitRequestSchema, {
          ...request,
          candidate_score: 92,
        }),
      ).toBe(false);
    },
  );

  it("requires revision and reason for a canonical Pursuit update", () => {
    const revision = {
      idempotency_key: "pursuit-revision-2",
      expected_revision: 1,
      reason: "The recruiter confirmed the next milestone.",
      milestone: "offer_review",
    };
    expect(Value.Check(RevisePursuitRequestSchema, revision)).toBe(true);
    expect(
      Value.Check(RevisePursuitRequestSchema, {
        ...revision,
        expected_revision: 0,
      }),
    ).toBe(false);
  });

  it("models an applied Pursuit write as a structured readback receipt", () => {
    const response = {
      contract_version: "2026-08-24.10",
      pursuit: {
        id: "11111111-1111-4111-8111-111111111111",
        workspace_id: "22222222-2222-4222-8222-222222222222",
        type: "recruiting",
        title: "VP Engineering · Acme",
        target_outcome: "accepted_offer",
        target_date: "2026-10-15",
        status: "active",
        milestone: "interviewing",
        milestone_authority: {
          kind: "user_authored",
          evidence_refs: [],
          evidence_state: {
            availability: "not_required",
            reference_count: 0,
            available_reference_count: 0,
            unavailable_reference_count: 0,
          },
          confirmed_by_user_id: "55555555-5555-4555-8555-555555555555",
          confirmed_at: "2026-08-24T00:00:00.000Z",
          proposal_id: null,
          receipt_id: null,
        },
        revision: 1,
        roles: [],
        criteria: [],
        gaps: [],
        actions: [],
        created_at: "2026-08-24T00:00:00.000Z",
        updated_at: "2026-08-24T00:00:00.000Z",
      },
      receipt: {
        id: "33333333-3333-4333-8333-333333333333",
        operation_id: "44444444-4444-4444-8444-444444444444",
        workspace_id: "22222222-2222-4222-8222-222222222222",
        actor_user_id: "55555555-5555-4555-8555-555555555555",
        operation_kind: "create_pursuit",
        status: "applied",
        proposal_id: null,
        outcome: "canonical_applied",
        entity_ref: {
          type: "pursuit",
          id: "11111111-1111-4111-8111-111111111111",
          before_revision: 0,
          after_revision: 1,
        },
        changed_fields: ["target_outcome", "milestone"],
        item_decisions: [],
        external_effects: [],
        summary: "Pursuit created as canonical workspace state.",
        occurred_at: "2026-08-24T00:00:00.000Z",
      },
    };

    expect(Value.Check(PursuitMutationResponseSchema, response)).toBe(true);
    expect(
      Value.Check(PursuitMutationResponseSchema, {
        ...response,
        receipt: { ...response.receipt, status: "unknown" },
      }),
    ).toBe(false);
  });

  it("requires bounded item-level Proposal staging and review decisions", () => {
    const staged = {
      idempotency_key: "stage-proposal-1",
      capture_id: "11111111-1111-4111-8111-111111111111",
      base_revision: 2,
      summary: "Candidate timing evidence may change the current milestone.",
      producer: {
        kind: "agent",
        name: "talent-signal-proposal-worker",
        version: "1.0.0",
        run_id: "synthetic-run-1",
      },
      items: [
        {
          item_key: "milestone",
          basis_kind: "evidence_supported",
          epistemic_status: "inference",
          evidence_refs: ["22222222-2222-4222-8222-222222222222"],
          reason: "The reviewed message describes the next interview step.",
          effect_summary: "Would update only this Pursuit milestone.",
          change: {
            kind: "set_milestone",
            proposed_value: "final_interview",
          },
        },
      ],
    };
    expect(Value.Check(StagePursuitProposalRequestSchema, staged)).toBe(true);
    expect(
      Value.Check(StagePursuitProposalRequestSchema, {
        ...staged,
        items: [],
      }),
    ).toBe(false);

    const review = {
      operation_id: "33333333-3333-4333-8333-333333333333",
      idempotency_key: "review-proposal-1",
      base_revision: 2,
      reason: "Recruiter compared each item with the visible evidence.",
      decisions: [
        {
          item_id: "44444444-4444-4444-8444-444444444444",
          decision: "edit",
          edited_value: "final_conversation",
        },
      ],
    };
    expect(Value.Check(ReviewPursuitProposalRequestSchema, review)).toBe(true);
  });

  it("keeps Proposal review receipts item-level and external-effect free", () => {
    const response = {
      contract_version: "2026-08-24.10",
      proposal: {
        id: "11111111-1111-4111-8111-111111111111",
        workspace_id: "22222222-2222-4222-8222-222222222222",
        pursuit_id: "33333333-3333-4333-8333-333333333333",
        capture_id: "44444444-4444-4444-8444-444444444444",
        base_revision: 2,
        summary: "Synthetic review",
        producer: {
          kind: "agent",
          name: "proposal-worker",
          version: "1.0.0",
          run_id: "run-1",
        },
        status: "applied",
        revision: 2,
        evidence_state: {
          availability: "available",
          reference_count: 1,
          available_reference_count: 1,
          unavailable_reference_count: 0,
        },
        review_context: {
          pursuit: {
            id: "33333333-3333-4333-8333-333333333333",
            title: "VP Engineering · Acme",
          },
          capture: {
            id: "44444444-4444-4444-8444-444444444444",
            purpose: "Synthetic contract proof",
          },
          subject: {
            person_id: "88888888-8888-4888-8888-888888888888",
            display_label: "Avery Morgan",
            contextual_roles: [
              {
                role_type: "candidate",
                status: "active",
                confidence: "confirmed",
              },
            ],
          },
          evidence: [
            {
              fragment_id: "99999999-9999-4999-8999-999999999999",
              text: "The final conversation works next Tuesday.",
              fragment_kind: "message",
              fragment_status: "active",
              observed_at: "2026-08-24T00:00:00.000Z",
              source_timezone: "Asia/Shanghai",
              source_display_name: "Synthetic candidate message",
              input_channel: "ios_share",
              source_processing_state: "ready",
              attributed_actor: "candidate",
              attribution_status: "confirmed",
              review_status: "reviewed",
              parser: { name: "synthetic", version: "1.0.0" },
            },
          ],
        },
        items: [],
        created_at: "2026-08-24T00:00:00.000Z",
        updated_at: "2026-08-24T00:01:00.000Z",
      },
      pursuit: {
        id: "33333333-3333-4333-8333-333333333333",
        workspace_id: "22222222-2222-4222-8222-222222222222",
        type: "recruiting",
        title: "VP Engineering · Acme",
        target_outcome: "accepted_offer",
        target_date: "2026-10-15",
        status: "active",
        milestone: "final_conversation",
        milestone_authority: {
          kind: "evidence_supported",
          evidence_refs: ["99999999-9999-4999-8999-999999999999"],
          evidence_state: {
            availability: "available",
            reference_count: 1,
            available_reference_count: 1,
            unavailable_reference_count: 0,
          },
          confirmed_by_user_id: "77777777-7777-4777-8777-777777777777",
          confirmed_at: "2026-08-24T00:01:00.000Z",
          proposal_id: "11111111-1111-4111-8111-111111111111",
          receipt_id: "55555555-5555-4555-8555-555555555555",
        },
        revision: 3,
        roles: [],
        criteria: [],
        gaps: [],
        actions: [],
        created_at: "2026-08-24T00:00:00.000Z",
        updated_at: "2026-08-24T00:01:00.000Z",
      },
      receipt: {
        id: "55555555-5555-4555-8555-555555555555",
        operation_id: "66666666-6666-4666-8666-666666666666",
        workspace_id: "22222222-2222-4222-8222-222222222222",
        actor_user_id: "77777777-7777-4777-8777-777777777777",
        operation_kind: "review_pursuit_proposal",
        status: "applied",
        proposal_id: "11111111-1111-4111-8111-111111111111",
        outcome: "canonical_applied",
        entity_ref: {
          type: "pursuit",
          id: "33333333-3333-4333-8333-333333333333",
          before_revision: 2,
          after_revision: 3,
        },
        changed_fields: ["milestone"],
        item_decisions: [],
        external_effects: [],
        summary: "One reviewed item applied.",
        occurred_at: "2026-08-24T00:01:00.000Z",
      },
    };
    expect(Value.Check(PursuitProposalReviewResponseSchema, response)).toBe(true);
    expect(
      Value.Check(PursuitProposalReviewResponseSchema, {
        ...response,
        receipt: { ...response.receipt, external_effects: ["send_message"] },
      }),
    ).toBe(false);
  });
});
