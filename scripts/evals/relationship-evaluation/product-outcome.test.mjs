import test from 'node:test';
import assert from 'node:assert/strict';
import {productOutcome, productQueueSettled} from './product-outcome.mjs';

const base = () => ({queue: {active: null, queued: [], paused: false}, messageID: 'admitted', imageBytesMatch: true,
  readback: {session: {payload: {turns: [{id: 'admitted', response: {taskID: 'actual-task', unboundConversationBlocks: [{status: 'informational'}]}}]}}}});

test('only matching successful persisted turn and exact image can complete', () => {
  assert.deepEqual(productOutcome(base()), {completed: true});
  const other = base(); other.readback.session.payload.turns[0].id = 'different-message';
  assert.equal(productOutcome(other).error, 'PRODUCT_TURN_MISSING');
  const mismatch = base(); mismatch.imageBytesMatch = false;
  assert.equal(productOutcome(mismatch).error, 'PRODUCT_IMAGE_READBACK_MISMATCH');
});
test('cancelled turn cannot pass even after disappearing from queue', () => {
  const report = base(); report.readback.session.payload.turns[0].response.taskID = 'cancelled-admitted';
  assert.equal(productOutcome(report).error, 'PRODUCT_TURN_CANCELLED');
});
test('failed or empty answer blocks cannot pass', () => {
  for (const blocks of [[], [{status: 'failed'}], [{status: 'informational'}, {status: 'failed'}]]) {
    const report = base(); report.readback.session.payload.turns[0].response.unboundConversationBlocks = blocks;
    assert.equal(productOutcome(report).error, 'PRODUCT_TURN_FAILED_OR_EMPTY');
  }
});
test('runner interruption and paused queues end promptly without losing reason', () => {
  const report = base(); report.queue = {active: null, paused: true, queued: [{status: 'interrupted', failure_code: 'RUNNER_INTERRUPTED'}]};
  assert.equal(productQueueSettled(report.queue), true);
  assert.deepEqual(productOutcome(report), {completed: false, error: 'RUNNER_INTERRUPTED'});
  report.queue.queued = [];
  assert.equal(productOutcome(report).error, 'PRODUCT_QUEUE_PAUSED');
});
test('running and queued work remain incomplete; failed queue retains provider reason', () => {
  const report = base(); report.queue.active = {status: 'running'};
  assert.equal(productQueueSettled(report.queue), false);
  assert.equal(productOutcome(report).completed, false);
  report.queue.active = null; report.queue.queued = [{status: 'queued'}];
  assert.equal(productQueueSettled(report.queue), false);
  assert.equal(productOutcome(report).completed, false);
  report.queue.queued = [{status: 'failed', failure_code: 'MODEL_RUN_FAILED'}];
  assert.equal(productQueueSettled(report.queue), true);
  assert.equal(productOutcome(report).error, 'MODEL_RUN_FAILED');
});
