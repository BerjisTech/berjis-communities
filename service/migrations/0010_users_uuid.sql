-- Switch user references to UUID (safe phase-1). Existing numeric values will become NULL for impacted rows.

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='posts' AND column_name='user_id' AND data_type <> 'uuid'
  ) THEN
    BEGIN
      ALTER TABLE posts ALTER COLUMN user_id DROP NOT NULL;
    EXCEPTION WHEN others THEN NULL; END;
    ALTER TABLE posts ALTER COLUMN user_id TYPE uuid USING NULL::uuid;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='post_comments' AND column_name='user_id' AND data_type <> 'uuid'
  ) THEN
    BEGIN
      ALTER TABLE post_comments ALTER COLUMN user_id DROP NOT NULL;
    EXCEPTION WHEN others THEN NULL; END;
    ALTER TABLE post_comments ALTER COLUMN user_id TYPE uuid USING NULL::uuid;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='community_members' AND column_name='user_id' AND data_type <> 'uuid'
  ) THEN
    BEGIN
      ALTER TABLE community_members ALTER COLUMN user_id DROP NOT NULL;
    EXCEPTION WHEN others THEN NULL; END;
    ALTER TABLE community_members ALTER COLUMN user_id TYPE uuid USING NULL::uuid;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='group_members' AND column_name='user_id' AND data_type <> 'uuid'
  ) THEN
    BEGIN
      ALTER TABLE group_members ALTER COLUMN user_id DROP NOT NULL;
    EXCEPTION WHEN others THEN NULL; END;
    ALTER TABLE group_members ALTER COLUMN user_id TYPE uuid USING NULL::uuid;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='group_owners' AND column_name='user_id' AND data_type <> 'uuid'
  ) THEN
    BEGIN
      ALTER TABLE group_owners ALTER COLUMN user_id DROP NOT NULL;
    EXCEPTION WHEN others THEN NULL; END;
    ALTER TABLE group_owners ALTER COLUMN user_id TYPE uuid USING NULL::uuid;
  END IF;
END $$;

-- Phase-2 tables intentionally skipped here because user_id participates in primary keys:
-- post_likes, post_reactions, community_bans, group_bans
