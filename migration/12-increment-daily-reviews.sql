-- =====================================================
-- Migration 12: Increment Daily Reviews Function
-- =====================================================
-- Function to reset and increment daily review counters
-- Requires: 01-extensions-and-enums.sql through 11-final-optimizations.sql

CREATE OR REPLACE FUNCTION increment_daily_reviews(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Reset daily counter if last review was before today
    UPDATE profiles
    SET reviews_today = 0
    WHERE id = p_user_id
      AND (last_review_date IS NULL OR last_review_date < CURRENT_DATE);

    -- Increment review counter and update last review date
    UPDATE profiles
    SET reviews_today = reviews_today + 1,
        last_review_date = CURRENT_DATE
    WHERE id = p_user_id;
END;
$$;
