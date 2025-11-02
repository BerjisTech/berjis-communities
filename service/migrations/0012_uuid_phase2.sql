-- Phase 2: enforce UUIDs and clean legacy rows in PK tables and add NOT NULLs

-- Clean legacy rows with NULL/invalid user_id across tables we converted in phase 1
DELETE FROM post_comments WHERE user_id IS NULL;
DELETE FROM community_members WHERE user_id IS NULL;
DELETE FROM group_members WHERE user_id IS NULL;
DELETE FROM group_owners WHERE user_id IS NULL;
DELETE FROM posts WHERE user_id IS NULL;

-- post_likes
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='post_likes' AND column_name='user_id' AND data_type <> 'uuid') THEN
    BEGIN
      ALTER TABLE post_likes DROP CONSTRAINT IF EXISTS post_likes_pkey;
    EXCEPTION WHEN others THEN NULL; END;
    -- Delete legacy rows that cannot be mapped
    DELETE FROM post_likes WHERE user_id IS NULL;
    ALTER TABLE post_likes ALTER COLUMN user_id TYPE uuid USING NULL::uuid;
    ALTER TABLE post_likes ALTER COLUMN user_id SET NOT NULL;
    ALTER TABLE post_likes ADD PRIMARY KEY (post_id, user_id);
  END IF;
END $$;

-- post_reactions
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='post_reactions' AND column_name='user_id' AND data_type <> 'uuid') THEN
    BEGIN
      ALTER TABLE post_reactions DROP CONSTRAINT IF EXISTS post_reactions_pkey;
    EXCEPTION WHEN others THEN NULL; END;
    DELETE FROM post_reactions WHERE user_id IS NULL;
    ALTER TABLE post_reactions ALTER COLUMN user_id TYPE uuid USING NULL::uuid;
    ALTER TABLE post_reactions ALTER COLUMN user_id SET NOT NULL;
    ALTER TABLE post_reactions ADD PRIMARY KEY (post_id, user_id, emoji);
  END IF;
END $$;

-- community_bans
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='community_bans' AND column_name='user_id' AND data_type <> 'uuid') THEN
    BEGIN
      ALTER TABLE community_bans DROP CONSTRAINT IF EXISTS community_bans_pkey;
    EXCEPTION WHEN others THEN NULL; END;
    DELETE FROM community_bans WHERE user_id IS NULL;
    ALTER TABLE community_bans ALTER COLUMN user_id TYPE uuid USING NULL::uuid;
    ALTER TABLE community_bans ALTER COLUMN user_id SET NOT NULL;
    ALTER TABLE community_bans ADD PRIMARY KEY (community_id, user_id);
  END IF;
END $$;

-- group_bans
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='group_bans' AND column_name='user_id' AND data_type <> 'uuid') THEN
    BEGIN
      ALTER TABLE group_bans DROP CONSTRAINT IF EXISTS group_bans_pkey;
    EXCEPTION WHEN others THEN NULL; END;
    DELETE FROM group_bans WHERE user_id IS NULL;
    ALTER TABLE group_bans ALTER COLUMN user_id TYPE uuid USING NULL::uuid;
    ALTER TABLE group_bans ALTER COLUMN user_id SET NOT NULL;
    ALTER TABLE group_bans ADD PRIMARY KEY (group_id, user_id);
  END IF;
END $$;

-- Enforce NOT NULL for user_id on main tables now that UUID is in place
DO $$ BEGIN BEGIN ALTER TABLE posts ALTER COLUMN user_id SET NOT NULL; EXCEPTION WHEN others THEN NULL; END; END $$;
DO $$ BEGIN BEGIN ALTER TABLE post_comments ALTER COLUMN user_id SET NOT NULL; EXCEPTION WHEN others THEN NULL; END; END $$;
DO $$ BEGIN BEGIN ALTER TABLE community_members ALTER COLUMN user_id SET NOT NULL; EXCEPTION WHEN others THEN NULL; END; END $$;
DO $$ BEGIN BEGIN ALTER TABLE group_members ALTER COLUMN user_id SET NOT NULL; EXCEPTION WHEN others THEN NULL; END; END $$;
DO $$ BEGIN BEGIN ALTER TABLE group_owners ALTER COLUMN user_id SET NOT NULL; EXCEPTION WHEN others THEN NULL; END; END $$;

