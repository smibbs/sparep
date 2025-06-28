-- Migration: 11-policies-and-security.sql
-- Description: Consolidates additional RLS policies and security enhancements
-- Dependencies: All previous migrations

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

-- Comments
COMMENT ON POLICY "Users can view accessible cards" ON public.cards IS 'Users can view public cards, own cards, or cards in accessible subjects, with admin access to flagged cards';
COMMENT ON POLICY "Admins can flag/unflag cards" ON public.cards IS 'Admins can manage card flagging status';
COMMENT ON POLICY "Admins can view flagged cards" ON public.cards IS 'Admins can view cards flagged for review';
COMMENT ON POLICY "Admins can manage user tiers" ON public.user_profiles IS 'Admins can modify user tier assignments';