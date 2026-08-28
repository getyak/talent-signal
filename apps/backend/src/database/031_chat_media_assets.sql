CREATE TABLE chat_media_assets (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  assignment_id uuid NOT NULL,
  created_by_user_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  file_name text NOT NULL,
  media_type text NOT NULL CHECK (
    media_type IN (
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/heic',
      'image/heif'
    )
  ),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 8388608),
  width integer CHECK (width BETWEEN 1 AND 20000),
  height integer CHECK (height BETWEEN 1 AND 20000),
  storage_provider text NOT NULL CHECK (storage_provider IN ('local', 's3')),
  object_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'ready', 'failed', 'deleted')
  ),
  failure_reason text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  UNIQUE (account_id, idempotency_key),
  UNIQUE (storage_provider, object_key),
  FOREIGN KEY (account_id, subject_id)
    REFERENCES subjects(account_id, id),
  FOREIGN KEY (account_id, assignment_id)
    REFERENCES assignments(account_id, id),
  FOREIGN KEY (account_id, created_by_user_id)
    REFERENCES users(account_id, id)
);

CREATE INDEX chat_media_assets_scope_idx
  ON chat_media_assets(account_id, subject_id, assignment_id, created_at)
  WHERE status <> 'deleted';

CREATE TABLE context_manifest_media (
  account_id uuid NOT NULL,
  manifest_id uuid NOT NULL,
  media_id uuid NOT NULL,
  sequence integer NOT NULL CHECK (sequence BETWEEN 0 AND 9),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, manifest_id, media_id),
  UNIQUE (account_id, manifest_id, sequence),
  UNIQUE (account_id, media_id),
  FOREIGN KEY (account_id, manifest_id)
    REFERENCES context_manifests(account_id, id),
  FOREIGN KEY (account_id, media_id)
    REFERENCES chat_media_assets(account_id, id)
);
