-- Direct messages between users (UUID-based, no FK to core users table)
CREATE TABLE IF NOT EXISTS user_messages (
  id BIGSERIAL PRIMARY KEY,
  sender_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_messages_pair_created
  ON user_messages (LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id), created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_messages_recipient_unread
  ON user_messages (recipient_id, read_at)
  WHERE read_at IS NULL;

-- Per-user Communities preferences (keeps user data in core; this is scoped to communities behavior)
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id uuid PRIMARY KEY,
  -- global content visibility preference when posting standalone content:
  -- public | private | followers | subscribers | paid
  default_visibility TEXT NOT NULL DEFAULT 'public',
  -- hashed/normalized communities username (display only; core keeps canonical identity)
  communities_handle TEXT UNIQUE,
  -- moderation and safety knobs
  filtered_words TEXT[] NOT NULL DEFAULT '{}',
  filtered_phrases TEXT[] NOT NULL DEFAULT '{}',
  blocked_user_ids uuid[] NOT NULL DEFAULT '{}',
  -- whether to allow DMs from: anyone | followers | none
  dm_policy TEXT NOT NULL DEFAULT 'anyone',
  -- monetization flags (actual billing lives in Core/Billing)
  monetization_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  allow_paid_only_posts BOOLEAN NOT NULL DEFAULT FALSE,
  allow_subscriber_only_posts BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

