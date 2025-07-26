-- Migration: 16-fix-function-return-types.sql
-- Description: Fixes return types in analytics functions to match actual column types
-- Dependencies: 13-advanced-analytics-schema.sql, 15-fix-admin-function.sql

-- Drop existing functions first to avoid conflicts
DROP FUNCTION IF EXISTS get_hesitation_analytics(UUID, INT, INT);
DROP FUNCTION IF EXISTS get_error_pattern_analytics(UUID, INT, INT);
DROP FUNCTION IF EXISTS get_difficulty_consistency_analytics(UUID, INT, TEXT, INT);

-- Recreate with correct return types
CREATE OR REPLACE FUNCTION get_hesitation_analytics(
    p_subject_id UUID DEFAULT NULL,
    p_min_reviews INT DEFAULT 5,
    p_limit INT DEFAULT 50
)
RETURNS TABLE (
    card_id UUID,
    question TEXT,
    avg_hesitation_ms NUMERIC,
    high_hesitation_percentage NUMERIC,
    total_reviews BIGINT,
    subject_name VARCHAR
) AS $$
BEGIN
    -- Check if user is admin
    IF NOT is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Only admins can access hesitation analytics';
    END IF;
    
    RETURN QUERY
    SELECT 
        ha.card_id,
        ha.question,
        ha.avg_hesitation_ms,
        ha.high_hesitation_percentage,
        ha.total_reviews,
        ha.subject_name::VARCHAR
    FROM public.card_hesitation_analytics ha
    WHERE (p_subject_id IS NULL OR ha.subject_id = p_subject_id)
    AND ha.total_reviews >= p_min_reviews
    ORDER BY ha.high_hesitation_percentage DESC, ha.avg_hesitation_ms DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_error_pattern_analytics(
    p_subject_id UUID DEFAULT NULL,
    p_min_reviews INT DEFAULT 5,
    p_limit INT DEFAULT 50
)
RETURNS TABLE (
    card_id UUID,
    question TEXT,
    again_percentage NUMERIC,
    max_error_streak_length NUMERIC,
    total_error_streaks BIGINT,
    total_reviews BIGINT,
    subject_name VARCHAR
) AS $$
BEGIN
    -- Check if user is admin
    IF NOT is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Only admins can access error pattern analytics';
    END IF;
    
    RETURN QUERY
    SELECT 
        ep.card_id,
        ep.question,
        ep.again_percentage,
        ep.max_error_streak_length,
        ep.total_error_streaks,
        ep.total_reviews,
        ep.subject_name::VARCHAR
    FROM public.card_error_patterns ep
    WHERE (p_subject_id IS NULL OR ep.subject_id = p_subject_id)
    AND ep.total_reviews >= p_min_reviews
    ORDER BY ep.again_percentage DESC, ep.max_error_streak_length DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_difficulty_consistency_analytics(
    p_subject_id UUID DEFAULT NULL,
    p_min_reviews INT DEFAULT 5,
    p_classification TEXT DEFAULT NULL,
    p_limit INT DEFAULT 50
)
RETURNS TABLE (
    card_id UUID,
    question TEXT,
    difficulty_classification TEXT,
    consistency_score NUMERIC,
    avg_rating NUMERIC,
    rating_variance NUMERIC,
    total_reviews BIGINT,
    subject_name VARCHAR
) AS $$
BEGIN
    -- Check if user is admin
    IF NOT is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Only admins can access difficulty consistency analytics';
    END IF;
    
    RETURN QUERY
    SELECT 
        dc.card_id,
        dc.question,
        dc.difficulty_classification,
        dc.consistency_score,
        dc.avg_rating,
        dc.rating_variance,
        dc.total_reviews,
        dc.subject_name::VARCHAR
    FROM public.card_difficulty_consistency dc
    WHERE (p_subject_id IS NULL OR dc.subject_id = p_subject_id)
    AND dc.total_reviews >= p_min_reviews
    AND (p_classification IS NULL OR dc.difficulty_classification = p_classification)
    ORDER BY 
        CASE 
            WHEN p_classification = 'optimal' THEN dc.consistency_score
            ELSE -dc.consistency_score
        END DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_hesitation_analytics(UUID, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_error_pattern_analytics(UUID, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_difficulty_consistency_analytics(UUID, INT, TEXT, INT) TO authenticated;