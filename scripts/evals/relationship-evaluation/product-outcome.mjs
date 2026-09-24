// Queue persistence is completion evidence only when the admitted turn succeeded.
export function productQueueSettled(queue) {
  return !!queue && (queue.paused || (!queue.active &&
    (!queue.queued.length || queue.queued.some(entry => ['failed', 'interrupted'].includes(entry.status)))));
}

export function productOutcome({queue, readback, messageID, imageBytesMatch}) {
  const failure = queue?.queued?.find(entry => ['failed', 'interrupted'].includes(entry.status));
  if (failure) return {completed: false, error: failure.failure_code ?? `PRODUCT_QUEUE_${failure.status.toUpperCase()}`};
  if (!queue || queue.paused || queue.active || queue.queued.length)
    return {completed: false, error: queue?.paused ? 'PRODUCT_QUEUE_PAUSED' : 'PRODUCT_QUEUE_DID_NOT_COMPLETE'};
  const response = readback?.session?.payload?.turns?.find(turn => turn.id === messageID)?.response;
  if (!response?.taskID) return {completed: false, error: 'PRODUCT_TURN_MISSING'};
  if (response.taskID.startsWith('cancelled-')) return {completed: false, error: 'PRODUCT_TURN_CANCELLED'};
  const blocks = response.unboundConversationBlocks ?? [];
  if (!blocks.length || blocks.some(block => block.status === 'failed'))
    return {completed: false, error: 'PRODUCT_TURN_FAILED_OR_EMPTY'};
  if (imageBytesMatch !== true) return {completed: false, error: 'PRODUCT_IMAGE_READBACK_MISMATCH'};
  return {completed: true};
}
