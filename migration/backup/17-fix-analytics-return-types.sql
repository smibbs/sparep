-- Migration: 17-fix-analytics-return-types.sql
-- Description: Fixes difficulty analytics function return types to match actual view schema
-- Dependencies: 13-advanced-analytics-schema.sql, 15-fix-admin-function.sql

-- Drop existing functions first to avoid conflicts
DROP FUNCTION IF EXISTS get_difficulty_consistency_analytics(UUID, INT, TEXT, INT);

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
    subject_name TEXT
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
        COALESCE(dc.subject_name::TEXT, 'Unknown') as subject_name
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
GRANT EXECUTE ON FUNCTION get_difficulty_consistency_analytics(UUID, INT, TEXT, INT) TO authenticated;