import {
  CaptureResponseSchema,
  ChatTaskResponseSchema,
  ChatMediaAssetSchema,
  CreateChatMediaRequestSchema,
  CONTRACT_VERSION,
  CreateCaptureRequestSchema,
  IdentityResolutionCaseSchema,
  KnowledgeSnapshotSchema,
  MultichannelCaptureIntentSchema,
  PersonDirectoryResponseSchema,
  PersonMergeReversalPreviewSchema,
  RelationshipAgentHistorySchema,
  ResourceCaptureRequestSchema,
  ResourceCaptureResponseSchema,
  UnscopedChatTaskRequestSchema,
  UnscopedChatTaskResponseSchema,
} from "@talent-signal/contracts";
import { FormatRegistry } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { beforeAll, describe, expect, it } from "vitest";

const personId = "11111111-1111-4111-8111-111111111111";
const contextId = "22222222-2222-4222-8222-222222222222";
const accountId = "33333333-3333-4333-8333-333333333333";
const captureId = "44444444-4444-4444-8444-444444444444";
const snapshotId = "55555555-5555-4555-8555-555555555555";
const blockId = "66666666-6666-4666-8666-666666666666";
const evidenceId = "77777777-7777-4777-8777-777777777777";
const taskId = "88888888-8888-4888-8888-888888888888";
const manifestId = "99999999-9999-4999-8999-999999999999";

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
  if (!FormatRegistry.Has("uri")) {
    FormatRegistry.Set("uri", (value) => {
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    });
  }
});

function source(
  id: string,
  kind: "personal_note" | "resume" | "public_url",
) {
  return {
    client_resource_id: id,
    kind,
    display_name:
      kind === "resume"
        ? "candidate-resume.pdf"
        : kind === "public_url"
          ? "Candidate public profile"
          : "Recruiter note",
    media_type:
      kind === "resume"
        ? "application/pdf"
        : kind === "public_url"
          ? "text/uri-list"
          : "text/plain",
    observed_at: "2026-08-06T10:00:00.000Z",
    source_timezone: "Asia/Singapore",
    retention: {
      requested_mode: "full_source",
      source_scope: "full_reviewed_source",
    },
  } as const;
}

