-- Community bans and basic moderation tables
CREATE TABLE IF NOT EXISTS community_bans (
  community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, user_id)
);

