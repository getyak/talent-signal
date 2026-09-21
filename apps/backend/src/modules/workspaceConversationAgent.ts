import { measureLabServerStage, measureLabServerStageSync } from "../lib/labDiagnostics.js";
import { randomUUID } from "node:crypto";

import {
  ContactWorkspaceInputSchema,
  MemoryReviewInputSchema,
  WORKSPACE_CONVERSATION_SYSTEM_PROMPT,
  memoryLocatorAdmissionError,
  resolveProductPrompt, promptReference, type PromptSnapshot,
  DEFAULT_AGENT_BUDGET,
  AGENT_BUDGET_CEILING,
  WORKSPACE_CONVERSATION_AGENT_TOOL_NAMES,
  WorkspaceConversationFinalOutputSchema,
  fingerprint,
  type AgentProvider,
  type AgentProviderResult,
  type AgentToolResult,
  type AgentVisibleProgressStage,
  type ConversationMessage,
  type MemoryReviewInput,
  type RuntimeObservationContext,
} from "@talent-signal/agent";
import type {
  ChatResponseBlock,
  MemoryProposalStageRequest,
  MemorySourceLocator,
  MemorySurface,
  WorkspaceConversationAgentEvent,
} from "@talent-signal/contracts";

import type { DatabaseClient } from "../database/pool.js";
import type { AuthContext } from "./auth.js";
import { getRelationshipScope, searchPeople } from "./people.js";
import { sha256 } from "../lib/hash.js";
import {
  recallMemories,
  stageMemoryProposal,
  type MemorySourceAuthority,
} from "./memoryReview.js";
import type { MemoryImageManifestEntry } from "./memoryReviewStore.js";

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

export interface WorkspaceMemoryRecall {
  id: string;
  scope: string;
  display_text: string;
  version: number;
  statement_kind: string;
  evidence_retained: boolean;
}

export interface WorkspaceMemoryStagedProposal {
  proposalID: string;
  proposalRevision: number;
  itemCount: number;
  defaultSelectedCount: number;
  scopeCounts: { self: number; person: number; relationship: number };
  contactStatus: "resolved" | "ambiguous" | "pending";
  personID: string | null;
  personDisplayLabel: string | null;
}

type WorkspaceMemoryProposeInput = Extract<
  MemoryReviewInput,
  { operation: "propose" }
>;
export type WorkspaceMemoryProposalCandidate =
  WorkspaceMemoryProposeInput["items"][number];

/** Host-owned typed Memory recall/stage. Models never accept memory directly. */
export interface WorkspaceMemoryLookup {
  recall(input: {
    personID: string | null;
    contextID: string | null;
  }): Promise<{ items: WorkspaceMemoryRecall[] }>;
  stage(input: {
    surface: MemorySurface;
    personID: string | null;
    contextID: string | null;
    contactDecision: "existing" | "new" | "none";
    newContact: {
      display_label: string;
      relationship_context: string;
      source_locator: MemorySourceLocator | null;
    } | null;
    sourceMessageID: string;
    items: readonly WorkspaceMemoryProposalCandidate[];
  }): Promise<WorkspaceMemoryStagedProposal | null>;
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
  /** Independent optional review reference; never the sole agent event. */
  memoryProposal: { proposal_id: string; revision: number } | null;
  providerResult: AgentProviderResult;
}

