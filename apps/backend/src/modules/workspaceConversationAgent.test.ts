import { ScriptedAgentProvider } from "@talent-signal/agent";
import type { DatabaseClient } from "../database/pool.js";
import { describe, expect, it, vi } from "vitest";

import type { AuthContext } from "./auth.js";
import { executeWorkspaceConversationAgent } from "./workspaceConversationAgent.js";

const auth: AuthContext = {
  accountId: "11111111-1111-4111-8111-111111111111",
  accountSlug: "fixture-alpha",
  userId: "22222222-2222-4222-8222-222222222222",
  userEmail: "recruiter@alpha.local",
  userKind: "simulated_human",
  sessionId: "33333333-3333-4333-8333-333333333333",
};

const personID = "44444444-4444-4444-8444-444444444444";
const contextID = "55555555-5555-4555-8555-555555555555";

function personRow(options: {
  label?: string;
  personID?: string;
  contextID?: string;
  contextLabel?: string;
  profileRevision?: number | null;
} = {}) {
  const rowPersonID = options.personID ?? personID;
  const rowContextID = options.contextID ?? contextID;
  return {
    id: rowPersonID,
    display_label: options.label ?? "Maya Chen",
    context_count: 1,
    capture_count: 2,
    confirmed_identity_count: 0,
    last_activity_at: new Date("2026-09-01T00:00:00.000Z"),
    name_match: true,
    matched_handle_status: null,
    matched_handle_type: null,
    matched_handle_hint: null,
    matched_handle_source_resource_id: null,
    matched_handle_valid_until: null,
    profile_headline: options.profileRevision ? "Chief Product Officer" : null,
    profile_summary: options.profileRevision ? "Recruiter-authored profile" : null,
    profile_provenance_kind: options.profileRevision ? "user_authored" : null,
    profile_authored_by_user_id: options.profileRevision
      ? auth.userId
      : null,
    profile_revision: options.profileRevision ?? null,
    profile_updated_at: options.profileRevision
      ? new Date("2026-09-01T00:00:00.000Z")
      : null,
    public_profile_card_headline: null,
    public_profile_confirmed_by_user_id: null,
    public_profile_revision: null,
    public_profile_confirmed_at: null,
    public_profile_url: null,
    public_profile_platform: null,
    public_profile_avatar_url: null,
    public_profile_use_avatar: null,
    public_profile_retrieved_at: null,
    contexts: [
      {
        id: rowContextID,
        display_label: options.contextLabel ?? "CPO search",
        last_activity_at: "2026-09-01T00:00:00.000Z",
      },
    ],
  };
}

