-- Follows graph (UUID-based, no FK to core users table)
CREATE TABLE IF NOT EXISTS user_follows (
  follower_id uuid NOT NULL,
  followee_id uuid NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_follows_pk PRIMARY KEY (follower_id, followee_id),
  CONSTRAINT user_follows_not_self CHECK (follower_id <> followee_id)
);

CREATE INDEX IF NOT EXISTS idx_user_follows_followee ON user_follows(followee_id);
CREATE INDEX IF NOT EXISTS idx_user_follows_follower ON user_follows(follower_id);

