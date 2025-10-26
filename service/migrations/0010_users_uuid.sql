-- Switch user references to UUID (dev-safe). Existing numeric values will become NULL.
ALTER TABLE community_members ALTER COLUMN user_id TYPE uuid USING NULL;
ALTER TABLE posts ALTER COLUMN user_id TYPE uuid USING NULL;
ALTER TABLE post_likes ALTER COLUMN user_id TYPE uuid USING NULL;
ALTER TABLE post_reactions ALTER COLUMN user_id TYPE uuid USING NULL;
ALTER TABLE community_bans ALTER COLUMN user_id TYPE uuid USING NULL;