describe("workspace conversation Agent", () => {
  it("can reply without opening the contact workspace", async () => {
    const query = vi.fn();
    const execution = await executeWorkspaceConversationAgent({
      database: { query } as unknown as DatabaseClient,
      auth,
      objective: "你好",
      provider: new ScriptedAgentProvider([], {
        outcome: "reply",
        title: "你好",
        body: "你好，我在。",
      }),
    });

    expect(query).not.toHaveBeenCalled();
    expect(execution.event).toBeNull();
    expect(execution.block).toMatchObject({
      kind: "answer",
      body: "你好，我在。",
      requires_user_decision: false,
    });
  });

  it("rejects wildcard enumeration without querying the account", async () => {
    const query = vi.fn();
    const execution = await executeWorkspaceConversationAgent({
      database: { query } as unknown as DatabaseClient,
      auth,
      objective: "Show me all contacts",
      provider: new ScriptedAgentProvider(
        [
          {
            tool: "contact_workspace",
            input: { operation: "search", query: "*", maximum_results: 6 },
          },
        ],
        {
          outcome: "clarification",
          title: "Which contact?",
          body: "Name one person or relationship to search.",
        },
      ),
    });

    expect(query).not.toHaveBeenCalled();
    expect(execution.block.kind).toBe("clarification");
  });

  it("keeps a no-match search as a clarification without a fabricated event", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] });
    const execution = await executeWorkspaceConversationAgent({
      database: { query } as unknown as DatabaseClient,
      auth,
      objective: "What changed with Noor?",
      provider: new ScriptedAgentProvider(
        [
          {
            tool: "contact_workspace",
            input: { operation: "search", query: "Noor", maximum_results: 4 },
          },
        ],
        {
          outcome: "clarification",
          title: "I could not find Noor",
          body: "Share one more identity clue, or continue without contact context.",
        },
      ),
    });

    expect(query).toHaveBeenCalledOnce();
    expect(execution.event).toBeNull();
    expect(execution.block.kind).toBe("clarification");
  });

  it("uses only one exact same-Run search result as relationship context", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [personRow()] })
      .mockResolvedValueOnce({
        rows: [
          {
            person_id: personID,
            person_label: "Maya Chen",
            profile_headline: null,
            profile_summary: null,
            profile_provenance_kind: null,
            profile_authored_by_user_id: null,
            profile_revision: null,
            profile_updated_at: null,
            contact_points: [],
            context_id: contextID,
            context_label: "CPO search",
          },
        ],
      });
    const execution = await executeWorkspaceConversationAgent({
      database: { query } as unknown as DatabaseClient,
      auth,
      objective: "What is happening with Maya?",
      provider: new ScriptedAgentProvider(
        [
          {
            tool: "contact_workspace",
            input: { operation: "search", query: "Maya", maximum_results: 4 },
          },
          {
            tool: "contact_workspace",
            input: {
              operation: "read",
              person_id: personID,
              relationship_context_id: contextID,
            },
          },
        ],
        {
          outcome: "use_contact",
          person_id: personID,
          relationship_context_id: contextID,
        },
      ),
    });

    expect(query).toHaveBeenCalledTimes(2);
    expect(execution.event).toEqual({
      kind: "resolved_contact_context",
      person_id: personID,
      person_display_label: "Maya Chen",
      relationship_context_id: contextID,
      relationship_context_display_label: "CPO search",
      tool_summary: "Contact search · Maya Chen · CPO search",
    });
  });

  it("stages a grounded create card without applying a contact write", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const execution = await executeWorkspaceConversationAgent({
      database: { query } as unknown as DatabaseClient,
      auth,
      objective: "Create Maya Chen as a contact for the CPO search",
      provider: new ScriptedAgentProvider(
        [
          {
            tool: "contact_workspace",
            input: {
              operation: "propose_create",
              display_name: "Maya Chen",
              relationship_context: "CPO search",
              identity_clue: null,
              source_excerpts: ["Maya Chen", "CPO search"],
              reason: "The recruiter explicitly requested a contact draft.",
            },
          },
        ],
        (results) => ({
          outcome: "contact_change_proposal",
          candidate_fingerprint: results[0]?.candidateFingerprint,
        }),
      ),
    });

    expect(query).toHaveBeenCalledOnce();
    expect(execution.event).toMatchObject({
      kind: "contact_change_proposal",
      proposal_kind: "create",
      display_name: "Maya Chen",
      relationship_context: "CPO search",
      requires_user_confirmation: true,
      target_person_id: null,
    });
    expect(execution.block).toMatchObject({
      kind: "identity_review",
      requires_user_decision: true,
    });
  });

  it("returns minimal candidates and refuses to read an ambiguous search", async () => {
    const secondPersonID = "66666666-6666-4666-8666-666666666666";
    const secondContextID = "77777777-7777-4777-8777-777777777777";
    const query = vi.fn().mockResolvedValueOnce({
      rows: [
        personRow(),
        personRow({
          personID: secondPersonID,
          contextID: secondContextID,
          contextLabel: "Board search",
        }),
      ],
    });
    const execution = await executeWorkspaceConversationAgent({
      database: { query } as unknown as DatabaseClient,
      auth,
      objective: "What is happening with Maya Chen?",
      provider: new ScriptedAgentProvider(
        [
          {
            tool: "contact_workspace",
            input: { operation: "search", query: "Maya Chen", maximum_results: 6 },
          },
          {
            tool: "contact_workspace",
            input: {
              operation: "read",
              person_id: personID,
              relationship_context_id: contextID,
            },
          },
        ],
        (results) => {
          expect(results[1]).toMatchObject({
            ok: false,
            error: { code: "CONTACT_READ_NOT_AUTHORIZED" },
          });
          return {
            outcome: "clarification",
            title: "Which Maya?",
            body: "Choose the right relationship.",
          };
        },
      ),
    });

    expect(query).toHaveBeenCalledOnce();
    expect(execution.event).toMatchObject({
      kind: "contact_candidates",
      possible_duplicate: true,
    });
    expect(execution.event?.kind === "contact_candidates"
      ? execution.event.candidates
      : []).toHaveLength(2);
  });

  it("rejects a create proposal whose contact fields were invented", async () => {
    const query = vi.fn();
    const execution = await executeWorkspaceConversationAgent({
      database: { query } as unknown as DatabaseClient,
      auth,
      objective: "Please create a contact from this message",
      provider: new ScriptedAgentProvider(
        [
          {
            tool: "contact_workspace",
            input: {
              operation: "propose_create",
              display_name: "Invented Person",
              relationship_context: "Invented Search",
              identity_clue: null,
              source_excerpts: ["create a contact"],
              reason: "A model guess.",
            },
          },
        ],
        (results) => {
          expect(results[0]).toMatchObject({
            ok: false,
            error: { code: "CONTACT_PROPOSAL_FIELDS_UNGROUNDED" },
          });
          return {
            outcome: "clarification",
            title: "Who should I add?",
            body: "Please provide the person's name and relationship context.",
          };
        },
      ),
    });

    expect(query).not.toHaveBeenCalled();
    expect(execution.event).toBeNull();
    expect(execution.block.kind).toBe("clarification");
  });

  it("rejects an update when the searched directory revision changed", async () => {
    const query = vi.fn().mockResolvedValueOnce({
      rows: [personRow({ profileRevision: 3 })],
    });
    const execution = await executeWorkspaceConversationAgent({
      database: { query } as unknown as DatabaseClient,
      auth,
      objective: "Update Maya Chen in the CPO search",
      provider: new ScriptedAgentProvider(
        [
          {
            tool: "contact_workspace",
            input: { operation: "search", query: "Maya Chen", maximum_results: 4 },
          },
          {
            tool: "contact_workspace",
            input: {
              operation: "propose_update",
              person_id: personID,
              relationship_context_id: contextID,
              base_revision: 2,
              display_name: "Maya Chen",
              relationship_context: "CPO search",
              identity_clue: null,
              source_excerpts: ["Maya Chen", "CPO search"],
              reason: "The recruiter asked for an update.",
            },
          },
        ],
        (results) => {
          expect(results[1]).toMatchObject({
            ok: false,
            error: { code: "CONTACT_UPDATE_TARGET_STALE_OR_UNRESOLVED" },
          });
          return {
            outcome: "clarification",
            title: "Review the current contact",
            body: "The contact changed; search again before proposing an update.",
          };
        },
      ),
    });

    expect(query).toHaveBeenCalledOnce();
    expect(execution.event?.kind).toBe("contact_candidates");
  });

  it("stages a contact detail update only against the exact searched target", async () => {
    const query = vi.fn().mockResolvedValueOnce({
      rows: [personRow({ profileRevision: 3 })],
    });
    const execution = await executeWorkspaceConversationAgent({
      database: { query } as unknown as DatabaseClient,
      auth,
      objective: "Update Maya Chen in the CPO search with maya@example.com",
      provider: new ScriptedAgentProvider(
        [
          {
            tool: "contact_workspace",
            input: {
              operation: "search",
              query: "Maya Chen",
              maximum_results: 4,
            },
          },
          {
            tool: "contact_workspace",
            input: {
              operation: "propose_update",
              person_id: personID,
              relationship_context_id: contextID,
              base_revision: 3,
              display_name: "Maya Chen",
              relationship_context: "CPO search",
              identity_clue: {
                type: "email",
                value: "maya@example.com",
              },
              source_excerpts: ["Maya Chen", "maya@example.com"],
              reason: "The recruiter requested a reviewable contact detail update.",
            },
          },
        ],
        (results) => ({
          outcome: "contact_change_proposal",
          candidate_fingerprint: results[1]?.candidateFingerprint,
        }),
      ),
    });

    expect(query).toHaveBeenCalledOnce();
    expect(execution.event).toMatchObject({
      kind: "contact_change_proposal",
      proposal_kind: "update",
      target_person_id: personID,
      target_relationship_context_id: contextID,
      base_revision: 3,
      requires_user_confirmation: true,
    });
  });

  it("enforces the per-turn contact Tool call budget", async () => {
    const query = vi.fn();
    const calls = Array.from({ length: 7 }, () => ({
      tool: "contact_workspace" as const,
      input: { operation: "search", query: "*", maximum_results: 4 },
    }));
    const execution = await executeWorkspaceConversationAgent({
      database: { query } as unknown as DatabaseClient,
      auth,
      objective: "Find Maya",
      provider: new ScriptedAgentProvider(calls, (results) => {
        expect(results[6]).toMatchObject({
          ok: false,
          error: { code: "CONTACT_TOOL_BUDGET_EXHAUSTED" },
        });
        return {
          outcome: "clarification",
          title: "Which contact?",
          body: "Give me one specific contact clue.",
        };
      }),
    });

    expect(query).not.toHaveBeenCalled();
    expect(execution.block.kind).toBe("clarification");
  });

  it("does not let a generic reply silently use searched contact data", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [personRow()] });

    await expect(
      executeWorkspaceConversationAgent({
        database: { query } as unknown as DatabaseClient,
        auth,
        objective: "Tell me about Maya Chen",
        provider: new ScriptedAgentProvider(
          [
            {
              tool: "contact_workspace",
              input: { operation: "search", query: "Maya Chen", maximum_results: 4 },
            },
          ],
          {
            outcome: "reply",
            title: "Maya Chen",
            body: "A reply based on the hidden search result.",
          },
        ),
      }),
    ).rejects.toThrow("did not preserve the contact Tool boundary");
  });
});
