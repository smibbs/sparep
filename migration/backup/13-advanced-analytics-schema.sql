-- Migration: 13-advanced-analytics-schema.sql
-- Description: Adds advanced analytics tracking for hesitation patterns and card analytics
-- Dependencies: 07-review-history.sql

-- Add hesitation tracking columns to review_history table
ALTER TABLE public.review_history 
ADD COLUMN IF NOT EXISTS hesitation_time_ms INT CHECK (hesitation_time_ms >= 0),
ADD COLUMN IF NOT EXISTS card_flip_time_ms INT CHECK (card_flip_time_ms >= 0);

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS review_history_hesitation_time_idx ON public.review_history(hesitation_time_ms) WHERE hesitation_time_ms IS NOT NULL;
CREATE INDEX IF NOT EXISTS review_history_card_flip_time_idx ON public.review_history(card_flip_time_ms) WHERE card_flip_time_ms IS NOT NULL;

-- Comments for new columns
COMMENT ON COLUMN public.review_history.hesitation_time_ms IS 'Time between card display and rating selection (milliseconds)';
COMMENT ON COLUMN public.review_history.card_flip_time_ms IS 'Time spent looking at question before flipping to answer (milliseconds)';

-- Create view for card hesitation analytics
CREATE OR REPLACE VIEW public.card_hesitation_analytics AS
SELECT 
    c.id as card_id,
    c.question,
    c.answer,
    c.subject_id,
    s.name as subject_name,
    COUNT(rh.id) as total_reviews,
    AVG(rh.hesitation_time_ms) as avg_hesitation_ms,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY rh.hesitation_time_ms) as median_hesitation_ms,
    STDDEV(rh.hesitation_time_ms) as hesitation_stddev,
    MAX(rh.hesitation_time_ms) as max_hesitation_ms,
    MIN(rh.hesitation_time_ms) as min_hesitation_ms,
    AVG(rh.card_flip_time_ms) as avg_flip_time_ms,
    COUNT(CASE WHEN rh.hesitation_time_ms > 10000 THEN 1 END) as high_hesitation_count,
    ROUND(
        COUNT(CASE WHEN rh.hesitation_time_ms > 10000 THEN 1 END)::numeric / 
        NULLIF(COUNT(rh.id), 0) * 100, 2
    ) as high_hesitation_percentage
FROM public.cards c
LEFT JOIN public.review_history rh ON c.id = rh.card_id
LEFT JOIN public.subjects s ON c.subject_id = s.id
WHERE rh.hesitation_time_ms IS NOT NULL
GROUP BY c.id, c.question, c.answer, c.subject_id, s.name
HAVING COUNT(rh.id) > 0;

-- Create view for error pattern analysis
CREATE OR REPLACE VIEW public.card_error_patterns AS
WITH consecutive_errors AS (
    SELECT 
        card_id,
        user_id,
        review_date,
        rating,
        LAG(rating) OVER (PARTITION BY card_id, user_id ORDER BY review_date) as prev_rating,
        -- Identify start of consecutive error sequences
        CASE 
            WHEN rating = 1 AND LAG(rating) OVER (PARTITION BY card_id, user_id ORDER BY review_date) != 1 
            THEN 1 
            ELSE 0 
        END as error_sequence_start
    FROM public.review_history
),
error_groups AS (
    SELECT 
        card_id,
        user_id,
        review_date,
        rating,
        SUM(error_sequence_start) OVER (PARTITION BY card_id, user_id ORDER BY review_date) as error_group_id
    FROM consecutive_errors
),
error_streaks AS (
    SELECT 
        card_id,
        user_id,
        error_group_id,
        COUNT(*) as consecutive_errors,
        MIN(review_date) as streak_start,
        MAX(review_date) as streak_end
    FROM error_groups
    WHERE rating = 1
    GROUP BY card_id, user_id, error_group_id
    HAVING COUNT(*) >= 2  -- Only count actual streaks (2+ consecutive errors)
)
SELECT 
    c.id as card_id,
    c.question,
    c.answer,
    c.subject_id,
    s.name as subject_name,
    COUNT(DISTINCT rh.user_id) as users_reviewed,
    COUNT(rh.id) as total_reviews,
    COUNT(CASE WHEN rh.rating = 1 THEN 1 END) as again_count,
    ROUND(
        COUNT(CASE WHEN rh.rating = 1 THEN 1 END)::numeric / 
        NULLIF(COUNT(rh.id), 0) * 100, 2
    ) as again_percentage,
    COUNT(DISTINCT es.user_id) as users_with_streaks,
    COALESCE(AVG(es.consecutive_errors), 0) as avg_error_streak_length,
    COALESCE(MAX(es.consecutive_errors), 0) as max_error_streak_length,
    COUNT(es.card_id) as total_error_streaks
FROM public.cards c
LEFT JOIN public.review_history rh ON c.id = rh.card_id
LEFT JOIN public.subjects s ON c.subject_id = s.id
LEFT JOIN error_streaks es ON c.id = es.card_id
GROUP BY c.id, c.question, c.answer, c.subject_id, s.name
HAVING COUNT(rh.id) > 0;

