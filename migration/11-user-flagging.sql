-- Migration: 11-user-flagging.sql
-- Description: Adds user flagging system for Free and Paid users to flag cards for admin review
-- Dependencies: 10-user-tiers.sql

-- Create enum for flag reasons
CREATE TYPE flag_reason AS ENUM ('incorrect', 'spelling', 'confusing', 'other');

-- Create user_card_flags table to track user flags
CREATE TABLE public.user_card_flags (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
    reason flag_reason NOT NULL,
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ NULL,
    resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    resolution_action TEXT, -- 'dismissed', 'card_updated', 'card_removed'
    
    -- Prevent duplicate flags from same user for same card
    UNIQUE(user_id, card_id)
);

-- Add flag summary fields to cards table
ALTER TABLE public.cards 
ADD COLUMN user_flag_count INT NOT NULL DEFAULT 0,
ADD COLUMN last_user_flagged_at TIMESTAMPTZ;

-- Create function to update card flag counts
CREATE OR REPLACE FUNCTION update_card_flag_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.cards 
        SET 
            user_flag_count = user_flag_count + 1,
            last_user_flagged_at = NEW.created_at
        WHERE id = NEW.card_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.cards 
        SET user_flag_count = user_flag_count - 1
        WHERE id = OLD.card_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to maintain flag counts
CREATE TRIGGER update_card_flag_count_trigger
    AFTER INSERT OR DELETE ON public.user_card_flags
    FOR EACH ROW EXECUTE FUNCTION update_card_flag_count();

-- Create function for users to flag cards
CREATE OR REPLACE FUNCTION flag_card_for_review(
    p_card_id UUID,
    p_reason flag_reason,
    p_comment TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    user_tier user_tier;
BEGIN
    -- Check if user is authenticated
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'User must be authenticated to flag cards';
    END IF;
    
    -- Get user tier
    SELECT get_user_tier(auth.uid()) INTO user_tier;
    
    -- Only allow free and paid users to flag (admins manage flags differently)
    IF user_tier = 'admin' THEN
        RAISE EXCEPTION 'Admin users should use admin interface for card management';
    END IF;
    
    -- Insert flag record (will fail if duplicate due to unique constraint)
    INSERT INTO public.user_card_flags (user_id, card_id, reason, comment)
    VALUES (auth.uid(), p_card_id, p_reason, p_comment);
    
    RETURN TRUE;
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'You have already flagged this card';
    WHEN OTHERS THEN
        RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function for admins to resolve flags
CREATE OR REPLACE FUNCTION resolve_card_flag(
    p_flag_id UUID,
    p_resolution_action TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if user is admin
    IF get_user_tier(auth.uid()) != 'admin' THEN
        RAISE EXCEPTION 'Only admins can resolve card flags';
    END IF;
    
    -- Update flag as resolved
    UPDATE public.user_card_flags
    SET 
        resolved_at = NOW(),
        resolved_by = auth.uid(),
        resolution_action = p_resolution_action
    WHERE id = p_flag_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get flagged cards for admin review
CREATE OR REPLACE FUNCTION get_flagged_cards_for_admin()
RETURNS TABLE (
    card_id UUID,
    question TEXT,
    answer TEXT,
    flag_count BIGINT,
    latest_flag_date TIMESTAMPTZ,
    flag_reasons TEXT[],
    flag_comments TEXT[]
) AS $$
BEGIN
    -- Check if user is admin
    IF get_user_tier(auth.uid()) != 'admin' THEN
        RAISE EXCEPTION 'Only admins can view flagged cards summary';
    END IF;
    
    RETURN QUERY
    SELECT 
        c.id as card_id,
        c.question,
        c.answer,
        COUNT(f.id) as flag_count,
        MAX(f.created_at) as latest_flag_date,
        ARRAY_AGG(f.reason::TEXT ORDER BY f.created_at) as flag_reasons,
        ARRAY_AGG(COALESCE(f.comment, '') ORDER BY f.created_at) as flag_comments
    FROM public.cards c
    INNER JOIN public.user_card_flags f ON c.id = f.card_id
    WHERE f.resolved_at IS NULL  -- Only unresolved flags
    GROUP BY c.id, c.question, c.answer
    ORDER BY COUNT(f.id) DESC, MAX(f.created_at) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create RLS policies for user_card_flags table
ALTER TABLE public.user_card_flags ENABLE ROW LEVEL SECURITY;

-- Users can insert their own flags
CREATE POLICY "Users can flag cards"
    ON public.user_card_flags FOR INSERT
    WITH CHECK (auth.uid() = user_id AND get_user_tier(auth.uid()) IN ('free', 'paid'));

-- Users can view their own flags
CREATE POLICY "Users can view own flags"
    ON public.user_card_flags FOR SELECT
    USING (auth.uid() = user_id);

-- Admins can view all flags
CREATE POLICY "Admins can view all flags"
    ON public.user_card_flags FOR SELECT
    USING (get_user_tier(auth.uid()) = 'admin');

-- Admins can update flags for resolution
CREATE POLICY "Admins can resolve flags"
    ON public.user_card_flags FOR UPDATE
    USING (get_user_tier(auth.uid()) = 'admin')
    WITH CHECK (get_user_tier(auth.uid()) = 'admin');

-- Grant permissions
GRANT EXECUTE ON FUNCTION flag_card_for_review(UUID, flag_reason, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_card_flag(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_flagged_cards_for_admin() TO authenticated;

-- Create indexes for performance
CREATE INDEX user_card_flags_user_id_idx ON public.user_card_flags(user_id);
CREATE INDEX user_card_flags_card_id_idx ON public.user_card_flags(card_id);
CREATE INDEX user_card_flags_created_at_idx ON public.user_card_flags(created_at);
CREATE INDEX user_card_flags_resolved_at_idx ON public.user_card_flags(resolved_at) WHERE resolved_at IS NULL;
CREATE INDEX cards_user_flag_count_idx ON public.cards(user_flag_count) WHERE user_flag_count > 0;

-- Comments
COMMENT ON TYPE flag_reason IS 'Reasons users can flag cards: incorrect, spelling, confusing, other';
COMMENT ON TABLE public.user_card_flags IS 'Tracks user-submitted flags for cards that need admin review';
COMMENT ON COLUMN public.user_card_flags.reason IS 'Categorized reason for flagging the card';
COMMENT ON COLUMN public.user_card_flags.comment IS 'Optional user comment explaining the flag';
COMMENT ON COLUMN public.user_card_flags.resolution_action IS 'How admin resolved the flag: dismissed, card_updated, card_removed';
COMMENT ON COLUMN public.cards.user_flag_count IS 'Count of unresolved user flags for this card';
COMMENT ON COLUMN public.cards.last_user_flagged_at IS 'Timestamp of most recent user flag for this card';