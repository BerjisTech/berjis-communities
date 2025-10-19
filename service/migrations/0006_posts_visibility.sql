-- Add visibility to posts for generic public/private control
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public';