function normalized(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

function memoryRef(
  staged: WorkspaceMemoryStagedProposal | null,
): { proposal_id: string; revision: number } | null {
  return staged
    ? { proposal_id: staged.proposalID, revision: staged.proposalRevision }
    : null;
}

function workspaceImageManifest(
  parts: readonly import("@talent-signal/agent").AgentProviderInputPart[],
): MemoryImageManifestEntry[] {
  const entries: MemoryImageManifestEntry[] = [];
  for (const part of parts) {
    if (part.kind !== "image") continue;
    const match = part.artifactID.match(/^conversation-image-[0-9a-f-]{36}-(\d+)-(.+)$/u);
    if (match) {
      entries.push({
        index: Number(match[1]),
        attachmentId: match[2]!,
        contentHash: part.contentHash,
      });
    }
  }
  return entries.sort((left, right) => left.index - right.index);
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
  /** Raw user source text. For an images-only message this is empty; the
   * objective may carry a host instruction that must not become provenance. */
  sourceText?: string;
  provider: AgentProvider;
  workspaceID: string;
  contacts: WorkspaceContactLookup;
  memory?: WorkspaceMemoryLookup;
  sessionID?: string | null;
  messageID?: string;
  sessionTitleRequested?: boolean;
  conversationHistory?: readonly ConversationMessage[];
  promptSnapshot?: PromptSnapshot;
  runID?: string;
  inputParts?: readonly import("@talent-signal/agent").AgentProviderInputPart[];
  observation?: RuntimeObservationContext;
  continuation?: import("@talent-signal/agent").HarnessContinuationFactory;
  assertCurrent?: () => Promise<void>;
  responsePreference?: import("@talent-signal/agent").ResponsePreference;
  calendarContext?: import("@talent-signal/agent").CalendarDraftContext;
  onVisibleText?: (text: string) => void;
  onProgress?: (stage: AgentVisibleProgressStage) => void;
  signal?: AbortSignal;
}): Promise<WorkspaceConversationAgentExecution> {
  const searchResults = new Map<string, WorkspaceContactSearchResult>();
  const readableScopes = new Set<string>();
  const updateablePeople = new Set<string>();
  const sourceMessageID = input.messageID ?? randomUUID();
  const runState: {
    readScope: { personID: string; contextID: string } | null;
    proposal: WorkspaceConversationAgentEvent | null;
    memoryProposal: WorkspaceMemoryStagedProposal | null;
  } = { readScope: null, proposal: null, memoryProposal: null };
  const admittedArtifactIds = (input.inputParts ?? []).map(
    (part) => part.artifactID,
  );
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
  // External stop composes with the existing timeout and source-revocation
  // aborts; it never creates a second provider execution.
  const onExternalAbort = () =>
    abort.abort(input.signal?.reason ?? new Error("USER_CANCELLED"));
  if (input.signal) {
    if (input.signal.aborted) onExternalAbort();
    else input.signal.addEventListener("abort", onExternalAbort, { once: true });
  }

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
    if (name === "memory_review") {
      const parsedMemory = MemoryReviewInputSchema.safeParse(rawInput);
      if (!parsedMemory.success) {
        return toolFailure(
          name,
          "TOOL_INPUT_INVALID",
          "The Memory review request did not match its typed contract.",
        );
      }
      if (!input.memory) {
        return toolFailure(
          name,
          "MEMORY_UNAVAILABLE",
          "Memory review is not available in this Run.",
        );
      }
      const request = parsedMemory.data;
      if (request.operation === "recall") {
        const personID = request.person_id ?? null;
        const contextID = request.relationship_context_id ?? null;
        if (personID && !searchResults.has(personID)) {
          return toolFailure(
            name,
            "MEMORY_RECALL_NOT_AUTHORIZED",
            "Recall the current user's own memory, or only a contact found in this Run.",
          );
        }
        if (personID && contextID) {
          const result = searchResults.get(personID);
          if (!result?.contexts.some((context) => context.id === contextID)) {
            return toolFailure(
              name,
              "MEMORY_RECALL_NOT_AUTHORIZED",
              "Recall requires an exact same-Run relationship context.",
            );
          }
        }
        let recalled: Awaited<ReturnType<WorkspaceMemoryLookup["recall"]>>;
        try {
          recalled = await input.memory.recall({ personID, contextID });
        } catch {
          return toolFailure(
            name,
            "MEMORY_UNAVAILABLE",
            "Memory recall is temporarily unavailable; answer without it.",
          );
        }
        return {
          ok: true,
          callID: randomUUID(),
          name,
          data: {
            operation: "recall",
            data_boundary:
              "Accepted, currently authorized Memory only. Private self memory is not returned for another person's scope.",
            items: recalled.items,
          },
        };
      }

      if (runState.memoryProposal) {
        return toolFailure(
          name,
          "MEMORY_PROPOSAL_ALREADY_STAGED",
          "Only one Memory proposal may be staged per turn.",
        );
      }
      const locatorError = memoryLocatorAdmissionError(
        request.items,
        admittedArtifactIds,
      );
      if (locatorError) {
        return toolFailure(
          name,
          "MEMORY_SOURCE_NOT_ADMITTED",
          "Every image region must reference an artifact admitted to this Run.",
        );
      }
      for (const item of request.items) {
        if (
          item.source_locator.kind === "message"
          && !isGroundedExcerpt(item.source_excerpt, input.sourceText ?? input.objective)
        ) {
          return toolFailure(
            name,
            "MEMORY_SOURCE_UNGROUNDED",
            "A message excerpt must be copied from the current user message.",
          );
        }
        if (item.subject_id && !searchResults.has(item.subject_id)) {
          return toolFailure(
            name,
            "MEMORY_SCOPE_NOT_AUTHORIZED",
            "A Memory item may only depend on a contact found in this Run.",
          );
        }
        if (
          item.subject_id
          && item.relationship_context_id
          && !searchResults
            .get(item.subject_id)
            ?.contexts.some((context) => context.id === item.relationship_context_id)
        ) {
          return toolFailure(
            name,
            "MEMORY_SCOPE_NOT_AUTHORIZED",
            "A Memory item may only depend on a same-Run relationship context.",
          );
        }
      }
      const personID = request.person_id ?? null;
      if (personID && !searchResults.has(personID)) {
        return toolFailure(
          name,
          "MEMORY_SCOPE_NOT_AUTHORIZED",
          "The Memory target contact was not found in this Run.",
        );
      }
      const contextID = request.relationship_context_id ?? null;
      if (
        personID
        && contextID
        && !searchResults
          .get(personID)
          ?.contexts.some((context) => context.id === contextID)
      ) {
        return toolFailure(
          name,
          "MEMORY_SCOPE_NOT_AUTHORIZED",
          "The Memory target relationship context was not found in this Run.",
        );
      }
      const target = personID ? searchResults.get(personID)! : null;
      const newContact =
        request.contact_decision === "new"
          ? {
              display_label:
                request.person_display_label ?? target?.displayLabel ?? "",
              relationship_context: "",
              source_locator: (request.new_contact_source_locator ?? null) as MemorySourceLocator | null,
            }
          : null;
      let staged: Awaited<ReturnType<WorkspaceMemoryLookup["stage"]>>;
      try {
        staged = await input.memory.stage({
          surface: "chat",
          personID,
          contextID,
          contactDecision: request.contact_decision,
          newContact,
          sourceMessageID,
          items: request.items,
        });
      } catch {
        // An optional Memory suggestion must never destroy the helpful answer.
        return toolFailure(
          name,
          "MEMORY_UNAVAILABLE",
          "The Memory suggestion is temporarily unavailable; continue answering.",
        );
      }
      if (!staged) {
        return toolFailure(
          name,
          "MEMORY_NO_MATERIAL_CHANGE",
          "There is no new, non-duplicate, grounded change to stage.",
        );
      }
      runState.memoryProposal = staged;
      return {
        ok: true,
        callID: randomUUID(),
        name,
        candidateFingerprint: staged.proposalID,
        data: {
          operation: "propose",
          status: "needs_review",
          proposal_id: staged.proposalID,
          proposal_revision: staged.proposalRevision,
          item_count: staged.itemCount,
          default_selected_count: staged.defaultSelectedCount,
          scope_counts: staged.scopeCounts,
          consequence: "No Memory or contact changed; a human review card was staged.",
        },
      };
    }
    if (name !== "contact_workspace") {
      return toolFailure(
        name,
        "TOOL_NOT_ALLOWED",
        "Only contact_workspace and memory_review are available in this Run.",
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
        ...(input.onVisibleText ? { onVisibleText: input.onVisibleText } : {}),
        ...(input.onProgress ? { onProgress: input.onProgress } : {}),
        objective: input.objective,
        sessionTitleRequested: input.sessionTitleRequested === true,
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
        ...(input.inputParts && input.inputParts.length > 0
          ? { inputParts: input.inputParts }
          : {}),
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
    if (input.sessionTitleRequested && "session_title" in output && output.session_title) {
      providerResult.sessionTitle = output.session_title;
    }
    if (
      runState.proposal && output.outcome !== "contact_change_proposal"
    ) {
      throw new Error(
        "The Agent terminal output did not preserve the contact Tool boundary.",
      );
    }
    if (output.outcome === "reply") {
      // An authorized search/read/recall/stage may still end in a helpful
      // answer. When a contact was uniquely read, its provenance travels as
      // the existing resolved-contact event rather than being dropped.
      const resolvedPerson = runState.readScope
        ? searchResults.get(runState.readScope.personID)
        : undefined;
      const resolvedContext = resolvedPerson?.contexts.find(
        (context) => context.id === runState.readScope!.contextID,
      );
      return {
        block: block("answer", output.title, output.body, false),
        event:
          runState.readScope && resolvedPerson && resolvedContext
            ? {
                kind: "resolved_contact_context",
                person_id: runState.readScope.personID,
                person_display_label: resolvedPerson.displayLabel,
                relationship_context_id: resolvedContext.id,
                relationship_context_display_label: resolvedContext.displayLabel,
                tool_summary: `Contact search · ${resolvedPerson.displayLabel} · ${resolvedContext.displayLabel}`,
              }
            : null,
        memoryProposal: memoryRef(runState.memoryProposal),
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
        memoryProposal: memoryRef(runState.memoryProposal),
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
        memoryProposal: memoryRef(runState.memoryProposal),
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
      memoryProposal: memoryRef(runState.memoryProposal),
      providerResult,
    };
  } finally {
    clearTimeout(timeout);
    input.signal?.removeEventListener("abort", onExternalAbort);
  }
}

export async function executeWorkspaceConversationAgent(input: {
  database: DatabaseClient;
  auth: AuthContext;
  objective: string;
  sourceText?: string;
  provider: AgentProvider;
  sessionID?: string | null;
  messageID?: string;
  sessionTitleRequested?: boolean;
  conversationHistory?: readonly ConversationMessage[];
  runID?: string;
  inputParts?: readonly import("@talent-signal/agent").AgentProviderInputPart[];
  observation?: RuntimeObservationContext;
  continuation?: import("@talent-signal/agent").HarnessContinuationFactory;
  assertCurrent?: () => Promise<void>;
  responsePreference?: import("@talent-signal/agent").ResponsePreference;
  calendarContext?: import("@talent-signal/agent").CalendarDraftContext;
  onVisibleText?: (text: string) => void;
  onProgress?: (stage: AgentVisibleProgressStage) => void;
  signal?: AbortSignal;
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
  const memory: WorkspaceMemoryLookup = {
    recall: async ({ personID, contextID }) => {
      const recalled = await recallMemories(input.database, input.auth, {
        surface: "chat",
        person_id: personID,
        relationship_context_id: contextID,
      });
      return {
        items: recalled.items.map((item) => ({
          id: item.id,
          scope: item.scope,
          display_text: item.display_text,
          version: item.version,
          statement_kind: item.statement_kind,
          evidence_retained: item.evidence_retained,
        })),
      };
    },
    stage: async ({
      personID,
      contextID,
      contactDecision,
      newContact,
      sourceMessageID,
      items,
    }) => {
      const authority: MemorySourceAuthority = {
        text: input.sourceText ?? input.objective,
        artifacts: [
          ...(input.inputParts ?? []).map((part) => ({
            artifactId: part.artifactID,
            kind: part.kind,
            sessionId: input.sessionID ?? null,
            messageId: sourceMessageID,
            captureId: null,
            sourceResourceId: null,
            evidenceFragmentId: null,
            contentHash: part.contentHash,
            captureVersion: null,
          })),
          {
            artifactId: `${input.sessionID ?? "workspace"}:message:${sourceMessageID}`,
            kind: "text" as const,
            sessionId: input.sessionID ?? null,
            messageId: sourceMessageID,
            captureId: null,
            sourceResourceId: null,
            evidenceFragmentId: null,
            contentHash: null,
            captureVersion: null,
          },
        ],
        sessionId: input.sessionID ?? null,
        messageId: sourceMessageID,
        sourceTaskId: input.runID ?? null,
        captureIds: [],
        messageTextHash: sha256(input.sourceText ?? input.objective),
        imageManifest: workspaceImageManifest(input.inputParts ?? []),
        captureVersion: null,
        captureSubjectId: null,
        captureContextId: null,
      };
      const isolated = typeof (input.database as { release?: unknown }).release === "function";
      if (isolated) await input.database.query("SAVEPOINT memory_review_stage");
      let staged: Awaited<ReturnType<typeof stageMemoryProposal>>;
      try {
        staged = await stageMemoryProposal(
          input.database,
          input.auth,
          {
            idempotency_key: randomUUID(),
            surface: "chat",
            session_id: input.sessionID ?? null,
            source_task_id: input.runID ?? null,
            source_message_id: sourceMessageID,
            person_id: personID,
            relationship_context_id: contextID,
            contact_decision: contactDecision,
            new_contact: newContact,
            proposer: {
              kind: "agent",
              name: "workspace-conversation",
              version: "1",
            },
            items: [...items] as MemoryProposalStageRequest["items"],
          },
          authority,
        );
        if (isolated) await input.database.query("RELEASE SAVEPOINT memory_review_stage");
      } catch {
        if (isolated) {
          await input.database.query("ROLLBACK TO SAVEPOINT memory_review_stage");
        }
        return null;
      }
      if (!staged) return null;
      return {
        proposalID: staged.proposal.proposal_id,
        proposalRevision: staged.proposal.revision,
        itemCount: staged.proposal.item_count,
        defaultSelectedCount: staged.proposal.default_selected_count,
        scopeCounts: staged.scopeCounts,
        contactStatus: staged.proposal.contact_status,
        personID: staged.proposal.person_id ?? null,
        personDisplayLabel: staged.proposal.person_display_label ?? null,
      };
    },
  };
  return executeWorkspaceConversationAgentCore({
    objective: input.objective,
    ...(input.sourceText === undefined ? {} : { sourceText: input.sourceText }),
    provider: input.provider,
    workspaceID: input.auth.accountId,
    contacts,
    memory,
    ...(input.runID ? { runID: input.runID } : {}),
    ...(input.observation ? { observation: input.observation } : {}),
    ...(input.continuation ? { continuation: input.continuation } : {}),
        ...(input.assertCurrent ? { assertCurrent: input.assertCurrent } : {}),
        ...(input.responsePreference ? { responsePreference: input.responsePreference } : {}),
        ...(input.calendarContext ? { calendarContext: input.calendarContext } : {}),
    ...(input.onVisibleText ? { onVisibleText: input.onVisibleText } : {}),
    ...(input.onProgress ? { onProgress: input.onProgress } : {}),
    ...(input.signal ? { signal: input.signal } : {}),
    ...(input.inputParts && input.inputParts.length > 0
      ? { inputParts: input.inputParts }
      : {}),
    ...(input.messageID === undefined ? {} : { messageID: input.messageID }),
    ...(input.sessionTitleRequested === undefined ? {} : { sessionTitleRequested: input.sessionTitleRequested }),
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
