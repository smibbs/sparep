-- Migration: 20-failed-attempts-before-good-rating.sql
-- Description: Adds function to calculate failed attempts before first good rating
-- Dependencies: 07-review-history.sql, 15-fix-admin-function.sql

-- Create function to calculate failed attempts before first good rating
CREATE OR REPLACE FUNCTION get_failed_attempts_before_good_rating()
RETURNS TABLE (
    avg_failed_attempts_before_good NUMERIC
) AS $$
BEGIN
    -- Check if user is admin
    IF NOT is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Only admins can access failed attempts analytics';
    END IF;
    
    RETURN QUERY
    WITH user_card_sequences AS (
        -- Get all reviews ordered by date for each user-card pair
        SELECT 
            rh.user_id,
            rh.card_id,
            rh.rating,
            rh.review_date,
            ROW_NUMBER() OVER (PARTITION BY rh.user_id, rh.card_id ORDER BY rh.review_date) as review_sequence
        FROM public.review_history rh
        ORDER BY rh.user_id, rh.card_id, rh.review_date
    ),
    first_good_ratings AS (
        -- Find the first "good" rating (3 or 4) for each user-card pair
        SELECT 
            user_id,
            card_id,
            MIN(review_sequence) as first_good_sequence
        FROM user_card_sequences
        WHERE rating >= 3  -- Good (3) or Easy (4)
        GROUP BY user_id, card_id
    ),
    failed_attempts_count AS (
        -- Count failed attempts (rating 1 or 2) before first good rating
        SELECT 
            ucs.user_id,
            ucs.card_id,
            COALESCE(fgr.first_good_sequence - 1, 
                     -- If no good rating found, count all attempts
                     (SELECT MAX(review_sequence) FROM user_card_sequences ucs2 
                      WHERE ucs2.user_id = ucs.user_id AND ucs2.card_id = ucs.card_id)
                    ) as failed_attempts_before_good
        FROM user_card_sequences ucs
        LEFT JOIN first_good_ratings fgr ON ucs.user_id = fgr.user_id AND ucs.card_id = fgr.card_id
        WHERE ucs.review_sequence = 1  -- Only count each user-card pair once
    )
    SELECT 
        ROUND(AVG(failed_attempts_before_good), 1) as avg_failed_attempts_before_good
    FROM failed_attempts_count
    WHERE failed_attempts_before_good >= 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_failed_attempts_before_good_rating() TO authenticated;

-- Create function to get per-card failed attempts data
CREATE OR REPLACE FUNCTION get_failed_attempts_per_card(
    p_subject_id UUID DEFAULT NULL,
    p_min_reviews INT DEFAULT 5,
    p_limit INT DEFAULT 50
)
RETURNS TABLE (
    card_id UUID,
    question TEXT,
    failed_attempts_before_good NUMERIC,
    subject_name TEXT,
    total_reviews BIGINT
) AS $$
BEGIN
    -- Check if user is admin
    IF NOT is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Only admins can access per-card failed attempts analytics';
    END IF;
    
    RETURN QUERY
    WITH user_card_sequences AS (
        -- Get all reviews ordered by date for each user-card pair
        SELECT 
            rh.user_id,
            rh.card_id,
            rh.rating,
            rh.review_date,
            ROW_NUMBER() OVER (PARTITION BY rh.user_id, rh.card_id ORDER BY rh.review_date) as review_sequence
        FROM public.review_history rh
        ORDER BY rh.user_id, rh.card_id, rh.review_date
    ),
    first_good_ratings AS (
        -- Find the first "good" rating (3 or 4) for each user-card pair
        SELECT 
            user_id,
            card_id,
            MIN(review_sequence) as first_good_sequence
        FROM user_card_sequences
        WHERE rating >= 3  -- Good (3) or Easy (4)
        GROUP BY user_id, card_id
    ),
    user_card_failed_attempts AS (
        -- Count failed attempts (rating 1 or 2) before first good rating for each user-card pair
        SELECT 
            ucs.user_id,
            ucs.card_id,
            COALESCE(fgr.first_good_sequence - 1, 
                     -- If no good rating found, count all attempts
                     (SELECT MAX(review_sequence) FROM user_card_sequences ucs2 
                      WHERE ucs2.user_id = ucs.user_id AND ucs2.card_id = ucs.card_id)
                    ) as failed_attempts_before_good
        FROM user_card_sequences ucs
        LEFT JOIN first_good_ratings fgr ON ucs.user_id = fgr.user_id AND ucs.card_id = fgr.card_id
        WHERE ucs.review_sequence = 1  -- Only count each user-card pair once
    ),
    card_failed_attempts_avg AS (
        -- Average failed attempts per card across all users
        SELECT 
            ucfa.card_id,
            ROUND(AVG(ucfa.failed_attempts_before_good), 1) as avg_failed_attempts_before_good,
            COUNT(ucfa.user_id) as user_count
        FROM user_card_failed_attempts ucfa
        WHERE ucfa.failed_attempts_before_good >= 0
        GROUP BY ucfa.card_id
    )
    SELECT 
        c.id as card_id,
        c.question,
        COALESCE(cfaa.avg_failed_attempts_before_good, 0) as failed_attempts_before_good,
        COALESCE(s.name, 'Unknown') as subject_name,
        c.total_reviews
    FROM public.cards c
    LEFT JOIN public.subjects s ON c.subject_id = s.id
    LEFT JOIN card_failed_attempts_avg cfaa ON c.id = cfaa.card_id
    WHERE (p_subject_id IS NULL OR c.subject_id = p_subject_id)
    AND c.total_reviews >= p_min_reviews
    ORDER BY cfaa.avg_failed_attempts_before_good DESC NULLS LAST, c.total_reviews DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_failed_attempts_per_card(UUID, INT, INT) TO authenticated;