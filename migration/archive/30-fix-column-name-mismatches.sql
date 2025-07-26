-- Migration 30: Fix Column Name Mismatches
-- Fix database functions to use correct column names that exist in the schema

-- Drop existing functions first
DROP FUNCTION IF EXISTS increment_daily_reviews(UUID);
DROP FUNCTION IF EXISTS get_user_tier(UUID);
DROP FUNCTION IF EXISTS has_subject_access(UUID, UUID);
DROP FUNCTION IF EXISTS is_admin(UUID);

-- Fix increment_daily_reviews function to use 'reviews_today' instead of 'daily_reviews'
CREATE OR REPLACE FUNCTION increment_daily_reviews(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    INSERT INTO user_profiles (id, reviews_today)
    VALUES (p_user_id, 1)
    ON CONFLICT (id)
    DO UPDATE SET reviews_today = user_profiles.reviews_today + 1;
END;
$$;

-- Fix get_user_tier function to use 'user_tier' instead of 'tier'
CREATE OR REPLACE FUNCTION get_user_tier(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    tier TEXT;
BEGIN
    SELECT user_tier INTO tier FROM user_profiles WHERE id = p_user_id;
    RETURN COALESCE(tier, 'free');
END;
$$;

-- Fix has_subject_access function to use 'user_tier' instead of 'tier'
CREATE OR REPLACE FUNCTION has_subject_access(user_id UUID, subject_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    user_tier TEXT;
    subject_tier TEXT;
BEGIN
    -- Get user tier
    SELECT user_profiles.user_tier INTO user_tier FROM user_profiles WHERE id = user_id;
    
    -- Get subject tier requirement
    SELECT tier_requirement INTO subject_tier FROM subjects WHERE id = subject_id;
    
    -- Admin has access to everything
    IF user_tier = 'admin' THEN
        RETURN TRUE;
    END IF;
    
    -- Check tier access
    CASE subject_tier
        WHEN 'free' THEN
            RETURN TRUE;
        WHEN 'paid' THEN
            RETURN user_tier IN ('paid', 'admin');
        WHEN 'admin' THEN
            RETURN user_tier = 'admin';
        ELSE
            RETURN FALSE;
    END CASE;
END;
$$;

-- Fix is_admin function to use 'user_tier' instead of 'tier'
CREATE OR REPLACE FUNCTION is_admin(user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    user_tier TEXT;
BEGIN
    SELECT user_profiles.user_tier INTO user_tier FROM user_profiles WHERE id = user_id;
    RETURN user_tier = 'admin';
END;
$$;