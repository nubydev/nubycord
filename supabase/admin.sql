-- ============================================================
-- Create your admin account
-- Run this in Supabase: SQL Editor -> New Query -> Run
-- STEP 1: Replace 'YourPasswordHere' with your real password
-- STEP 2: Click Run — your mutex will appear in the Results tab
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Helper function to generate a random alphanumeric mutex
-- Format: XXXXXX-XXXXXXX-XXXXXX-XXXXXXX-XXXXXX (36 chars)
CREATE OR REPLACE FUNCTION _gen_mutex() RETURNS TEXT AS $$
DECLARE
    chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    seg   TEXT;
    res   TEXT := '';
    sizes INT[] := ARRAY[6, 7, 6, 7, 6];
    i     INT;
    j     INT;
BEGIN
    FOR i IN 1..array_length(sizes, 1) LOOP
        seg := '';
        FOR j IN 1..sizes[i] LOOP
            seg := seg || substr(chars, floor(random() * 36 + 1)::int, 1);
        END LOOP;
        IF i = 1 THEN res := seg;
        ELSE res := res || '-' || seg;
        END IF;
    END LOOP;
    RETURN res;
END;
$$ LANGUAGE plpgsql;

-- Insert admin — CHANGE THE PASSWORD BELOW
INSERT INTO nubycord_users (mutex, password_hash, is_admin, created_by)
VALUES (
    _gen_mutex(),
    crypt('Evolv999#$', gen_salt('bf', 12)),
    true,
    'bootstrap'
)
RETURNING mutex AS "Your Mutex (save this!)", is_admin, created_at;


-- After running the above, uncomment and run this to fix RLS policy issue

-- ALTER TABLE nubycord_users DISABLE ROW LEVEL SECURITY;