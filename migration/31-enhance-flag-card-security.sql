-- Migration 31: Enhanced Security for Card Flagging System
-- This migration improves input validation and sanitization for the flag_card_for_review function
-- to prevent XSS attacks and ensure data integrity

-- Drop the current simplified version and restore comprehensive validation
DROP FUNCTION IF EXISTS flag_card_for_review(UUID, TEXT) CASCADE;

-- Create enhanced flag_card_for_review function with proper validation and sanitization
CREATE OR REPLACE FUNCTION flag_card_for_review(
    p_card_id UUID,
    p_reason TEXT,
    p_comment TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_tier user_tier;
    sanitized_comment TEXT;
BEGIN
    -- Check if user is authenticated
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'User must be authenticated to flag cards';
    END IF;
    
    -- Validate card_id
    IF p_card_id IS NULL THEN
        RAISE EXCEPTION 'Card ID is required for flagging';
    END IF;
    
    -- Validate reason (must match enum values)
    IF p_reason IS NULL OR p_reason = '' THEN
        RAISE EXCEPTION 'Reason is required for flagging card';
    END IF;
    
    -- Normalize and validate reason against enum
    p_reason := LOWER(TRIM(p_reason));
    IF p_reason NOT IN ('incorrect', 'spelling', 'confusing', 'other') THEN
        RAISE EXCEPTION 'Invalid flag reason. Must be one of: incorrect, spelling, confusing, other';
    END IF;
    
    -- Validate and sanitize comment
    IF p_comment IS NOT NULL THEN
        -- Check length limit
        IF LENGTH(p_comment) > 500 THEN
            RAISE EXCEPTION 'Comment too long. Maximum 500 characters allowed';
        END IF;
        
        -- Basic sanitization at database level as backup defense
        sanitized_comment := TRIM(p_comment);
        -- Remove potentially dangerous patterns
        sanitized_comment := REGEXP_REPLACE(sanitized_comment, '<[^>]*>', '', 'g'); -- Remove HTML tags
        sanitized_comment := REGEXP_REPLACE(sanitized_comment, 'javascript:', '', 'gi'); -- Remove javascript:
        sanitized_comment := REGEXP_REPLACE(sanitized_comment, 'data:', '', 'gi'); -- Remove data:
        sanitized_comment := REGEXP_REPLACE(sanitized_comment, 'vbscript:', '', 'gi'); -- Remove vbscript:
        
        -- If comment becomes empty after sanitization, set to null
        IF sanitized_comment = '' THEN
            sanitized_comment := NULL;
        END IF;
    ELSE
        sanitized_comment := NULL;
    END IF;
    
    -- Get user tier
    SELECT up.user_tier INTO user_tier 
    FROM public.user_profiles up
    WHERE up.id = auth.uid();
    
    -- Only allow free and paid users to flag (admins manage flags differently)
    IF user_tier = 'admin' THEN
        RAISE EXCEPTION 'Admin users should use admin interface for card management';
    END IF;
    
    -- Insert flag record (will fail if duplicate due to unique constraint)
    INSERT INTO public.user_card_flags (user_id, card_id, reason, comment, flagged_at)
    VALUES (auth.uid(), p_card_id, p_reason::flag_reason, sanitized_comment, NOW());
    
    -- Update card flag count
    UPDATE public.cards 
    SET flag_count = flag_count + 1,
        updated_at = NOW()
    WHERE id = p_card_id;
    
    RETURN TRUE;
    
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'You have already flagged this card';
    WHEN foreign_key_violation THEN
        RAISE EXCEPTION 'Card not found or invalid card ID';
    WHEN check_violation THEN
        RAISE EXCEPTION 'Invalid input data for flagging';
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION flag_card_for_review(UUID, TEXT, TEXT) TO authenticated;

-- Add comment documenting the security enhancements
COMMENT ON FUNCTION flag_card_for_review(UUID, TEXT, TEXT) IS 
'Enhanced card flagging function with comprehensive input validation and sanitization. 
Validates reason against enum values, enforces comment length limits, and provides 
database-level sanitization as defense-in-depth against XSS attacks.';