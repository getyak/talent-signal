-- Inline conversation image attachments for the durable queue.
--
-- Bytes are held in PostgreSQL on purpose: admission commits the ordered
-- manifest and the exact pixels in one transaction, so a replayed receipt can
-- always reload the same bytes without a second client upload. The rows are
-- bound to the owning Session and queue entry and cascade on deletion, source
-- revocation, account purge and lab reset. Completed entries scrub their
-- objective but keep their attachments until the Session expires or is
-- deleted, so server history and reloads retain the original images.
CREATE TABLE conversation_message_images (
  account_id uuid NOT NULL,
  session_id uuid NOT NULL,
  message_id uuid NOT NULL,
  queue_entry_id uuid NOT NULL,
  image_index integer NOT NULL CHECK (image_index BETWEEN 0 AND 9),
  attachment_id uuid NOT NULL,
  file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 200),
  media_type text NOT NULL CHECK (media_type IN ('image/png','image/jpeg','image/webp')),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 10000000),
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  content bytea NOT NULL CHECK (octet_length(content) = byte_size),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, queue_entry_id, image_index),
  UNIQUE (account_id, queue_entry_id, attachment_id),
  FOREIGN KEY (account_id, queue_entry_id)
    REFERENCES conversation_queue_entries(account_id, id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_sessions(account_id, id) ON DELETE CASCADE
);
CREATE INDEX conversation_message_images_session_idx
  ON conversation_message_images(account_id, session_id, message_id, image_index);

-- An images-only message has an empty objective but still commits a non-null
-- text value, so only the length floor changes. A separate manifest hash pins
-- the immutable ordered manifest for changed-bytes/order conflict detection.
ALTER TABLE conversation_queue_entries
  DROP CONSTRAINT conversation_queue_entries_objective_check;
ALTER TABLE conversation_queue_entries
  ADD CONSTRAINT conversation_queue_entries_objective_check
  CHECK (objective IS NULL OR length(objective) <= 1000);
ALTER TABLE conversation_queue_entries
  ADD COLUMN images_hash text CHECK (images_hash IS NULL OR images_hash ~ '^[a-f0-9]{64}$');

-- Test workspaces fail closed whenever a new table is not explicitly covered.
INSERT INTO lab_test_workspace_table_manifest(table_name,scope)
VALUES ('conversation_message_images','account');
CREATE TRIGGER lab_test_workspace_write_guard
  BEFORE INSERT OR UPDATE ON conversation_message_images
  FOR EACH ROW EXECUTE FUNCTION lab_test_workspace_write_guard();
