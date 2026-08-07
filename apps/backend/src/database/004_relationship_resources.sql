CREATE TABLE source_resources (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  capture_id uuid NOT NULL,
  created_by_user_id uuid NOT NULL,
  client_resource_id text NOT NULL,
  resource_kind text NOT NULL CHECK (
    resource_kind IN (
      'conversation_screenshot',
      'conversation_transcript',
      'resume',
      'document',
      'public_url',
      'personal_note',
      'contact_record'
    )
  ),
  input_channel text NOT NULL CHECK (
    input_channel IN (
      'chat',
      'web_upload',
      'browser_extension',
      'ios_share',
      'api_connector'
    )
  ),
  display_name text NOT NULL,
  media_type text NOT NULL,
  content_hash text,
  source_locator text,
  payload_ref text,
  discovered_from_resource_id uuid,
  observed_at timestamptz NOT NULL,
  source_timezone text,
  retention_scope text NOT NULL,
  retention_until timestamptz,
  processing_state text NOT NULL DEFAULT 'received' CHECK (
    processing_state IN (
      'received',
      'parsing',
      'needs_identity_review',
      'needs_fact_review',
      'ready',
      'failed',
      'deleted'
    )
  ),
  sensitivity text NOT NULL DEFAULT 'restricted' CHECK (
    sensitivity IN ('normal', 'restricted', 'highly_restricted')
  ),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  UNIQUE (account_id, capture_id, client_resource_id),
  FOREIGN KEY (account_id, capture_id)
    REFERENCES captures(account_id, id),
  FOREIGN KEY (account_id, created_by_user_id)
    REFERENCES users(account_id, id),
  FOREIGN KEY (account_id, discovered_from_resource_id)
    REFERENCES source_resources(account_id, id)
);

CREATE INDEX source_resources_capture_idx
  ON source_resources(account_id, capture_id, created_at);

CREATE INDEX source_resources_content_hash_idx
  ON source_resources(account_id, content_hash)
  WHERE content_hash IS NOT NULL AND processing_state <> 'deleted';

CREATE TABLE evidence_fragments (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  capture_id uuid NOT NULL,
  resource_id uuid NOT NULL,
  fragment_kind text NOT NULL CHECK (
    fragment_kind IN (
      'message',
      'page_text',
      'document_region',
      'url_excerpt',
      'note_revision',
      'contact_field'
    )
  ),
  sequence integer NOT NULL CHECK (sequence >= 0),
  text_content text,
  content_hash text NOT NULL,
  locator jsonb NOT NULL,
  attributed_actor text NOT NULL CHECK (
    attributed_actor IN (
      'candidate',
      'recruiter',
      'client',
      'document_author',
      'public_source',
      'unknown'
    )
  ),
  attribution_status text NOT NULL CHECK (
    attribution_status IN ('confirmed', 'proposed', 'unknown')
  ),
  parser_name text NOT NULL,
  parser_version text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'purged', 'deleted')
  ),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  UNIQUE (account_id, resource_id, sequence),
  FOREIGN KEY (account_id, capture_id)
    REFERENCES captures(account_id, id),
  FOREIGN KEY (account_id, resource_id)
    REFERENCES source_resources(account_id, id)
);

CREATE INDEX evidence_fragments_resource_idx
  ON evidence_fragments(account_id, resource_id, sequence)
  WHERE status = 'active';

CREATE TABLE identity_handles (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  handle_type text NOT NULL CHECK (
    handle_type IN (
      'email',
      'phone',
      'wechat',
      'linkedin_url',
      'public_profile_url',
      'source_native_id'
    )
  ),
  normalized_value_hash text NOT NULL,
  display_hint text,
  source_resource_id uuid,
  status text NOT NULL DEFAULT 'proposed' CHECK (
    status IN ('proposed', 'confirmed', 'revoked', 'deleted')
  ),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  confirmed_by_user_id uuid,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, subject_id)
    REFERENCES subjects(account_id, id),
  FOREIGN KEY (account_id, source_resource_id)
    REFERENCES source_resources(account_id, id),
  FOREIGN KEY (account_id, confirmed_by_user_id)
    REFERENCES users(account_id, id)
);

