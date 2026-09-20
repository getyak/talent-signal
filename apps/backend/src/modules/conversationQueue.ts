/**
 * Durable conversation queue.
 *
 * Split by responsibility:
 * - conversationQueueState: storage, claims, leases, fencing, snapshots.
 * - conversationQueueAdmission: admission and client queue mutations.
 * - conversationQueueCompletion: governed lineage + canonical Session write.
 * - conversationQueueRunner: bounded worker and recovery.
 * - conversationQueueSweep: retention and revocation cascade.
 */
export {
  CONVERSATION_QUEUE_LEASE_MS,
  CONVERSATION_QUEUE_MAX_CONCURRENT_RUNS,
  CONVERSATION_QUEUE_MAX_ENTRIES,
  ConversationQueueLeaseLostError,
  allocateConversationQueueSequence,
  assertConversationQueueContextCurrent,
  assertConversationQueueLiveClaim,
  assertConversationQueueOwnedClaim,
  bumpConversationQueueState,
  claimNextConversationQueueEntry,
  finalizeConversationQueueEntry,
  listRunnableConversationQueueSessions,
  listStaleRunningConversationQueueEntries,
  lockConversationQueueSession,
  markConversationQueuePersistencePending,
  readConversationQueueEntryStatus,
  readConversationQueueResult,
  readConversationQueueSnapshot,
  readConversationQueueState,
  reclaimStaleConversationQueueEntry,
  recordConversationQueueResult,
  refreshConversationQueueLease,
  runnerAuthContext,
  type ClaimedConversationQueueEntry,
  type ConversationQueueRunFence,
  type ConversationQueueTerminalStatus,
} from "./conversationQueueState.js";

export {
  CONVERSATION_QUEUE_OPERATION_SCOPE,
  admitConversationQueueEntry,
  mutateConversationQueueEntry,
} from "./conversationQueueAdmission.js";

export {
  persistConversationQueueCancellation,
  persistConversationQueueCompletion,
  recordConversationQueueLineage,
  type ConversationQueueAuditMetadata,
  type ConversationQueueExecutionResult,
} from "./conversationQueueCompletion.js";

export {
  ConversationQueueRunner,
  type ConversationQueueProviderSelection,
  type ConversationQueueProviderSelector,
  type ConversationQueueRunnerLogger,
  type ConversationQueueRunnerOptions,
} from "./conversationQueueRunner.js";

export {
  purgeConversationQueueForAccount,
  sweepConversationQueue,
} from "./conversationQueueSweep.js";
