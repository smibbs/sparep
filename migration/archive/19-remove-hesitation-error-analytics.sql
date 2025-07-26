-- Migration: 19-remove-hesitation-error-analytics.sql
-- Description: Removes hesitation and error pattern analytics components
-- Dependencies: 13-advanced-analytics-schema.sql

-- Drop analytics functions
DROP FUNCTION IF EXISTS get_hesitation_analytics(UUID, INT, INT);
DROP FUNCTION IF EXISTS get_error_pattern_analytics(UUID, INT, INT);

-- Drop analytics views
DROP VIEW IF EXISTS public.card_hesitation_analytics;
DROP VIEW IF EXISTS public.card_error_patterns;

-- Update card_analytics_summary view to remove hesitation and error pattern references
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
    -- Difficulty consistency metrics (keep these)
    dc.consistency_score,
    dc.difficulty_classification,
    dc.avg_rating,
    dc.rating_variance,
    -- Simplified problem score based only on difficulty consistency and flags
    COALESCE(
        (c.user_flag_count * 20) +
        (CASE WHEN c.flagged_for_review THEN 50 ELSE 0 END) +
        (CASE WHEN dc.consistency_score < 50 THEN (100 - dc.consistency_score) ELSE 0 END * 0.3),
        (c.user_flag_count * 20) + (CASE WHEN c.flagged_for_review THEN 50 ELSE 0 END)
    ) as problem_score
FROM public.cards c
LEFT JOIN public.subjects s ON c.subject_id = s.id
LEFT JOIN public.card_difficulty_consistency dc ON c.id = dc.card_id;

-- Grant permissions for updated view
GRANT SELECT ON public.card_analytics_summary TO authenticated;

-- Remove hesitation and card flip time columns from review_history
ALTER TABLE public.review_history 
DROP COLUMN IF EXISTS hesitation_time_ms,
DROP COLUMN IF EXISTS card_flip_time_ms;

-- Drop indexes that were created for these columns
DROP INDEX IF EXISTS review_history_hesitation_time_idx;
DROP INDEX IF EXISTS review_history_card_flip_time_idx;