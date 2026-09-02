CREATE TABLE reviewed_person_public_profiles (
  account_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  source_resource_id uuid NOT NULL,
  confirmed_by_user_id uuid NOT NULL,
  result_id text NOT NULL CHECK (char_length(result_id) BETWEEN 1 AND 128),
  provider_id text NOT NULL CHECK (char_length(provider_id) BETWEEN 1 AND 120),
  platform text NOT NULL CHECK (char_length(platform) BETWEEN 1 AND 80),
  profile_url text NOT NULL CHECK (
    char_length(profile_url) BETWEEN 1 AND 2000
    AND profile_url ~ '^https://'
  ),
  display_name text NOT NULL CHECK (
    char_length(display_name) BETWEEN 1 AND 200
  ),
  handle text CHECK (handle IS NULL OR char_length(handle) BETWEEN 1 AND 200),
  avatar_url text CHECK (
    avatar_url IS NULL OR (
      char_length(avatar_url) BETWEEN 1 AND 2000
      AND avatar_url ~ '^https://'
    )
  ),
  avatar_rights_basis text CHECK (
    avatar_rights_basis IS NULL OR avatar_rights_basis IN (
      'provider_display_license',
      'profile_owner_consent'
    )
  ),
  verified boolean,
  match_basis text NOT NULL CHECK (
    char_length(match_basis) BETWEEN 1 AND 1000
  ),
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  retrieved_at timestamptz NOT NULL,
  card_headline text CHECK (
    card_headline IS NULL OR char_length(card_headline) BETWEEN 1 AND 240
  ),
  use_avatar boolean NOT NULL DEFAULT false CHECK (
    use_avatar = false OR (
      avatar_url IS NOT NULL AND avatar_rights_basis IS NOT NULL
    )
  ),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, subject_id),
  FOREIGN KEY (account_id, subject_id)
    REFERENCES subjects(account_id, id),
  FOREIGN KEY (account_id, source_resource_id)
    REFERENCES source_resources(account_id, id),
  FOREIGN KEY (account_id, confirmed_by_user_id)
    REFERENCES users(account_id, id)
);

CREATE INDEX reviewed_person_public_profiles_source_idx
  ON reviewed_person_public_profiles(account_id, source_resource_id);