CREATE UNIQUE INDEX identity_handles_one_confirmed_owner_idx
  ON identity_handles(account_id, handle_type, normalized_value_hash)
  WHERE status = 'confirmed';

CREATE INDEX identity_handles_subject_idx
  ON identity_handles(account_id, subject_id, handle_type)
  WHERE status IN ('proposed', 'confirmed');

CREATE TABLE identity_resolution_cases (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  capture_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'resolved', 'dismissed', 'superseded', 'deleted')
  ),
  reason text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  resolved_subject_id uuid,
  resolved_assignment_id uuid,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  UNIQUE (account_id, capture_id),
  FOREIGN KEY (account_id, capture_id)
    REFERENCES captures(account_id, id),
  FOREIGN KEY (account_id, resolved_subject_id)
    REFERENCES subjects(account_id, id),
  FOREIGN KEY (account_id, resolved_assignment_id)
    REFERENCES assignments(account_id, id)
);

CREATE TABLE identity_resolution_candidates (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  case_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  match_reasons jsonb NOT NULL,
  candidate_order integer NOT NULL CHECK (candidate_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  UNIQUE (account_id, case_id, subject_id),
  FOREIGN KEY (account_id, case_id)
    REFERENCES identity_resolution_cases(account_id, id),
  FOREIGN KEY (account_id, subject_id)
    REFERENCES subjects(account_id, id)
);

CREATE TABLE identity_resolution_decisions (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  case_id uuid NOT NULL,
  decided_by_user_id uuid NOT NULL,
  decision text NOT NULL CHECK (
    decision IN (
      'bind_existing',
      'create_new',
      'leave_unresolved',
      'dismiss_capture'
    )
  ),
  selected_subject_id uuid,
  selected_assignment_id uuid,
  case_version integer NOT NULL CHECK (case_version > 0),
  reason text NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, case_id)
    REFERENCES identity_resolution_cases(account_id, id),
  FOREIGN KEY (account_id, decided_by_user_id)
    REFERENCES users(account_id, id),
  FOREIGN KEY (account_id, selected_subject_id)
    REFERENCES subjects(account_id, id),
  FOREIGN KEY (account_id, selected_assignment_id)
    REFERENCES assignments(account_id, id)
);

CREATE TABLE research_tasks (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  assignment_id uuid,
  created_by_user_id uuid NOT NULL,
  purpose text NOT NULL,
  seed_urls jsonb NOT NULL,
  allowed_domains jsonb NOT NULL,
  maximum_link_depth integer NOT NULL CHECK (
    maximum_link_depth >= 0 AND maximum_link_depth <= 2
  ),
  maximum_page_count integer NOT NULL CHECK (
    maximum_page_count > 0 AND maximum_page_count <= 100
  ),
  freshness_horizon interval NOT NULL,
  authorization_scope text NOT NULL,
  status text NOT NULL DEFAULT 'proposed' CHECK (
    status IN (
      'proposed',
      'approved',
      'running',
      'completed',
      'partial',
      'failed',
      'cancelled',
      'expired',
      'deleted'
    )
  ),
  approved_by_user_id uuid,
  approved_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, subject_id)
    REFERENCES subjects(account_id, id),
  FOREIGN KEY (account_id, assignment_id)
    REFERENCES assignments(account_id, id),
  FOREIGN KEY (account_id, created_by_user_id)
    REFERENCES users(account_id, id),
  FOREIGN KEY (account_id, approved_by_user_id)
    REFERENCES users(account_id, id)
);

CREATE TABLE research_snapshots (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  task_id uuid NOT NULL,
  resource_id uuid NOT NULL,
  canonical_url text NOT NULL,
  content_hash text NOT NULL,
  retrieved_at timestamptz NOT NULL,
  freshness_until timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'stale', 'retracted', 'deleted')
  ),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  UNIQUE (account_id, task_id, canonical_url, content_hash),
  FOREIGN KEY (account_id, task_id)
    REFERENCES research_tasks(account_id, id),
  FOREIGN KEY (account_id, resource_id)
    REFERENCES source_resources(account_id, id)
);

