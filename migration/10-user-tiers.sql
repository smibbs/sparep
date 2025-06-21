-- Migration: 10-user-tiers.sql
-- Description: Adds user tier system (admin, paid, free) and card flagging for admin review
-- Dependencies: All previous migrations

-- Create user tier enum
CREATE TYPE user_tier AS ENUM ('free', 'paid', 'admin');

-- Add user tier fields to user_profiles table
ALTER TABLE public.user_profiles 
ADD COLUMN user_tier user_tier NOT NULL DEFAULT 'free',
ADD COLUMN reviews_today INT NOT NULL DEFAULT 0,
ADD COLUMN last_review_date DATE DEFAULT CURRENT_DATE;

-- Update existing admin users to have admin tier
UPDATE public.user_profiles 
SET user_tier = 'admin' 
WHERE is_admin = true;

-- Add card flagging fields to cards table
ALTER TABLE public.cards 
ADD COLUMN flagged_for_review BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN flagged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN flagged_reason TEXT,
ADD COLUMN flagged_at TIMESTAMPTZ;

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

-- Update card access policies to handle flagged cards
DROP POLICY IF EXISTS "Users can view accessible cards" ON public.cards;
CREATE POLICY "Users can view accessible cards"
    ON public.cards FOR SELECT
    USING (
        -- Can access if card is not flagged OR user can access flagged cards
        (NOT flagged_for_review OR can_access_flagged_cards(auth.uid()))
        AND
        -- Regular access check (public cards or own cards or has subject access)
        (is_public = true OR creator_id = auth.uid() OR has_subject_access(auth.uid(), subject_id))
    );

-- Create policy for admins to manage card flags
CREATE POLICY "Admins can flag/unflag cards"
    ON public.cards FOR UPDATE
    USING (can_access_flagged_cards(auth.uid()))
    WITH CHECK (can_access_flagged_cards(auth.uid()));

-- Create policy for admins to view all flagged cards
CREATE POLICY "Admins can view flagged cards"
    ON public.cards FOR SELECT
    USING (
        can_access_flagged_cards(auth.uid()) AND flagged_for_review = true
    );

-- Update user profiles policies to handle tier management
CREATE POLICY "Admins can manage user tiers"
    ON public.user_profiles FOR UPDATE
    USING (get_user_tier(auth.uid()) = 'admin')
    WITH CHECK (get_user_tier(auth.uid()) = 'admin');

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION get_user_tier(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION can_access_flagged_cards(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_daily_review_limit(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION has_daily_reviews_remaining(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_daily_reviews(UUID) TO authenticated;

-- Create indexes for performance
CREATE INDEX cards_flagged_for_review_idx ON public.cards(flagged_for_review) WHERE flagged_for_review = true;
CREATE INDEX user_profiles_user_tier_idx ON public.user_profiles(user_tier);
CREATE INDEX user_profiles_last_review_date_idx ON public.user_profiles(last_review_date);

-- Comments
COMMENT ON TYPE user_tier IS 'User access tiers: free (20 reviews/day), paid (unlimited), admin (unlimited + flagged cards)';
COMMENT ON COLUMN public.user_profiles.user_tier IS 'User access tier determining features and limits';
COMMENT ON COLUMN public.user_profiles.reviews_today IS 'Number of reviews completed today';
COMMENT ON COLUMN public.user_profiles.last_review_date IS 'Date of last review for daily reset tracking';
COMMENT ON COLUMN public.cards.flagged_for_review IS 'Whether card is flagged for admin review before general availability';
COMMENT ON COLUMN public.cards.flagged_by IS 'Admin user who flagged this card';
COMMENT ON COLUMN public.cards.flagged_reason IS 'Reason why card was flagged for review';
COMMENT ON COLUMN public.cards.flagged_at IS 'Timestamp when card was flagged';