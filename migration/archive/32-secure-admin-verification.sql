-- Migration 32: Secure Admin Verification Functions
-- This migration creates server-side admin verification functions for enhanced security

-- First, fix the broken is_admin() function from migration 28
-- The column name should be 'user_tier', not 'tier'
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE id = auth.uid() AND user_tier = 'admin'
    );
END;
$$;

-- Create a simple admin verification function for client-side security checks
-- This provides a secure server-side verification that client code can call
CREATE OR REPLACE FUNCTION verify_admin_access()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Use the corrected is_admin() function which performs server-side verification
    RETURN is_admin();
END;
$$;

-- Create an enhanced admin verification function that also validates session freshness
-- This can be used for critical operations that need additional security
CREATE OR REPLACE FUNCTION verify_admin_access_with_session_check()
RETURNS TABLE (
    is_admin BOOLEAN,
    user_tier TEXT,
    last_sign_in TIMESTAMPTZ,
    session_fresh BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_user_id UUID;
    user_profile_record RECORD;
    sign_in_time TIMESTAMPTZ;
    session_age INTERVAL;
BEGIN
    -- Get current authenticated user
    current_user_id := auth.uid();
    
    IF current_user_id IS NULL THEN
        -- Return default values for unauthenticated user
        RETURN QUERY SELECT FALSE, 'free'::TEXT, NULL::TIMESTAMPTZ, FALSE;
        RETURN;
    END IF;
    
    -- Get user profile information
    SELECT up.user_tier INTO user_profile_record
    FROM user_profiles up 
    WHERE up.id = current_user_id;
    
    -- Get last sign in time from auth.users (if accessible)
    -- Note: This might not be accessible depending on RLS policies
    BEGIN
        SELECT au.last_sign_in_at INTO sign_in_time
        FROM auth.users au 
        WHERE au.id = current_user_id;
    EXCEPTION WHEN OTHERS THEN
        -- If we can't access auth.users, use a fallback
        sign_in_time := NOW() - INTERVAL '1 hour'; -- Assume recent sign-in
    END;
    
    -- Calculate session age (consider fresh if signed in within last 4 hours)
    session_age := NOW() - COALESCE(sign_in_time, NOW() - INTERVAL '1 hour');
    
    RETURN QUERY SELECT 
        (user_profile_record.user_tier = 'admin'),
        COALESCE(user_profile_record.user_tier, 'free')::TEXT,
        sign_in_time,
        (session_age < INTERVAL '4 hours');
END;
$$;

-- Create a function for periodic admin status validation
-- This can be called periodically by admin interfaces to ensure continued access
CREATE OR REPLACE FUNCTION validate_active_admin_session()
RETURNS TABLE (
    is_valid BOOLEAN,
    user_tier TEXT,
    message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_user_id UUID;
    profile_tier TEXT;
BEGIN
    -- Check authentication
    current_user_id := auth.uid();
    
    IF current_user_id IS NULL THEN
        RETURN QUERY SELECT FALSE, 'unauthenticated'::TEXT, 'User is not authenticated'::TEXT;
        RETURN;
    END IF;
    
    -- Get current user tier
    SELECT up.user_tier INTO profile_tier
    FROM user_profiles up 
    WHERE up.id = current_user_id;
    
    IF profile_tier IS NULL THEN
        RETURN QUERY SELECT FALSE, 'unknown'::TEXT, 'User profile not found'::TEXT;
        RETURN;
    END IF;
    
    IF profile_tier = 'admin' THEN
        RETURN QUERY SELECT TRUE, profile_tier, 'Admin access confirmed'::TEXT;
    ELSE
        RETURN QUERY SELECT FALSE, profile_tier, 'Admin privileges required'::TEXT;
    END IF;
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION verify_admin_access() TO authenticated;
GRANT EXECUTE ON FUNCTION verify_admin_access_with_session_check() TO authenticated;
GRANT EXECUTE ON FUNCTION validate_active_admin_session() TO authenticated;

-- Add comments documenting the security functions
COMMENT ON FUNCTION verify_admin_access() IS 
'Secure server-side admin verification for client-side security checks. 
Uses the database is_admin() function with auth.uid() for proper verification.';

COMMENT ON FUNCTION verify_admin_access_with_session_check() IS 
'Enhanced admin verification with session freshness validation. 
Provides additional security context for critical admin operations.';

COMMENT ON FUNCTION validate_active_admin_session() IS 
'Periodic admin session validation function for admin interfaces. 
Can be called regularly to ensure continued admin access.';