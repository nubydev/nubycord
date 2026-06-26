-- Nubycord Supabase Setup
-- Run this in your Supabase project: SQL Editor -> New Query -> Paste & Run

-- ============================================================
-- TABLE: nubycord_users
-- Stores all users (admins and regular license-key users)
-- ============================================================

CREATE TABLE IF NOT EXISTS nubycord_users (
    id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    mutex         TEXT        NOT NULL UNIQUE,
    password_hash TEXT,
    display_name  TEXT,
    is_admin      BOOLEAN     DEFAULT FALSE,
    created_by    TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- If upgrading an existing project, add the display_name column:
-- ALTER TABLE nubycord_users ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Index for fast mutex lookups (used on every login)
CREATE UNIQUE INDEX IF NOT EXISTS nubycord_users_mutex_idx
    ON nubycord_users (mutex);

-- Index for admin existence checks
CREATE INDEX IF NOT EXISTS nubycord_users_is_admin_idx
    ON nubycord_users (is_admin);

-- ============================================================
-- ROW LEVEL SECURITY
-- This app manages its own auth server-side.
-- RLS is disabled so the server can read/write regardless of key type.
-- ============================================================

ALTER TABLE nubycord_users DISABLE ROW LEVEL SECURITY;
