-- Migration: 10-functions-and-procedures.sql
-- Description: Consolidates all helper functions and stored procedures
-- Dependencies: 01-initial-setup.sql, 02-enums.sql, 03-user-profiles.sql

-- Create helper function to get user tier
CREATE OR REPLACE FUNCTION get_user_tier(user_id UUID)
RETURNS user_tier AS $$
DECLARE
    tier user_tier;
BEGIN
    SELECT user_tier INTO tier 
    FROM public.user_profiles 
    WHERE id = user_id;
    
    RETURN COALESCE(tier, 'free'::user_tier);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create helper function to check if user can access flagged cards
CREATE OR REPLACE FUNCTION can_access_flagged_cards(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN get_user_tier(user_id) = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create helper function to get daily review limit based on tier
CREATE OR REPLACE FUNCTION get_daily_review_limit(user_id UUID)
RETURNS INT AS $$
DECLARE
    tier user_tier;
    limit_value INT;
BEGIN
    SELECT user_tier INTO tier 
    FROM public.user_profiles 
    WHERE id = user_id;
    
    CASE tier
        WHEN 'free' THEN limit_value := 20;
        WHEN 'paid' THEN limit_value := 9999; -- Effectively unlimited
        WHEN 'admin' THEN limit_value := 9999; -- Effectively unlimited
        ELSE limit_value := 20; -- Default to free tier
    END CASE;
    
    RETURN limit_value;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create helper function to check if user has daily reviews remaining
CREATE OR REPLACE FUNCTION has_daily_reviews_remaining(user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    tier user_tier;
    reviews_today INT;
    daily_limit INT;
    last_review DATE;
BEGIN
    SELECT user_tier, up.reviews_today, last_review_date 
    INTO tier, reviews_today, last_review
    FROM public.user_profiles up 
    WHERE id = user_id;
    
    -- Reset count if it's a new day
    IF last_review IS NULL OR last_review < CURRENT_DATE THEN
        UPDATE public.user_profiles 
        SET reviews_today = 0, last_review_date = CURRENT_DATE 
        WHERE id = user_id;
        reviews_today := 0;
    END IF;
    
    -- Get daily limit for user's tier
    daily_limit := get_daily_review_limit(user_id);
    
    RETURN reviews_today < daily_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to increment daily review count
CREATE OR REPLACE FUNCTION increment_daily_reviews(user_id UUID)
RETURNS VOID AS $$
BEGIN
    -- Reset count if it's a new day, then increment
    UPDATE public.user_profiles 
    SET 
        reviews_today = CASE 
            WHEN last_review_date < CURRENT_DATE THEN 1
            ELSE reviews_today + 1
        END,
        last_review_date = CURRENT_DATE
    WHERE id = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION get_user_tier(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION can_access_flagged_cards(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_daily_review_limit(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION has_daily_reviews_remaining(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_daily_reviews(UUID) TO authenticated;

-- Comments
COMMENT ON FUNCTION get_user_tier(UUID) IS 'Returns the user tier for a given user ID';
COMMENT ON FUNCTION can_access_flagged_cards(UUID) IS 'Checks if user can access flagged cards (admin only)';
COMMENT ON FUNCTION get_daily_review_limit(UUID) IS 'Returns daily review limit based on user tier';
COMMENT ON FUNCTION has_daily_reviews_remaining(UUID) IS 'Checks if user has reviews remaining for today';
COMMENT ON FUNCTION increment_daily_reviews(UUID) IS 'Increments daily review count for user';