-- Create view for difficulty consistency analysis
CREATE OR REPLACE VIEW public.card_difficulty_consistency AS
SELECT 
    c.id as card_id,
    c.question,
    c.answer,
    c.subject_id,
    s.name as subject_name,
    COUNT(rh.id) as total_reviews,
    AVG(rh.rating::numeric) as avg_rating,
    VARIANCE(rh.rating::numeric) as rating_variance,
    STDDEV(rh.rating::numeric) as rating_stddev,
    -- Consistency score (lower variance = more consistent)
    CASE 
        WHEN VARIANCE(rh.rating::numeric) IS NULL OR VARIANCE(rh.rating::numeric) = 0 THEN 100
        ELSE GREATEST(0, 100 - (VARIANCE(rh.rating::numeric) * 50))
    END as consistency_score,
    -- Classification based on rating patterns
    CASE 
        WHEN VARIANCE(rh.rating::numeric) < 0.5 AND AVG(rh.rating::numeric) >= 2.5 THEN 'optimal'
        WHEN VARIANCE(rh.rating::numeric) < 0.5 AND AVG(rh.rating::numeric) < 2.5 THEN 'consistently_hard'
        WHEN VARIANCE(rh.rating::numeric) >= 1.5 THEN 'highly_variable'
        ELSE 'moderately_variable'
    END as difficulty_classification,
    COUNT(CASE WHEN rh.rating = 1 THEN 1 END) as again_count,
    COUNT(CASE WHEN rh.rating = 2 THEN 1 END) as hard_count,
    COUNT(CASE WHEN rh.rating = 3 THEN 1 END) as good_count,
    COUNT(CASE WHEN rh.rating = 4 THEN 1 END) as easy_count,
    -- Percentage distributions
    ROUND(COUNT(CASE WHEN rh.rating = 1 THEN 1 END)::numeric / NULLIF(COUNT(rh.id), 0) * 100, 1) as again_percentage,
    ROUND(COUNT(CASE WHEN rh.rating = 2 THEN 1 END)::numeric / NULLIF(COUNT(rh.id), 0) * 100, 1) as hard_percentage,
    ROUND(COUNT(CASE WHEN rh.rating = 3 THEN 1 END)::numeric / NULLIF(COUNT(rh.id), 0) * 100, 1) as good_percentage,
    ROUND(COUNT(CASE WHEN rh.rating = 4 THEN 1 END)::numeric / NULLIF(COUNT(rh.id), 0) * 100, 1) as easy_percentage
FROM public.cards c
LEFT JOIN public.review_history rh ON c.id = rh.card_id
LEFT JOIN public.subjects s ON c.subject_id = s.id
GROUP BY c.id, c.question, c.answer, c.subject_id, s.name
HAVING COUNT(rh.id) >= 3; -- Only include cards with at least 3 reviews for meaningful variance

-- Create comprehensive analytics summary view
CREATE OR REPLACE VIEW public.card_analytics_summary AS
SELECT 
    c.id as card_id,
    c.question,
    c.answer,
    c.subject_id,
    s.name as subject_name,
    c.created_at,
    c.total_reviews,
    c.correct_reviews,
    c.incorrect_reviews,
    c.average_response_time_ms,
    c.user_flag_count,
    c.flagged_for_review,
    -- Hesitation metrics
    ha.avg_hesitation_ms,
    ha.high_hesitation_percentage,
    -- Error pattern metrics
    ep.again_percentage,
    ep.max_error_streak_length,
    ep.total_error_streaks,
    -- Difficulty consistency metrics
    dc.consistency_score,
    dc.difficulty_classification,
    dc.avg_rating,
    dc.rating_variance,
    -- Combined problem score (higher = more problematic)
    COALESCE(
        (COALESCE(ha.high_hesitation_percentage, 0) * 0.3) +
        (COALESCE(ep.again_percentage, 0) * 0.4) +
        (CASE WHEN dc.consistency_score < 50 THEN (100 - dc.consistency_score) ELSE 0 END * 0.3),
        0
    ) as problem_score
FROM public.cards c
LEFT JOIN public.subjects s ON c.subject_id = s.id
LEFT JOIN public.card_hesitation_analytics ha ON c.id = ha.card_id
LEFT JOIN public.card_error_patterns ep ON c.id = ep.card_id
LEFT JOIN public.card_difficulty_consistency dc ON c.id = dc.card_id;

-- Grant permissions for views
GRANT SELECT ON public.card_hesitation_analytics TO authenticated;
GRANT SELECT ON public.card_error_patterns TO authenticated;
GRANT SELECT ON public.card_difficulty_consistency TO authenticated;
GRANT SELECT ON public.card_analytics_summary TO authenticated;

-- Create admin-only analytics functions
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
        ha.subject_name
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
        ep.subject_name
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
        dc.subject_name
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