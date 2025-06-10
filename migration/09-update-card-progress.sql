-- Migration: 09-update-card-progress.sql
-- Description: Creates stored procedure for updating card progress
-- Dependencies: 05-user-card-progress.sql

CREATE OR REPLACE FUNCTION public.update_card_progress(
    p_user_id UUID,
    p_card_id UUID,
    p_rating INTEGER,
    p_stability FLOAT,
    p_difficulty FLOAT,
    p_next_review_date TIMESTAMPTZ,
    p_response_time INTEGER,
    p_now TIMESTAMPTZ
) RETURNS void AS $$
BEGIN
    INSERT INTO public.user_card_progress (
        user_id,
        card_id,
        stability,
        difficulty,
        due_date,
        last_review_date,
        next_review_date,
        reps,
        total_reviews,
        correct_reviews,
        incorrect_reviews,
        last_rating,
        state,
        streak,
        average_time_ms,
        elapsed_days,
        scheduled_days,
        lapses
    ) VALUES (
        p_user_id,
        p_card_id,
        p_stability,
        p_difficulty,
        p_next_review_date,
        p_now,
        p_next_review_date,
        1,
        1,
        CASE WHEN p_rating >= 3 THEN 1 ELSE 0 END,
        CASE WHEN p_rating < 3 THEN 1 ELSE 0 END,
        p_rating,
        'learning',
        CASE WHEN p_rating >= 3 THEN 1 ELSE 0 END,
        p_response_time,
        0,
        0,
        CASE WHEN p_rating < 3 THEN 1 ELSE 0 END
    )
    ON CONFLICT (user_id, card_id) DO UPDATE SET
        stability = EXCLUDED.stability,
        difficulty = EXCLUDED.difficulty,
        due_date = EXCLUDED.due_date,
        last_review_date = EXCLUDED.last_review_date,
        next_review_date = EXCLUDED.next_review_date,
        reps = user_card_progress.reps + 1,
        total_reviews = user_card_progress.total_reviews + 1,
        correct_reviews = user_card_progress.correct_reviews + CASE WHEN p_rating >= 3 THEN 1 ELSE 0 END,
        incorrect_reviews = user_card_progress.incorrect_reviews + CASE WHEN p_rating < 3 THEN 1 ELSE 0 END,
        last_rating = p_rating,
        state = 'learning',
        streak = CASE WHEN p_rating >= 3 THEN user_card_progress.streak + 1 ELSE 0 END,
        average_time_ms = p_response_time,
        elapsed_days = 0,
        scheduled_days = 0,
        lapses = user_card_progress.lapses + CASE WHEN p_rating < 3 THEN 1 ELSE 0 END,
        updated_at = p_now;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.update_card_progress TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.update_card_progress IS 'Updates card progress and statistics based on user rating'; 