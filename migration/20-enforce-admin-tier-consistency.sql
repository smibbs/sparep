-- Migration 20: Enforce Admin Tier Consistency
-- Automatically ensures is_admin can only be TRUE when user_tier is 'admin'

-- Create function to enforce admin tier consistency
CREATE OR REPLACE FUNCTION enforce_admin_tier_consistency()
RETURNS TRIGGER AS $$
BEGIN
    -- Force is_admin to FALSE if user_tier is not 'admin'
    IF NEW.user_tier != 'admin' THEN
        NEW.is_admin = FALSE;
    END IF;
    
    -- If user_tier is 'admin', ensure is_admin is TRUE for consistency
    -- (Optional: Remove this if you want admin tier without admin privileges)
    IF NEW.user_tier = 'admin' AND NEW.is_admin IS NOT TRUE THEN
        NEW.is_admin = TRUE;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger that fires BEFORE INSERT OR UPDATE on profiles
DROP TRIGGER IF EXISTS trigger_enforce_admin_tier_consistency ON profiles;
CREATE TRIGGER trigger_enforce_admin_tier_consistency
    BEFORE INSERT OR UPDATE OF user_tier, is_admin ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION enforce_admin_tier_consistency();

-- Clean up existing inconsistent data
-- Set is_admin to FALSE for all users where user_tier is not 'admin'
UPDATE profiles 
SET is_admin = FALSE 
WHERE user_tier != 'admin' AND is_admin = TRUE;

-- Optional: Set is_admin to TRUE for all users where user_tier is 'admin' but is_admin is FALSE
-- Uncomment the next line if you want this behavior:
-- UPDATE profiles SET is_admin = TRUE WHERE user_tier = 'admin' AND is_admin = FALSE;

-- Add comment documenting the constraint
COMMENT ON FUNCTION enforce_admin_tier_consistency() IS 
'Automatically enforces that is_admin can only be TRUE when user_tier is admin. 
This prevents privilege escalation and ensures data consistency.
Trigger fires on INSERT/UPDATE of user_tier or is_admin columns.';

-- Log the migration
DO $$
BEGIN
    RAISE NOTICE 'Migration 20 applied: Admin tier consistency enforcement active';
    RAISE NOTICE 'Trigger created: trigger_enforce_admin_tier_consistency';
    RAISE NOTICE 'Existing inconsistent data cleaned up';
END $$;