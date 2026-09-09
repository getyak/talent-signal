import { measureLabServerStage, measureLabServerStageSync } from "../lib/labDiagnostics.js";
import { randomUUID } from "node:crypto";

import {
  ContactWorkspaceInputSchema,
  WORKSPACE_CONVERSATION_SYSTEM_PROMPT,
  resolveProductPrompt, promptReference, type PromptSnapshot,
  DEFAULT_AGENT_BUDGET,
  AGENT_BUDGET_CEILING,
  WORKSPACE_CONVERSATION_AGENT_TOOL_NAMES,
  WorkspaceConversationFinalOutputSchema,
  fingerprint,
  type AgentProvider,
  type AgentProviderResult,
  type AgentToolResult,
  type ConversationMessage,
  type RuntimeObservationContext,
} from "@talent-signal/agent";
import type {
  ChatResponseBlock,
  WorkspaceConversationAgentEvent,
} from "@talent-signal/contracts";

import type { DatabaseClient } from "../database/pool.js";
import type { AuthContext } from "./auth.js";
import { getRelationshipScope, searchPeople } from "./people.js";

const WORKSPACE_CONVERSATION_TIMEOUT_MS = 35_000;

export { WORKSPACE_CONVERSATION_SYSTEM_PROMPT } from "@talent-signal/agent";

export type WorkspaceContactSearchResult = {
  personID: string;
  displayLabel: string;
  directoryRevision: number;
  contexts: Array<{ id: string; displayLabel: string }>;
  exactIdentityMatch?: boolean;
};

export interface WorkspaceContactLookup {
  search(query: string): Promise<WorkspaceContactSearchResult[]>;
  read(personID: string, contextID: string): Promise<{
    person: { id: string; displayLabel: string; directoryRevision: number };
    relationship: { id: string; displayLabel: string };
  }>;
}

function scopeKey(personID: string, contextID: string): string {
  return `${personID}:${contextID}`;
}

function uniquelyGroundedScope(
  results: WorkspaceContactSearchResult[],
  objective: string,
): string | null {
  const pairs = results.flatMap((person) =>
    person.contexts.map((context) => ({ person, context })),
  );
  if (results.length === 1 && pairs.length === 1) {
    return scopeKey(pairs[0]!.person.personID, pairs[0]!.context.id);
  }
  const normalizedObjective = normalized(objective);
  const contextMatches = pairs.filter(({ context }) => {
    const label = normalized(context.displayLabel);
    return label.length >= 2 && normalizedObjective.includes(label);
  });
  if (contextMatches.length === 1) {
    const match = contextMatches[0]!;
    return scopeKey(match.person.personID, match.context.id);
  }
  const namedPeople = results.filter((person) => {
    const label = normalized(person.displayLabel);
    return label.length >= 2 && normalizedObjective.includes(label);
  });
  const exactPersonPairs = pairs.filter(({ person }) => namedPeople.includes(person));
  if (namedPeople.length === 1 && exactPersonPairs.length === 1) {
    const match = exactPersonPairs[0]!;
    return scopeKey(match.person.personID, match.context.id);
  }
  return null;
}

export interface WorkspaceConversationAgentExecution {
  block: ChatResponseBlock;
  event: WorkspaceConversationAgentEvent | null;
  providerResult: AgentProviderResult;
}

