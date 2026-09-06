-- Object identities survive task invalidation so failed purges remain retryable.
CREATE TABLE contact_task_images (
  account_id uuid NOT NULL,
  task_id uuid NOT NULL,
  image_index integer NOT NULL CHECK (image_index BETWEEN 0 AND 9),
  object_key text NOT NULL UNIQUE,
  storage_scope text NOT NULL,
  media_type text NOT NULL CHECK (media_type IN ('image/png','image/jpeg','image/webp')),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 10000000),
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','stored','purge_pending','deleted')),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (account_id,task_id,image_index),
  FOREIGN KEY (account_id,task_id) REFERENCES screenshot_contact_tasks(account_id,id)
);
CREATE INDEX contact_task_images_cleanup_idx ON contact_task_images(status,expires_at)
  WHERE status <> 'deleted';

CREATE FUNCTION invalidate_contact_task_images() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status='deleted' THEN
    UPDATE contact_task_images SET status='purge_pending'
      WHERE account_id=NEW.account_id AND task_id=NEW.id AND status<>'deleted';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER invalidate_contact_task_images_trigger
  AFTER UPDATE OF status ON screenshot_contact_tasks
  FOR EACH ROW EXECUTE FUNCTION invalidate_contact_task_images();
