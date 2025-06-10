-- Migration: 08-stored-procedures.sql
-- Description: Creates stored procedures for card progress updates
-- Dependencies: 01-initial-setup.sql, 05-user-card-progress.sql

-- Create function to update card progress counters
CREATE OR REPLACE FUNCTION public.update_card_progress(
    p_user_id UUID,
    p_card_id UUID,
    p_rating INTEGER
) RETURNS void AS $$
BEGIN
    -- Update the counters using proper SQL expressions
    UPDATE public.user_card_progress
    SET 
        reps = reps + 1,
        total_reviews = total_reviews + 1,
        correct_reviews = CASE WHEN p_rating >= 3 THEN correct_reviews + 1 ELSE correct_reviews END,
        incorrect_reviews = CASE WHEN p_rating < 3 THEN incorrect_reviews + 1 ELSE incorrect_reviews END,
        last_rating = p_rating,
        state = 'learning',
        streak = CASE WHEN p_rating >= 3 THEN streak + 1 ELSE 0 END
    WHERE 
        user_id = p_user_id 
        AND card_id = p_card_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.update_card_progress TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.update_card_progress IS 'Updates card progress counters and statistics based on user rating'; 