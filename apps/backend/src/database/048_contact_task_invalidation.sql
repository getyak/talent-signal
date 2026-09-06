CREATE FUNCTION invalidate_contact_task_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.text_content IS DISTINCT FROM OLD.text_content OR NEW.status <> 'active' OR NEW.review_status='rejected' THEN
    DELETE FROM contact_profile_observations WHERE account_id=NEW.account_id AND capture_id=NEW.capture_id;
    UPDATE screenshot_contact_tasks SET state='{}'::jsonb,input_manifest='{}'::jsonb,status='deleted',
      revision=revision+1,lease_epoch=lease_epoch+1,lease_until=NULL,updated_at=now()
      WHERE account_id=NEW.account_id AND capture_id=NEW.capture_id AND status<>'deleted';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER invalidate_contact_task_evidence_trigger
  AFTER UPDATE OF text_content,status,review_status ON evidence_fragments
  FOR EACH ROW EXECUTE FUNCTION invalidate_contact_task_evidence();

CREATE FUNCTION invalidate_contact_task_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status<>'active' OR NEW.subject_id IS DISTINCT FROM OLD.subject_id OR NEW.assignment_id IS DISTINCT FROM OLD.assignment_id THEN
    DELETE FROM contact_profile_observations WHERE account_id=NEW.account_id AND capture_id=NEW.id;
    UPDATE screenshot_contact_tasks SET state='{}'::jsonb,input_manifest='{}'::jsonb,status='deleted',
      revision=revision+1,lease_epoch=lease_epoch+1,lease_until=NULL,updated_at=now()
      WHERE account_id=NEW.account_id AND capture_id=NEW.id AND status<>'deleted';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER invalidate_contact_task_scope_trigger
  AFTER UPDATE OF subject_id,assignment_id,status ON captures
  FOR EACH ROW EXECUTE FUNCTION invalidate_contact_task_scope();

CREATE TABLE contact_archive_operations (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  decided_by_user_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  prior_revision integer NOT NULL,
  archived_revision integer NOT NULL,
  status text NOT NULL CHECK (status IN ('archived','restored')),
  created_at timestamptz NOT NULL DEFAULT now(),
  restored_at timestamptz,
  UNIQUE(account_id,id),
  UNIQUE(account_id,decided_by_user_id,idempotency_key),
  FOREIGN KEY(account_id,subject_id) REFERENCES subjects(account_id,id),
  FOREIGN KEY(account_id,decided_by_user_id) REFERENCES users(account_id,id)
);
