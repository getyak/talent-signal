-- GET-49 controllable supplement: prioritize may stop a live run and still
-- continue into the chosen queued message. A plain user stop must keep pausing
-- the queue so later work never runs on incomplete premises.

ALTER TABLE conversation_queue_entries
  ADD COLUMN cancel_auto_continue boolean NOT NULL DEFAULT false;
