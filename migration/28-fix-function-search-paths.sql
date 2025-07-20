-- Migration 28: Fix Function Search Paths Security Warning
-- This migration fixes the security warning about mutable search paths
-- by explicitly setting search_path = public for all affected functions

-- Fix get_user_tier function
DROP FUNCTION IF EXISTS get_user_tier(UUID) CASCADE;
CREATE OR REPLACE FUNCTION get_user_tier(user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN (SELECT tier FROM user_profiles WHERE id = user_id);
END;
$$;

-- Fix can_access_flagged_cards function
DROP FUNCTION IF EXISTS can_access_flagged_cards() CASCADE;
CREATE OR REPLACE FUNCTION can_access_flagged_cards()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN is_admin();
END;
$$;

-- Fix increment_daily_reviews function
DROP FUNCTION IF EXISTS increment_daily_reviews(UUID) CASCADE;
CREATE OR REPLACE FUNCTION increment_daily_reviews(user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE user_profiles 
    SET daily_reviews = daily_reviews + 1,
        updated_at = NOW()
    WHERE id = user_id;
END;
$$;

-- Fix get_failed_attempts_before_good_rating function
DROP FUNCTION IF EXISTS get_failed_attempts_before_good_rating(UUID, UUID) CASCADE;
CREATE OR REPLACE FUNCTION get_failed_attempts_before_good_rating(p_user_id UUID, p_card_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    last_good_review TIMESTAMP;
    failed_count INTEGER;
BEGIN
    -- Get the timestamp of the last 'good' or 'easy' rating for this card
    SELECT MAX(reviewed_at) INTO last_good_review
    FROM review_history
    WHERE user_id = p_user_id 
      AND card_id = p_card_id 
      AND rating IN (3, 4); -- 'good' or 'easy'
    
    -- If no good rating found, count all 'again' ratings
    IF last_good_review IS NULL THEN
        SELECT COUNT(*) INTO failed_count
        FROM review_history
        WHERE user_id = p_user_id 
          AND card_id = p_card_id 
          AND rating = 1; -- 'again'
    ELSE
        -- Count 'again' ratings since the last good rating
        SELECT COUNT(*) INTO failed_count
        FROM review_history
        WHERE user_id = p_user_id 
          AND card_id = p_card_id 
          AND rating = 1 -- 'again'
          AND reviewed_at > last_good_review;
    END IF;
    
    RETURN COALESCE(failed_count, 0);
END;
$$;

-- Fix admin_toggle_subject_status function
DROP FUNCTION IF EXISTS admin_toggle_subject_status(UUID) CASCADE;
CREATE OR REPLACE FUNCTION admin_toggle_subject_status(subject_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Check if user is admin
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Access denied. Admin privileges required.';
    END IF;
    
    UPDATE subjects 
    SET is_active = NOT is_active,
        updated_at = NOW()
    WHERE id = subject_id;
END;
$$;

-- Fix admin_bulk_toggle_subjects function
DROP FUNCTION IF EXISTS admin_bulk_toggle_subjects(UUID[], BOOLEAN) CASCADE;
CREATE OR REPLACE FUNCTION admin_bulk_toggle_subjects(subject_ids UUID[], new_status BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Check if user is admin
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Access denied. Admin privileges required.';
    END IF;
    
    UPDATE subjects 
    SET is_active = new_status,
        updated_at = NOW()
    WHERE id = ANY(subject_ids);
END;
$$;

-- Fix update_card_flag_count function
DROP FUNCTION IF EXISTS update_card_flag_count() CASCADE;
CREATE OR REPLACE FUNCTION update_card_flag_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE cards 
        SET flag_count = flag_count + 1
        WHERE id = NEW.card_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE cards 
        SET flag_count = flag_count - 1
        WHERE id = OLD.card_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

-- Fix flag_card_for_review function
DROP FUNCTION IF EXISTS flag_card_for_review(UUID, TEXT) CASCADE;
CREATE OR REPLACE FUNCTION flag_card_for_review(p_card_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO user_card_flags (user_id, card_id, reason, flagged_at)
    VALUES (auth.uid(), p_card_id, p_reason, NOW())
    ON CONFLICT (user_id, card_id) DO NOTHING;
END;
$$;

-- Fix resolve_card_flag function
DROP FUNCTION IF EXISTS resolve_card_flag(UUID, UUID) CASCADE;
CREATE OR REPLACE FUNCTION resolve_card_flag(p_user_id UUID, p_card_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Check if user is admin
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Access denied. Admin privileges required.';
    END IF;
    
    UPDATE user_card_flags 
    SET resolved_at = NOW(),
        updated_at = NOW()
    WHERE user_id = p_user_id AND card_id = p_card_id AND resolved_at IS NULL;
END;
$$;

-- Fix get_flagged_cards_for_admin function
DROP FUNCTION IF EXISTS get_flagged_cards_for_admin() CASCADE;
CREATE OR REPLACE FUNCTION get_flagged_cards_for_admin()
RETURNS TABLE (
    card_id UUID,
    front TEXT,
    back TEXT,
    flag_count INTEGER,
    user_id UUID,
    reason TEXT,
    flagged_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Check if user is admin
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Access denied. Admin privileges required.';
    END IF;
    
    RETURN QUERY
    SELECT 
        c.id,
        c.front,
        c.back,
        c.flag_count,
        ucf.user_id,
        ucf.reason,
        ucf.flagged_at
    FROM cards c
    JOIN user_card_flags ucf ON c.id = ucf.card_id
    WHERE ucf.resolved_at IS NULL
    ORDER BY ucf.flagged_at DESC;
END;
$$;

-- Fix get_unclaimed_streak_rewards function
DROP FUNCTION IF EXISTS get_unclaimed_streak_rewards(UUID) CASCADE;
CREATE OR REPLACE FUNCTION get_unclaimed_streak_rewards(p_user_id UUID)
RETURNS TABLE (
    streak_milestone INTEGER,
    reward_type TEXT,
    reward_value INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_streak INTEGER;
BEGIN
    -- Get current streak for user
    SELECT COALESCE(streak, 0) INTO current_streak
    FROM user_profiles
    WHERE id = p_user_id;
    
    -- Return available rewards based on streak milestones
    RETURN QUERY
    SELECT 
        milestone,
        'streak_bonus'::TEXT,
        milestone * 10 -- Example: 10 points per milestone
    FROM (
        VALUES (7), (14), (30), (60), (100), (365)
    ) AS milestones(milestone)
    WHERE milestone <= current_streak
    AND milestone NOT IN (
        SELECT DISTINCT streak_milestone 
        FROM user_streak_rewards 
        WHERE user_id = p_user_id
    );
END;
$$;

-- Fix claim_streak_reward function
DROP FUNCTION IF EXISTS claim_streak_reward(UUID, INTEGER) CASCADE;
CREATE OR REPLACE FUNCTION claim_streak_reward(p_user_id UUID, p_milestone INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Verify user can claim this reward
    IF NOT EXISTS (
        SELECT 1 FROM get_unclaimed_streak_rewards(p_user_id) 
        WHERE streak_milestone = p_milestone
    ) THEN
        RAISE EXCEPTION 'Reward not available for claiming';
    END IF;
    
    -- Record the reward claim
    INSERT INTO user_streak_rewards (user_id, streak_milestone, claimed_at)
    VALUES (p_user_id, p_milestone, NOW());
END;
$$;

-- Fix update_user_streak function
DROP FUNCTION IF EXISTS update_user_streak(UUID, BOOLEAN) CASCADE;
CREATE OR REPLACE FUNCTION update_user_streak(p_user_id UUID, p_successful_session BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_successful_session THEN
        UPDATE user_profiles 
        SET streak = streak + 1,
            last_activity = NOW(),
            updated_at = NOW()
        WHERE id = p_user_id;
    ELSE
        UPDATE user_profiles 
        SET streak = 0,
            last_activity = NOW(),
            updated_at = NOW()
        WHERE id = p_user_id;
    END IF;
END;
$$;

-- Fix get_difficulty_consistency_analytics function
DROP FUNCTION IF EXISTS get_difficulty_consistency_analytics() CASCADE;
CREATE OR REPLACE FUNCTION get_difficulty_consistency_analytics()
RETURNS TABLE (
    card_id UUID,
    avg_rating NUMERIC,
    rating_variance NUMERIC,
    total_reviews BIGINT,
    consistency_score NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Check if user is admin
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Access denied. Admin privileges required.';
    END IF;
    
    RETURN QUERY
    SELECT 
        rh.card_id,
        AVG(rh.rating::NUMERIC) as avg_rating,
        VAR_POP(rh.rating::NUMERIC) as rating_variance,
        COUNT(*) as total_reviews,
        CASE 
            WHEN VAR_POP(rh.rating::NUMERIC) = 0 THEN 100.0
            ELSE GREATEST(0, 100.0 - (VAR_POP(rh.rating::NUMERIC) * 25))
        END as consistency_score
    FROM review_history rh
    WHERE rh.reviewed_at >= NOW() - INTERVAL '30 days'
    GROUP BY rh.card_id
    HAVING COUNT(*) >= 5
    ORDER BY consistency_score ASC;
END;
$$;

-- Fix update_card_progress_after_review function
DROP FUNCTION IF EXISTS update_card_progress_after_review(UUID, UUID, INTEGER, NUMERIC, NUMERIC, INTEGER, TIMESTAMP WITH TIME ZONE) CASCADE;
CREATE OR REPLACE FUNCTION update_card_progress_after_review(
    p_user_id UUID,
    p_card_id UUID,
    p_rating INTEGER,
    p_stability NUMERIC,
    p_difficulty NUMERIC,
    p_reps INTEGER,
    p_due_date TIMESTAMP WITH TIME ZONE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_state card_state;
BEGIN
    -- Determine new state based on rating and current reps
    IF p_rating = 1 THEN
        new_state := 'learning';
    ELSIF p_reps = 0 THEN
        new_state := 'learning';
    ELSE
        new_state := 'review';
    END IF;
    
    -- Update or insert progress
    INSERT INTO user_card_progress (
        user_id, card_id, state, stability, difficulty, 
        due_date, last_review, reps, updated_at
    )
    VALUES (
        p_user_id, p_card_id, new_state, p_stability, p_difficulty,
        p_due_date, NOW(), p_reps, NOW()
    )
    ON CONFLICT (user_id, card_id)
    DO UPDATE SET
        state = new_state,
        stability = p_stability,
        difficulty = p_difficulty,
        due_date = p_due_date,
        last_review = NOW(),
        reps = p_reps,
        updated_at = NOW();
END;
$$;

-- Fix update_updated_at_column function
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Fix initialize_card_progress function
DROP FUNCTION IF EXISTS initialize_card_progress(UUID, UUID) CASCADE;
CREATE OR REPLACE FUNCTION initialize_card_progress(p_user_id UUID, p_card_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO user_card_progress (
        user_id, 
        card_id, 
        state, 
        stability, 
        difficulty, 
        due_date, 
        reps,
        created_at,
        updated_at
    )
    VALUES (
        p_user_id,
        p_card_id,
        'new',
        2.5, -- Default stability
        5.0, -- Default difficulty  
        NOW(), -- Available immediately
        0,
        NOW(),
        NOW()
    )
    ON CONFLICT (user_id, card_id) DO NOTHING;
END;
$$;

-- Fix is_admin function
DROP FUNCTION IF EXISTS is_admin() CASCADE;
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE id = auth.uid() AND tier = 'admin'
    );
END;
$$;

-- Fix has_subject_access function
DROP FUNCTION IF EXISTS has_subject_access(UUID) CASCADE;
CREATE OR REPLACE FUNCTION has_subject_access(subject_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_tier TEXT;
    subject_tier_required TEXT;
BEGIN
    -- Get user tier
    SELECT tier INTO user_tier FROM user_profiles WHERE id = auth.uid();
    
    -- Get subject tier requirement
    SELECT tier_required INTO subject_tier_required FROM subjects WHERE id = subject_id;
    
    -- Admin has access to everything
    IF user_tier = 'admin' THEN
        RETURN TRUE;
    END IF;
    
    -- Check tier access
    CASE subject_tier_required
        WHEN 'free' THEN RETURN TRUE;
        WHEN 'paid' THEN RETURN user_tier IN ('paid', 'admin');
        ELSE RETURN FALSE;
    END CASE;
END;
$$;

-- Fix has_card_access function
DROP FUNCTION IF EXISTS has_card_access(UUID) CASCADE;
CREATE OR REPLACE FUNCTION has_card_access(card_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    subject_id UUID;
BEGIN
    -- Get the subject for this card
    SELECT c.subject_id INTO subject_id FROM cards c WHERE c.id = card_id;
    
    -- Check subject access
    RETURN has_subject_access(subject_id);
END;
$$;

-- Re-create any triggers that use the updated functions
DROP TRIGGER IF EXISTS update_card_flag_count_trigger ON user_card_flags;
CREATE TRIGGER update_card_flag_count_trigger
    AFTER INSERT OR DELETE ON user_card_flags
    FOR EACH ROW
    EXECUTE FUNCTION update_card_flag_count();