function normalized(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

function isGroundedExcerpt(excerpt: string, objective: string): boolean {
  return excerpt.trim().length > 0 && objective.includes(excerpt.trim());
}

function authoredNote(objective: string): string {
  return objective
    .replace(/```[\s\S]*?```/gu, " ")
    .replace(/^\s*>.*$/gmu, " ")
    .replace(/[“「『][\s\S]*?[”」』]/gu, " ")
    .replace(/"[^"\n]*"/gu, " ");
}

function explicitContactChange(objective: string): boolean {
  const note = authoredNote(objective).replace(/https?:\/\/\S+|[^\s@]+@[^\s@]+/gu, " ");
  if (/\b(?:how|why|what|when|where)\b|如何|怎么|为什么/iu.test(note)) return false;
  if (/不要|别(?:添加|创建|保存|更新)|do\s+not|don['’]t|never/iu.test(note)) return false;
  return /^\s*(?:(?:please|can you|could you|would you|will you)\s+)*(?:create|add|save|update|record|register)\b/iu.test(note)
    || /^\s*(?:创建|新增|添加|保存|更新|建档|录入|记下)/u.test(note)
    || /^\s*(?:请|帮我|麻烦|我想|我要)[\s\S]{0,200}(?:创建|新增|添加|保存|更新|建档|录入|记下)/u.test(note);
}

function validStableClue(clue: { type: string; value: string }): boolean {
  if (clue.type === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(clue.value);
  if (clue.type === "phone") {
    const digits = clue.value.replace(/\D/gu, "");
    return /^[+\d\s().-]+$/u.test(clue.value) && digits.length >= 7 && digits.length <= 15;
  }
  try {
    const url = new URL(clue.value);
    return ["https:", "http:"].includes(url.protocol) && url.hostname.includes(".")
      && !url.username && !url.password
      && (clue.type !== "linkedin_url" || /(^|\.)linkedin\.com$/iu.test(url.hostname));
  } catch { return false; }
}

function permitsContactDraft(objective: string, name: string, clue: { type: string; value: string } | null): boolean {
  if (/不要|别(?:添加|创建|保存|更新)|do\s+not|don['’]t|never/iu.test(authoredNote(objective))) return false;
  if (explicitContactChange(objective)) return true;
  const note = authoredNote(objective);
  if (!clue || !isGroundedExcerpt(name, note) || !isGroundedExcerpt(clue.value, note)) return false;
  const framing = note.replaceAll(clue.value, " ").replaceAll(name, " ");
  return !/[?？]/u.test(framing)
    && !/\b(?:what|why|how|who|example|hypothetical|suppose|says?|said|wrote|quoted?)\b/iu.test(framing)
    && !/(?:什么|怎么|如何|是否|假设|例如|举例|示例|说[：:道]|引用|转发|不要|别保存|别添加)/u.test(framing);
}

function toolFailure(
  name: string,
  code: string,
  message: string,
): AgentToolResult {
  return {
    ok: false,
    callID: randomUUID(),
    name,
    error: { code, message },
  };
}

function block(
  kind: "answer" | "clarification" | "identity_review",
  title: string,
  body: string,
  requiresUserDecision: boolean,
): ChatResponseBlock {
  return {
    id: randomUUID(),
    kind,
    title,
    body,
    status: requiresUserDecision ? "needs_review" : "informational",
    citation_dependency_ids: [],
    requires_user_decision: requiresUserDecision,
  };
}

export async function executeWorkspaceConversationAgentCore(input: {
  objective: string;
  provider: AgentProvider;
  workspaceID: string;
  contacts: WorkspaceContactLookup;
  sessionID?: string | null;
  messageID?: string;
  conversationHistory?: readonly ConversationMessage[];
  promptSnapshot?: PromptSnapshot;
  runID?: string;
  observation?: RuntimeObservationContext;
  continuation?: import("@talent-signal/agent").HarnessContinuationFactory;
  assertCurrent?: () => Promise<void>;
  responsePreference?: import("@talent-signal/agent").ResponsePreference;
  calendarContext?: import("@talent-signal/agent").CalendarDraftContext;
}): Promise<WorkspaceConversationAgentExecution> {
  const searchResults = new Map<string, WorkspaceContactSearchResult>();
  const readableScopes = new Set<string>();
  const updateablePeople = new Set<string>();
  const sourceMessageID = input.messageID ?? randomUUID();
  const runState: {
    readScope: { personID: string; contextID: string } | null;
    proposal: WorkspaceConversationAgentEvent | null;
  } = { readScope: null, proposal: null };
  let toolCallCount = 0;
  // SDK startup and tool turns share the same admitted wall-clock ceiling as
  // scoped Chat. Keep the legacy HTTP adapter's tighter existing deadline.
  const durationMs = input.provider.id === "claude-agent-sdk"
    ? AGENT_BUDGET_CEILING.maxDurationMs : WORKSPACE_CONVERSATION_TIMEOUT_MS;
  const abort = new AbortController();
  const timeout = setTimeout(
    () => abort.abort(new Error("WORKSPACE_CONVERSATION_TIMEOUT")),
    durationMs,
  );

  const invokeTool = async (
    name: string,
    rawInput: unknown,
    executionSignal?: AbortSignal,
  ): Promise<AgentToolResult> => {
    abort.signal.throwIfAborted();
    executionSignal?.throwIfAborted();
    toolCallCount += 1;
    if (toolCallCount > 6) {
      return toolFailure(
        name,
        "CONTACT_TOOL_BUDGET_EXHAUSTED",
        "This turn reached its contact Tool call limit.",
      );
    }
    if (name !== "contact_workspace") {
      return toolFailure(
        name,
        "TOOL_NOT_ALLOWED",
        "Only contact_workspace is available in this Run.",
      );
    }
    const parsed = ContactWorkspaceInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return toolFailure(
        name,
        "TOOL_INPUT_INVALID",
        "The contact workspace request did not match its typed contract.",
      );
    }
    const request = parsed.data;
    if (request.operation === "search") {
      const query = normalized(request.query);
      if (
        !query ||
        /[*%]/u.test(query) ||
        query === "all" ||
        query === "全部" ||
        !normalized(input.objective).includes(query)
      ) {
        return toolFailure(
          name,
          "CONTACT_SEARCH_NOT_GROUNDED",
          "Search requires one specific clue grounded in the current user message.",
        );
      }
      const matches = await input.contacts.search(request.query);
      const results = matches.slice(0, request.maximum_results);
      for (const result of results) searchResults.set(result.personID, result);
      const exactMatches = matches.filter((person) =>
        person.exactIdentityMatch || normalized(person.displayLabel) === query,
      );
      if (exactMatches.length === 1 && results.some((person) => person.personID === exactMatches[0]!.personID)) {
        updateablePeople.add(exactMatches[0]!.personID);
      }
      const readableScope = uniquelyGroundedScope(matches, input.objective);
      if (readableScope) readableScopes.add(readableScope);
      return {
        ok: true,
        callID: randomUUID(),
        name,
        data: {
          operation: "search",
          result_count: matches.length,
          results: results.map((result) => ({
            person_id: result.personID,
            display_label: result.displayLabel,
            directory_revision: result.directoryRevision,
            exact_identity_match: updateablePeople.has(result.personID),
            relationship_contexts: result.contexts.map((context) => ({
              id: context.id,
              display_label: context.displayLabel,
            })),
          })),
          data_boundary:
            "Minimal identity and relationship labels only; no message or evidence text was read.",
        },
      };
    }

    if (request.operation === "read") {
      const result = searchResults.get(request.person_id);
      const context = result?.contexts.find(
        (item) => item.id === request.relationship_context_id,
      );
      if (
        !result ||
        !context ||
        runState.readScope ||
        !readableScopes.has(scopeKey(request.person_id, request.relationship_context_id))
      ) {
        return toolFailure(
          name,
          "CONTACT_READ_NOT_AUTHORIZED",
          "Read requires one exact same-Run search result and only one relationship may be read.",
        );
      }
      const scope = await input.contacts.read(request.person_id, request.relationship_context_id);
      runState.readScope = {
        personID: request.person_id,
        contextID: request.relationship_context_id,
      };
      return {
        ok: true,
        callID: randomUUID(),
        name,
        data: {
          operation: "read",
          person: {
            id: scope.person.id,
            display_label: scope.person.displayLabel,
            directory_revision: scope.person.directoryRevision,
          },
          relationship_context: {
            id: scope.relationship.id,
            display_label: scope.relationship.displayLabel,
          },
          data_boundary:
            "Only the exact authorized identity and relationship header was read; profile text, contact values, messages, and evidence were not included.",
        },
      };
    }

    if (
      request.source_excerpts.some(
        (excerpt) => !isGroundedExcerpt(excerpt, input.objective),
      )
    ) {
      return toolFailure(
        name,
        "CONTACT_PROPOSAL_SOURCE_UNGROUNDED",
        "Every proposal source excerpt must be copied from the current user message.",
      );
    }
    if (runState.proposal) {
      return toolFailure(
        name,
        "CONTACT_PROPOSAL_ALREADY_STAGED",
        "Only one contact change proposal may be staged per turn.",
      );
    }

    if (request.operation === "propose_update") {
      const result = searchResults.get(request.person_id);
      const existingContext = request.relationship_context_id === null
        ? null
        : result?.contexts.find(
          (context) => context.id === request.relationship_context_id,
        );
      const contextAllowed = request.relationship_context_id === null
        || Boolean(existingContext);
      if (
        !result ||
        !updateablePeople.has(request.person_id) ||
        !contextAllowed ||
        request.base_revision !== result.directoryRevision
      ) {
        return toolFailure(
          name,
          "CONTACT_UPDATE_TARGET_STALE_OR_UNRESOLVED",
          "Update requires one exact same-Run target and its current directory revision.",
        );
      }
      const displayNameAllowed = normalized(request.display_name) ===
        normalized(result.displayLabel);
      const relationshipContextAllowed = existingContext
        ? normalized(request.relationship_context) ===
          normalized(existingContext.displayLabel)
        : !request.relationship_context || isGroundedExcerpt(request.relationship_context, input.objective);
      if (!displayNameAllowed || !relationshipContextAllowed) {
        return toolFailure(
          name,
          "CONTACT_PROPOSAL_FIELDS_UNGROUNDED",
          "An update must keep the resolved Person label and either keep its exact relationship label or propose a message-grounded new context.",
        );
      }
    } else if (
      !isGroundedExcerpt(request.display_name, input.objective) ||
      (request.relationship_context !== "" && !isGroundedExcerpt(request.relationship_context, input.objective))
    ) {
      return toolFailure(
        name,
        "CONTACT_PROPOSAL_FIELDS_UNGROUNDED",
        "A new contact's name and relationship context must be present in the current message.",
      );
    }

    if (
      request.identity_clue &&
      (!isGroundedExcerpt(request.identity_clue.value, input.objective) || !validStableClue(request.identity_clue))
    ) {
      return toolFailure(
        name,
        "CONTACT_PROPOSAL_IDENTITY_UNGROUNDED",
        "A contact identity clue must be present in the current message.",
      );
    }

    if (!permitsContactDraft(input.objective, request.display_name, request.identity_clue)) {
      return toolFailure(name, "CONTACT_PROPOSAL_INTENT_UNGROUNDED",
        "Prepare a draft only for an authored person note with a name and stable clue, or an explicit contact-change request.");
    }
    const proposedFields = [request.operation === "propose_create" ? request.display_name : null,
      request.identity_clue?.value,
      request.operation === "propose_create" || request.relationship_context_id === null
        ? request.relationship_context : null].filter(Boolean) as string[];
    if (proposedFields.some((value) => !request.source_excerpts.some((excerpt) => excerpt.includes(value)))) {
      return toolFailure(name, "CONTACT_PROPOSAL_SOURCE_INCOMPLETE",
        "Source excerpts must include each proposed name, identity clue, and new relationship field.");
    }

    const possibleDuplicates = request.operation === "propose_create"
      ? (
          await input.contacts.search(request.identity_clue?.value ?? request.display_name)
        ).slice(0, 6)
      : [];
    if (possibleDuplicates.some((person) => person.exactIdentityMatch
      || normalized(person.displayLabel) === normalized(request.display_name))) {
      return toolFailure(name, "CONTACT_CREATE_TARGET_ALREADY_EXISTS",
        "An exact contact candidate already exists. Search its current identity clue and prepare an update only if uniquely resolved; otherwise clarify.");
    }

    const candidateFingerprint = fingerprint({
      operation: request.operation,
      payload: request,
      accountID: input.workspaceID,
      sourceMessageID,
    });
    runState.proposal = {
      kind: "contact_change_proposal",
      proposal_kind:
        request.operation === "propose_create" ? "create" : "update",
      candidate_fingerprint: candidateFingerprint,
      display_name: request.display_name,
      relationship_context: request.relationship_context,
      identity_clue: request.identity_clue,
      source_excerpts: request.source_excerpts,
      source_message_id: sourceMessageID,
      reason: request.reason,
      target_person_id:
        request.operation === "propose_update" ? request.person_id : null,
      target_relationship_context_id:
        request.operation === "propose_update"
          ? request.relationship_context_id
          : null,
      base_revision:
        request.operation === "propose_update" ? request.base_revision : null,
      requires_user_confirmation: true,
    };
    return {
      ok: true,
      callID: randomUUID(),
      name,
      data: {
        operation: request.operation,
        status: "needs_review",
        consequence: "No contact data changed.",
        possible_duplicates: possibleDuplicates.map((person) => ({
              person_id: person.personID,
              display_label: person.displayLabel,
              relationship_contexts: person.contexts.map((context) => ({
                id: context.id,
                display_label: context.displayLabel,
          })),
        })),
      },
      candidateFingerprint,
    };
  };

  try {
    const snapshot = input.promptSnapshot ?? await resolveProductPrompt("assistant/workspace");
    await input.assertCurrent?.();
    const providerResult = await measureLabServerStage("model_adapter", () => input.provider.run(
      {
        runID: input.runID ?? randomUUID(),
        ...(input.observation ? { observation: input.observation } : {}),
        ...(input.continuation ? { continuation: input.continuation } : {}),
        ...(input.assertCurrent ? { assertCurrent: input.assertCurrent } : {}),
        ...(input.responsePreference ? { responsePreference: input.responsePreference } : {}),
        ...(input.calendarContext ? { calendarContext: input.calendarContext } : {}),
        objective: input.objective,
        conversationHistory: input.conversationHistory ?? [],
        systemPrompt: snapshot.text,
        scopeSummary: {
          kind: "workspace_conversation",
          workspaceID: input.workspaceID,
          sessionID: input.sessionID ?? null,
          currentPersonID: null,
          currentRelationshipContextID: null,
        },
        toolManifest: Object.freeze([
          ...WORKSPACE_CONVERSATION_AGENT_TOOL_NAMES,
        ]),
        budget: {
          ...DEFAULT_AGENT_BUDGET,
          maxTurns: Math.min(DEFAULT_AGENT_BUDGET.maxTurns, 6),
          maxToolCalls: Math.min(DEFAULT_AGENT_BUDGET.maxToolCalls, 6),
          maxDurationMs: durationMs,
        },
      },
      (...args) => measureLabServerStage("tool", () => invokeTool(...args)),
      abort.signal,
    ));
    providerResult.prompt ??= promptReference(snapshot);
    const output = measureLabServerStageSync("validation", () => WorkspaceConversationFinalOutputSchema.parse(
      providerResult.structuredOutput,
    ));
    if (
      (runState.proposal && output.outcome !== "contact_change_proposal") ||
      (runState.readScope && output.outcome !== "use_contact") ||
      (searchResults.size > 0 && output.outcome === "reply")
    ) {
      throw new Error(
        "The Agent terminal output did not preserve the contact Tool boundary.",
      );
    }
    if (output.outcome === "reply") {
      return {
        block: block("answer", output.title, output.body, false),
        event: null,
        providerResult,
      };
    }
    if (output.outcome === "clarification") {
      const candidates = [...searchResults.values()]
        .flatMap((person) =>
          person.contexts.map((context) => ({
            person_id: person.personID,
            person_display_label: person.displayLabel,
            relationship_context_id: context.id,
            relationship_context_display_label: context.displayLabel,
          })),
        )
        .slice(0, 6);
      const duplicateLabels = new Set<string>();
      const seenLabels = new Set<string>();
      for (const result of searchResults.values()) {
        const label = normalized(result.displayLabel);
        if (seenLabels.has(label)) duplicateLabels.add(label);
        seenLabels.add(label);
      }
      return {
        block: block("clarification", output.title, output.body, true),
        event: candidates.length > 0
          ? {
              kind: "contact_candidates",
              candidates,
              possible_duplicate: duplicateLabels.size > 0,
              tool_summary: `Contact search · ${candidates.length} possible relationship${candidates.length === 1 ? "" : "s"}`,
            }
          : null,
        providerResult,
      };
    }
    if (output.outcome === "use_contact") {
      if (
        !runState.readScope ||
        runState.readScope.personID !== output.person_id ||
        runState.readScope.contextID !== output.relationship_context_id
      ) {
        throw new Error(
          "The Agent selected a contact context it did not uniquely read in this Run.",
        );
      }
      const person = searchResults.get(output.person_id);
      const context = person?.contexts.find(
        (item) => item.id === output.relationship_context_id,
      );
      if (!person || !context) {
        throw new Error("The Agent contact context is no longer available.");
      }
      return {
        block: block(
          "answer",
          /\p{Script=Han}/u.test(input.objective) ? "已找到联系人" : "Contact found",
          /\p{Script=Han}/u.test(input.objective)
            ? `我找到了 ${person.displayLabel} · ${context.displayLabel}，将只用这段关系的已授权上下文继续回答。`
            : `I found ${person.displayLabel} · ${context.displayLabel} and will continue with only that relationship's authorized context.`,
          false,
        ),
        event: {
          kind: "resolved_contact_context",
          person_id: person.personID,
          person_display_label: person.displayLabel,
          relationship_context_id: context.id,
          relationship_context_display_label: context.displayLabel,
          tool_summary: `Contact search · ${person.displayLabel} · ${context.displayLabel}`,
        },
        providerResult,
      };
    }
    if (
      !runState.proposal ||
      runState.proposal.kind !== "contact_change_proposal" ||
      runState.proposal.candidate_fingerprint !== output.candidate_fingerprint
    ) {
      throw new Error(
        "The Agent proposal output did not match a same-Run Tool candidate.",
      );
    }
    return {
      block: block(
        "identity_review",
        /\p{Script=Han}/u.test(input.objective) ? "联系人更改提议" : "Contact change proposed",
        /\p{Script=Han}/u.test(input.objective)
          ? "我已准备一张可审阅卡片。确认前不会更改联系人。"
          : "I prepared a review card. No contact will change until you confirm.",
        true,
      ),
      event: runState.proposal,
      providerResult,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function executeWorkspaceConversationAgent(input: {
  database: DatabaseClient;
  auth: AuthContext;
  objective: string;
  provider: AgentProvider;
  sessionID?: string | null;
  messageID?: string;
  conversationHistory?: readonly ConversationMessage[];
  runID?: string;
  observation?: RuntimeObservationContext;
  continuation?: import("@talent-signal/agent").HarnessContinuationFactory;
  assertCurrent?: () => Promise<void>;
  responsePreference?: import("@talent-signal/agent").ResponsePreference;
  calendarContext?: import("@talent-signal/agent").CalendarDraftContext;
  recordSourcePerson?: (personID: string) => void;
}): Promise<WorkspaceConversationAgentExecution> {
  const refs = input.observation?.source_refs;
  const recordScope = (personID: string, contextIDs: string[]) => {
    input.recordSourcePerson?.(personID);
    if (refs?.kind !== "product") return;
    if (!refs.person_ids.includes(personID)) refs.person_ids.push(personID);
    for (const id of contextIDs) if (!refs.relationship_context_ids.includes(id)) refs.relationship_context_ids.push(id);
  };
  const contacts: WorkspaceContactLookup = {
    search: async (query) => {
      const response = await searchPeople(input.database, input.auth, query);
      for (const person of response.people) recordScope(person.id, person.contexts.map((context) => context.id));
      return response.people.map((person) => ({
        personID: person.id,
        displayLabel: person.display_label,
        directoryRevision: person.profile?.revision ?? 1,
        contexts: person.contexts.map((context) => ({
          id: context.id,
          displayLabel: context.display_label,
        })),
        exactIdentityMatch: person.identity_matches.some((match) => match.kind === "confirmed_handle"),
      }));
    },
    read: async (personID, contextID) => {
      const scope = await getRelationshipScope(input.database, input.auth, personID, contextID);
      recordScope(scope.person.id, [scope.relationship_context.id]);
      return {
        person: {
          id: scope.person.id,
          displayLabel: scope.person.display_label,
          directoryRevision: scope.person.profile?.revision ?? 1,
        },
        relationship: {
          id: scope.relationship_context.id,
          displayLabel: scope.relationship_context.display_label,
        },
      };
    },
  };
  return executeWorkspaceConversationAgentCore({
    objective: input.objective,
    provider: input.provider,
    workspaceID: input.auth.accountId,
    contacts,
    ...(input.runID ? { runID: input.runID } : {}),
    ...(input.observation ? { observation: input.observation } : {}),
    ...(input.continuation ? { continuation: input.continuation } : {}),
        ...(input.assertCurrent ? { assertCurrent: input.assertCurrent } : {}),
        ...(input.responsePreference ? { responsePreference: input.responsePreference } : {}),
        ...(input.calendarContext ? { calendarContext: input.calendarContext } : {}),
    ...(input.messageID === undefined ? {} : { messageID: input.messageID }),
    ...(input.conversationHistory === undefined ? {} : { conversationHistory: input.conversationHistory }),
    ...(input.sessionID === undefined ? {} : { sessionID: input.sessionID }),
  });
}

export function isWorkspaceConversationAgentProvider(
  provider: unknown,
): provider is AgentProvider {
  return Boolean(
    provider &&
      typeof provider === "object" &&
      "run" in provider &&
      typeof (provider as { run?: unknown }).run === "function",
  );
}