describe("multichannel relationship-resource contracts", () => {
  it("reads a relationship resource through the governed capture contract", () => {
    expect(
      Value.Check(CaptureResponseSchema, {
        id: captureId,
        account_id: accountId,
        fixture_case_id: null,
        status: "active",
        version: 2,
        identity_status: "bound",
        subject_id: personId,
        assignment_id: contextId,
        source: {
          kind: "personal_note",
          captured_at: "2026-08-06T10:00:00.000Z",
          source_timezone: "Asia/Singapore",
          purpose:
            "Preserve a recruiter-authored note in the selected relationship context",
          retention: {
            policy_version: "source-retention.v2",
            requested_mode: "ephemeral",
            effective_mode: "ephemeral",
            source_scope: "reviewed_selected_text",
            source_access_state: "purged",
            source_access_reason: "review_completed",
            requested_retention_until: null,
            retention_until: null,
            review_completed_at: "2026-08-06T10:01:00.000Z",
            source_purged_at: "2026-08-06T10:01:00.000Z",
          },
        },
        messages: [],
        created_at: "2026-08-06T10:01:00.000Z",
      }),
    ).toBe(true);
  });

  it("binds an imported source to an explicitly selected existing person", () => {
    const request = {
      idempotency_key: "capture-existing-person-1",
      source: {
        kind: "screenshot_metadata",
        captured_at: "2026-08-06T10:00:00.000Z",
        source_timezone: "Asia/Singapore",
        purpose: "Review candidate conversation evidence",
        source_locator: "web-screenshot:request-1",
        retention: {
          requested_mode: "evidence_crop",
          source_scope: "reviewed_extracted_text",
        },
      },
      identity: {
        status: "bound_existing",
        subject_id: personId,
        assignment_id: contextId,
        assignment_ref: `web-assignment:${personId}:vp-product`,
        assignment_label: "VP Product · Northstar search",
        binding_basis:
          "The recruiter selected this existing person before committing the source.",
      },
      messages: [
        {
          source_message_id: "message-1",
          sequence: 0,
          speaker: "candidate",
          text: "I can speak on Thursday.",
        },
      ],
    };

    expect(Value.Check(CreateCaptureRequestSchema, request)).toBe(true);
  });

  it("returns a compact person directory for explicit identity selection", () => {
    const response = {
      contract_version: CONTRACT_VERSION,
      people: [
        {
          id: personId,
          display_label: "周屿",
          context_count: 2,
          capture_count: 4,
          confirmed_identity_count: 1,
          last_activity_at: "2026-08-06T10:00:00.000Z",
          profile: null,
          avatar: null,
          contexts: [
            {
              id: contextId,
              display_label: "VP Product · Northstar search",
              last_activity_at: "2026-08-06T10:00:00.000Z",
            },
          ],
          identity_matches: [{ kind: "name" }],
        },
      ],
    };

    expect(Value.Check(PersonDirectoryResponseSchema, response)).toBe(true);
  });

  it("represents an expired identity clue as review-only history", () => {
    const response = {
      contract_version: CONTRACT_VERSION,
      people: [
        {
          id: personId,
          display_label: "周屿",
          context_count: 1,
          capture_count: 3,
          confirmed_identity_count: 0,
          last_activity_at: "2026-08-07T10:00:00.000Z",
          profile: null,
          avatar: null,
          contexts: [
            {
              id: contextId,
              display_label: "VP Product · Northstar search",
              last_activity_at: "2026-08-07T10:00:00.000Z",
            },
          ],
          identity_matches: [
            {
              kind: "expired_handle",
              handle_type: "email",
              display_hint: "z***@example.com",
              source_resource_id: captureId,
              expired_at: "2026-08-07T09:00:00.000Z",
            },
          ],
        },
      ],
    };

    expect(Value.Check(PersonDirectoryResponseSchema, response)).toBe(true);
  });

  it("describes a durable person-merge reversal review without executing it", () => {
    expect(
      Value.Check(PersonMergeReversalPreviewSchema, {
        contract_version: CONTRACT_VERSION,
        operation_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        status: "applied",
        source_person: {
          id: personId,
          display_label: "Duplicate contact",
          status: "merged",
        },
        target_person: {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          display_label: "Retained contact",
          status: "active",
        },
        contexts_to_restore: [
          {
            id: contextId,
            display_label: "VP Product search",
            active_capture_count: 3,
            active_fact_count: 1,
          },
        ],
        original_reason:
          "The recruiter confirmed both records describe one person.",
        decided_at: "2026-08-07T10:00:00.000Z",
        reversed_at: null,
        blockers: [],
        reversal_available: true,
      }),
    ).toBe(true);
  });

  it("returns a compact relationship-scoped Agent operation projection", () => {
    const response = {
      contract_version: CONTRACT_VERSION,
      person_id: personId,
      relationship_context_id: contextId,
      operations: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          sequence: 42,
          kind: "identity_correction",
          status: "retracted",
          title: "Source moved out of this relationship",
          detail:
            "Recruiter basis: the verified source account belongs to another person.",
          occurred_at: "2026-08-06T10:00:00.000Z",
          actor_kind: "recruiter",
          person_id: personId,
          relationship_context_id: contextId,
          references: {
            capture_id: captureId,
            source_resource_id: null,
            identity_case_id: null,
            knowledge_snapshot_id: null,
            person_merge_operation_id: null,
          },
          provenance: {
            event_type: "identity.corrected",
            entity_type: "capture",
            entity_id: captureId,
          },
        },
      ],
      external_effect_follow_ups: [],
      next_cursor: 42,
    };

    expect(Value.Check(RelationshipAgentHistorySchema, response)).toBe(true);
  });

  it("converges Chat, resume, and URL inputs on one confirmed person and context", () => {
    const intent = {
      contract_version: CONTRACT_VERSION,
      idempotency_key: "multichannel-capture-1",
      channel: "chat",
      purpose: "Prepare the next candidate conversation",
      captured_at: "2026-08-06T10:00:00.000Z",
      source_timezone: "Asia/Singapore",
      person_scope: {
        status: "confirmed",
        person_id: personId,
        relationship_context: {
          status: "existing",
          relationship_context_id: contextId,
        },
        binding_basis:
          "The recruiter selected an existing person and relationship context.",
      },
      resources: [
        source("note-1", "personal_note"),
        source("resume-1", "resume"),
        source("url-1", "public_url"),
      ],
    };

    expect(
      [...Value.Errors(MultichannelCaptureIntentSchema, intent)].map(
        (error) => ({
          message: error.message,
          path: error.path,
          value: error.value,
        }),
      ),
    ).toEqual([]);
  });

  it("accepts one atomic reviewed recruiter note for a newly created person", () => {
    const request = {
      contract_version: CONTRACT_VERSION,
      idempotency_key: "resource-note-new-person-1",
      channel: "chat",
      purpose: "Preserve recruiter-authored relationship context",
      captured_at: "2026-08-06T10:00:00.000Z",
      source_timezone: "Asia/Singapore",
      person_scope: {
        status: "new_person",
        display_label: "周屿",
        relationship_context: {
          status: "proposed",
          label: "VP Product · Northstar search",
          purpose: "Track this search relationship separately",
        },
        binding_basis:
          "The recruiter explicitly chose to create a new person.",
      },
      resource: {
        client_resource_id: "note-new-1",
        kind: "personal_note",
        display_name: "Call preparation note",
        media_type: "text/plain",
        observed_at: "2026-08-06T10:00:00.000Z",
        source_timezone: "Asia/Singapore",
        retention: {
          requested_mode: "ephemeral",
          source_scope: "reviewed_selected_text",
        },
      },
      fragments: [
        {
          client_resource_id: "note-new-1",
          kind: "note_revision",
          sequence: 0,
          text: "Ask about the scope of the new product mandate.",
          locator: {
            kind: "note_revision",
            revision: 1,
          },
          attribution: {
            actor_kind: "recruiter",
            status: "confirmed",
          },
          review_status: "reviewed",
          parser: {
            name: "direct-note-input",
            version: "1.0.0",
          },
        },
      ],
    };

    expect(Value.Check(ResourceCaptureRequestSchema, request)).toBe(true);
  });

  it("keeps parsed resume text proposed and page-addressable", () => {
    const request = {
      contract_version: CONTRACT_VERSION,
      idempotency_key: "resource-resume-existing-1",
      channel: "web_upload",
      purpose: "Attach a resume to the selected person",
      captured_at: "2026-08-06T10:00:00.000Z",
      source_timezone: "Asia/Singapore",
      person_scope: {
        status: "confirmed",
        person_id: personId,
        relationship_context: {
          status: "existing",
          relationship_context_id: contextId,
        },
        binding_basis:
          "The recruiter selected the person and search context.",
      },
      resource: {
        client_resource_id: "resume-existing-1",
        kind: "resume",
        display_name: "candidate-resume.pdf",
        media_type: "application/pdf",
        observed_at: "2026-08-06T10:00:00.000Z",
        source_timezone: "Asia/Singapore",
        retention: {
          requested_mode: "ephemeral",
          source_scope: "reviewed_extracted_text",
        },
      },
      fragments: [
        {
          client_resource_id: "resume-existing-1",
          kind: "page_text",
          sequence: 0,
          text: "VP Product, Example Co.",
          locator: {
            kind: "page_text",
            page: 1,
            paragraph: 1,
          },
          attribution: {
            actor_kind: "document_author",
            status: "proposed",
          },
          review_status: "proposed",
          parser: {
            name: "pdf-parse",
            version: "2",
          },
        },
      ],
    };

    expect(Value.Check(ResourceCaptureRequestSchema, request)).toBe(true);
  });

  it("returns identity review and duplicate lineage without silently merging", () => {
    const response = {
      contract_version: CONTRACT_VERSION,
      capture_id: captureId,
      identity: {
        status: "needs_review",
        person_id: null,
        relationship_context_id: null,
        resolution_case_id:
          "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        candidate_person_ids: [personId],
      },
      resource: {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        client_resource_id: "resume-existing-1",
        kind: "resume",
        processing_state: "needs_identity_review",
        duplicate_of_resource_id:
          "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        fragment_count: 2,
      },
      created_at: "2026-08-06T10:00:00.000Z",
    };

    expect(Value.Check(ResourceCaptureResponseSchema, response)).toBe(true);
  });

  it("keeps an unresolved identity review source-backed and resumable", () => {
    const identityCase = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      capture_id: captureId,
      status: "pending",
      version: 2,
      reason:
        "More than one account-scoped person matched. The recruiter saved the source without binding it.",
      display_name_hint: "Same Name",
      relationship_context: {
        status: "proposed",
        label: "VP Product search",
        purpose: "Recruiter-defined relationship context awaiting identity",
      },
      source: {
        resource_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        kind: "personal_note",
        display_name: "Recruiter source awaiting identity",
        observed_at: "2026-08-06T10:00:00.000Z",
        excerpt:
          "Recruiter-owned note that does not yet distinguish the two people.",
        fragment_count: 1,
      },
      candidates: [
        {
          person_id: personId,
          display_label: "Same Name",
          context_count: 1,
          capture_count: 2,
          relationship_contexts: [
            {
              id: contextId,
              display_label: "Founder network",
            },
          ],
          match_reasons: ["Name match only"],
        },
      ],
      latest_decision: {
        decision: "leave_unresolved",
        reason: "Need the recruiter to compare the source account.",
        decided_at: "2026-08-06T10:05:00.000Z",
      },
      resolved_person_id: null,
      resolved_relationship_context_id: null,
      created_at: "2026-08-06T10:00:00.000Z",
      updated_at: "2026-08-06T10:05:00.000Z",
    };

    expect(Value.Check(IdentityResolutionCaseSchema, identityCase)).toBe(
      true,
    );
  });

  it("does not treat a single heuristic candidate as resolved identity", () => {
    const intent = {
      contract_version: CONTRACT_VERSION,
      idempotency_key: "multichannel-capture-2",
      channel: "web_upload",
      purpose: "Review one resume",
      captured_at: "2026-08-06T10:00:00.000Z",
      source_timezone: "Asia/Singapore",
      person_scope: {
        status: "candidates",
        candidate_person_ids: [personId],
        reason: "Only the name matched.",
      },
      resources: [source("resume-2", "resume")],
    };

    expect(Value.Check(MultichannelCaptureIntentSchema, intent)).toBe(false);
  });

  it("represents one supported match as a proposal that still needs confirmation", () => {
    const intent = {
      contract_version: CONTRACT_VERSION,
      idempotency_key: "multichannel-capture-3",
      channel: "browser_extension",
      purpose: "Attach a public profile to an existing person",
      captured_at: "2026-08-06T10:00:00.000Z",
      source_timezone: "Asia/Singapore",
      person_scope: {
        status: "proposed",
        candidate_person_id: personId,
        match_reasons: [
          "The confirmed LinkedIn URL matches the captured public profile.",
        ],
        reason: "Exact handle match requires recruiter confirmation.",
      },
      resources: [source("url-2", "public_url")],
    };

    expect(Value.Check(MultichannelCaptureIntentSchema, intent)).toBe(true);
    expect(intent.person_scope.status).not.toBe("confirmed");
  });

  it("allows a recruiter-confirmed handle only on a governed contact record", () => {
    const request = {
      contract_version: CONTRACT_VERSION,
      idempotency_key: "confirmed-handle-contact-1",
      channel: "chat",
      purpose: "Preserve a recruiter-confirmed identity clue",
      captured_at: "2026-08-06T10:00:00.000Z",
      source_timezone: "Asia/Singapore",
      person_scope: {
        status: "confirmed",
        person_id: personId,
        relationship_context: {
          status: "existing",
          relationship_context_id: contextId,
        },
        binding_basis:
          "The recruiter selected the person and confirmed the handle.",
      },
      resource: {
        client_resource_id: "contact-1",
        kind: "contact_record",
        display_name: "Confirmed email identity clue",
        media_type: "text/plain",
        observed_at: "2026-08-06T10:00:00.000Z",
        source_timezone: "Asia/Singapore",
        retention: {
          requested_mode: "ephemeral",
          source_scope: "reviewed_selected_text",
        },
      },
      confirmed_identity_handles: [
        {
          type: "email",
          value: "zhou.yu@example.com",
          source_client_resource_id: "contact-1",
        },
      ],
      fragments: [
        {
          client_resource_id: "contact-1",
          kind: "contact_field",
          sequence: 0,
          text: "z•••@example.com",
          locator: {
            kind: "contact_field",
            field: "email",
            source_record_version: "agent-confirmed-clue-v1",
          },
          attribution: {
            actor_kind: "recruiter",
            status: "confirmed",
          },
          review_status: "reviewed",
          parser: {
            name: "direct-identity-clue-input",
            version: "1.0.0",
          },
        },
      ],
    };

    expect(Value.Check(ResourceCaptureRequestSchema, request)).toBe(
      true,
    );
  });

  it("carries a reviewed public profile only as an explicit contact proposal", () => {
    const contentHash = "a".repeat(64);
    const profileURL = "https://example.com/in/zhou-yu";
    const request = {
      contract_version: CONTRACT_VERSION,
      idempotency_key: "reviewed-public-profile-1",
      channel: "chat",
      purpose: "Preserve a recruiter-reviewed public profile",
      captured_at: "2026-08-06T10:00:00.000Z",
      source_timezone: "Asia/Singapore",
      person_scope: {
        status: "new_person",
        display_label: "周屿",
        relationship_context: {
          status: "proposed",
          label: "Candidate relationship",
          purpose: "Recruiter-defined relationship context",
        },
        binding_basis:
          "The recruiter reviewed the source and explicitly chose to create this person.",
      },
      resource: {
        client_resource_id: "public-profile-contact-1",
        kind: "contact_record",
        display_name: "Reviewed public profile",
        media_type: "text/plain",
        observed_at: "2026-08-06T10:00:00.000Z",
        source_timezone: "Asia/Singapore",
        content_hash: contentHash,
        source_locator: profileURL,
        retention: {
          requested_mode: "ephemeral",
          source_scope: "reviewed_selected_text",
        },
      },
      reviewed_public_profile: {
        result_id: "provider-result-1",
        provider_id: "tikhub",
        platform: "douyin",
        profile_url: profileURL,
        display_name: "周屿",
        handle: "zhou-yu",
        verified: true,
        match_basis: "Name and role matched the screenshot context.",
        content_hash: contentHash,
        retrieved_at: "2026-08-06T09:58:00.000Z",
        card_headline: "VP Product · Example Co.",
        use_avatar: false,
      },
      fragments: [
        {
          client_resource_id: "public-profile-contact-1",
          kind: "contact_field",
          sequence: 0,
          text: "Reviewed public profile before contact creation.",
          locator: {
            kind: "contact_field",
            field: "source_note",
            source_record_version: "1",
          },
          attribution: {
            actor_kind: "recruiter",
            status: "confirmed",
          },
          review_status: "reviewed",
          parser: {
            name: "ios-agent-public-profile-review",
            version: "1.0.0",
          },
        },
      ],
    };

    expect(Value.Check(ResourceCaptureRequestSchema, request)).toBe(true);
  });

  it("represents a compiled Wiki block as a source-dependent projection", () => {
    const snapshot = {
      id: snapshotId,
      account_id: accountId,
      person_id: personId,
      relationship_context_id: contextId,
      source_state_cursor: 42,
      compiler: {
        name: "talent-signal-wiki",
        version: "0.1.0",
        policy_version: "wiki-policy.v1",
      },
      status: "published",
      blocks: [
        {
          id: blockId,
          block_key: "current.dependency",
          type: "current_dependency",
          status: "confirmed",
          content: {
            headline: "The client must confirm the remote-work policy.",
            items: [],
          },
          valid_from: "2026-08-06T10:00:00.000Z",
          valid_until: null,
          freshness_until: "2026-08-13T10:00:00.000Z",
          sensitivity: "restricted",
          dependencies: [
            {
              type: "evidence_fragment",
              id: evidenceId,
              inclusion_reason: "Exact candidate statement supports the dependency.",
              authorization_scope: "candidate-search:vp-product",
            },
          ],
          semantic_hash: "a".repeat(64),
        },
      ],
      quality: {
        verdict: "gold",
        gates: {
          identity_binding: "pass",
          provenance: "pass",
          scope_authorization: "pass",
          temporal_integrity: "pass",
          prohibited_inference: "pass",
          deletion_lineage: "pass",
        },
        measures: {
          task_relevance: 98,
          compression: 97,
          conflict_visibility: 100,
          recruiter_reviewability: 98,
        },
        reasons: ["All material claims retain exact governed dependencies."],
      },
      compiled_at: "2026-08-06T10:00:03.000Z",
    };

    expect(
      [...Value.Errors(KnowledgeSnapshotSchema, snapshot)].map(
        (error) => ({
          message: error.message,
          path: error.path,
          value: error.value,
        }),
      ),
    ).toEqual([]);
  });

  it("binds a Chat answer to one task manifest and immutable Wiki snapshot", () => {
    const response = {
      contract_version: CONTRACT_VERSION,
      task_id: taskId,
      context_manifest_id: manifestId,
      knowledge_snapshot_id: snapshotId,
      disposition: "answer",
      blocks: [
        {
          id: blockId,
          kind: "person_brief",
          title: "Before the call",
          body: "Confirm the candidate's earliest realistic start date.",
          status: "confirmed",
          citation_dependency_ids: [evidenceId],
          requires_user_decision: false,
        },
      ],
      created_at: "2026-08-06T10:00:05.000Z",
    };

    expect(
      [...Value.Errors(ChatTaskResponseSchema, response)].map((error) => ({
        message: error.message,
        path: error.path,
        value: error.value,
      })),
    ).toEqual([]);
    expect(
      Value.Check(ChatTaskResponseSchema, {
        ...response,
        knowledge_snapshot_id: undefined,
      }),
    ).toBe(false);
  });

  it("keeps an unscoped Agent reply free of relationship context and effects", () => {
    expect(
      Value.Check(UnscopedChatTaskRequestSchema, {
        idempotency_key: "ios:unscoped-chat:fixture",
        objective: "你好",
      }),
    ).toBe(true);
    expect(
      Value.Check(UnscopedChatTaskResponseSchema, {
        contract_version: CONTRACT_VERSION,
        task_id: taskId,
        disposition: "answer",
        blocks: [
          {
            id: blockId,
            kind: "answer",
            title: "你好",
            body: "你好，我在。你想聊什么？",
            status: "informational",
            citation_dependency_ids: [],
            requires_user_decision: false,
          },
        ],
        external_effects: [],
        created_at: "2026-09-02T00:00:00.000Z",
      }),
    ).toBe(true);
    expect(
      Value.Check(UnscopedChatTaskRequestSchema, {
        idempotency_key: "ios:unscoped-chat:fixture",
        objective: "你好",
        person_id: personId,
      }),
    ).toBe(false);
  });

  it("bounds scoped Chat media without granting evidence authority", () => {
    const media = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      file_name: "conversation context.jpg",
      media_type: "image/jpeg",
      byte_size: 2048,
      width: 1200,
      height: 900,
      status: "ready",
      created_at: "2026-08-27T10:00:00.000Z",
    };
    expect(Value.Check(ChatMediaAssetSchema, media)).toBe(true);
    expect(
      Value.Check(CreateChatMediaRequestSchema, {
        idempotency_key: "web-chat-media:request-1",
        person_id: personId,
        relationship_context_id: contextId,
        file_name: media.file_name,
        media_type: media.media_type,
        byte_size: media.byte_size,
        width: media.width,
        height: media.height,
      }),
    ).toBe(true);
    expect(Value.Check(ChatMediaAssetSchema, { ...media, byte_size: 8_388_609 })).toBe(false);
    expect(media).not.toHaveProperty("evidence_fragment_ids");
    expect(media).not.toHaveProperty("authorization_scope");
  });
});