CREATE TABLE knowledge_snapshots (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  assignment_id uuid,
  source_state_cursor bigint NOT NULL CHECK (source_state_cursor >= 0),
  compiler_name text NOT NULL,
  compiler_version text NOT NULL,
  policy_version text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'published', 'abstained', 'superseded', 'deleted')
  ),
  quality jsonb NOT NULL,
  deleted_at timestamptz,
  compiled_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, subject_id)
    REFERENCES subjects(account_id, id),
  FOREIGN KEY (account_id, assignment_id)
    REFERENCES assignments(account_id, id)
);

CREATE UNIQUE INDEX knowledge_snapshots_one_published_context_idx
  ON knowledge_snapshots(account_id, subject_id, assignment_id)
  WHERE status = 'published' AND assignment_id IS NOT NULL;

CREATE UNIQUE INDEX knowledge_snapshots_one_published_person_idx
  ON knowledge_snapshots(account_id, subject_id)
  WHERE status = 'published' AND assignment_id IS NULL;

CREATE TABLE knowledge_blocks (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  snapshot_id uuid NOT NULL,
  block_key text NOT NULL,
  block_type text NOT NULL CHECK (
    block_type IN (
      'identity_context',
      'current_dependency',
      'decision_driver',
      'constraint',
      'commitment',
      'deadline',
      'meaningful_change',
      'open_question',
      'conflict',
      'professional_history',
      'sourced_research',
      'relationship_history',
      'observed_outcome',
      'next_action',
      'no_action'
    )
  ),
  status text NOT NULL CHECK (
    status IN (
      'proposed',
      'confirmed',
      'contested',
      'expired',
      'superseded',
      'deleted'
    )
  ),
  structured_content jsonb NOT NULL,
  valid_from timestamptz,
  valid_until timestamptz,
  freshness_until timestamptz,
  sensitivity text NOT NULL CHECK (
    sensitivity IN ('normal', 'restricted', 'highly_restricted')
  ),
  semantic_hash text NOT NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  UNIQUE (account_id, snapshot_id, block_key),
  FOREIGN KEY (account_id, snapshot_id)
    REFERENCES knowledge_snapshots(account_id, id)
);

CREATE TABLE knowledge_dependencies (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  block_id uuid NOT NULL,
  dependency_type text NOT NULL CHECK (
    dependency_type IN (
      'evidence_fragment',
      'fact_version',
      'research_snapshot',
      'observed_outcome',
      'approved_procedure'
    )
  ),
  dependency_id uuid NOT NULL,
  inclusion_reason text NOT NULL,
  authorization_scope text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  UNIQUE (account_id, block_id, dependency_type, dependency_id),
  FOREIGN KEY (account_id, block_id)
    REFERENCES knowledge_blocks(account_id, id)
);

CREATE TABLE context_manifests (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  task_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  assignment_id uuid,
  knowledge_snapshot_id uuid NOT NULL,
  objective text NOT NULL,
  authorization_scope text NOT NULL,
  policy_version text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'superseded', 'expired', 'deleted')
  ),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  UNIQUE (account_id, task_id),
  FOREIGN KEY (account_id, subject_id)
    REFERENCES subjects(account_id, id),
  FOREIGN KEY (account_id, assignment_id)
    REFERENCES assignments(account_id, id),
  FOREIGN KEY (account_id, knowledge_snapshot_id)
    REFERENCES knowledge_snapshots(account_id, id)
);

CREATE TABLE context_manifest_blocks (
  account_id uuid NOT NULL,
  manifest_id uuid NOT NULL,
  block_id uuid NOT NULL,
  inclusion_reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, manifest_id, block_id),
  FOREIGN KEY (account_id, manifest_id)
    REFERENCES context_manifests(account_id, id),
  FOREIGN KEY (account_id, block_id)
    REFERENCES knowledge_blocks(account_id, id)
);

CREATE TABLE context_manifest_evidence (
  account_id uuid NOT NULL,
  manifest_id uuid NOT NULL,
  evidence_fragment_id uuid NOT NULL,
  inclusion_reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, manifest_id, evidence_fragment_id),
  FOREIGN KEY (account_id, manifest_id)
    REFERENCES context_manifests(account_id, id),
  FOREIGN KEY (account_id, evidence_fragment_id)
    REFERENCES evidence_fragments(account_id, id)
);
