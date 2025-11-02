-- Switch user references to UUID (dev-safe). Existing numeric values will become NULL.
ALTER TABLE community_members ALTER COLUMN user_id TYPE uuid USING NULL;
ALTER TABLE posts ALTER COLUMN user_id TYPE uuid USING NULL;
ALTER TABLE post_likes ALTER COLUMN user_id TYPE uuid USING NULL;
ALTER TABLE post_reactions ALTER COLUMN user_id TYPE uuid USING NULL;
ALTER TABLE community_bans ALTER COLUMN user_id TYPE uuid USING NULL;
-- Groups
ALTER TABLE group_members ALTER COLUMN user_id TYPE uuid USING NULL;
ALTER TABLE group_owners ALTER COLUMN user_id TYPE uuid USING NULL;
ALTER TABLE group_bans ALTER COLUMN user_id TYPE uuid USING NULL;
-- Comments
ALTER TABLE post_comments ALTER COLUMN user_id TYPE uuid USING NULL;
