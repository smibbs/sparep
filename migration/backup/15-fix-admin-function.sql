-- Migration: 15-fix-admin-function.sql
-- Description: Updates the is_admin function to check user_tier column instead of is_admin column
-- Dependencies: 03-user-profiles.sql

-- Update the is_admin helper function to check user_tier instead of is_admin
CREATE OR REPLACE FUNCTION is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE id = user_id AND user_tier = 'admin'
    );
END;
$$ language 'plpgsql' SECURITY DEFINER;

-- Update the comment
COMMENT ON FUNCTION is_admin IS 'Helper function to check if a user has admin privileges via user_tier column';