-- Migration 21: Strict Admin Validation with Additional Security
-- Enhanced validation with audit logging and additional constraints

-- Create enum for admin change reasons (for audit trail)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'admin_change_reason') THEN
        CREATE TYPE admin_change_reason AS ENUM (
            'tier_promotion',
            'tier_demotion', 
            'manual_grant',
            'manual_revoke',
            'system_cleanup',
            'security_audit'
        );
    END IF;
END $$;

-- Create audit table for admin privilege changes
CREATE TABLE IF NOT EXISTS admin_privilege_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    old_user_tier user_tier,
    new_user_tier user_tier,
    old_is_admin BOOLEAN,
    new_is_admin BOOLEAN,
    change_reason admin_change_reason,
    changed_by UUID REFERENCES profiles(id), -- Who made the change
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    notes TEXT,
    
    -- Indexes for audit queries
    INDEX idx_admin_audit_user_id (user_id),
    INDEX idx_admin_audit_changed_at (changed_at),
    INDEX idx_admin_audit_changed_by (changed_by)
);

-- Enhanced function with audit logging and stricter validation
CREATE OR REPLACE FUNCTION enforce_strict_admin_validation()
RETURNS TRIGGER AS $$
DECLARE
    change_reason admin_change_reason;
    current_user_id UUID;
BEGIN
    -- Get current user (who is making the change)
    current_user_id := auth.uid();
    
    -- Determine change reason
    IF TG_OP = 'INSERT' THEN
        change_reason := 'tier_promotion';
    ELSIF OLD.user_tier != NEW.user_tier THEN
        IF NEW.user_tier = 'admin' THEN
            change_reason := 'tier_promotion';
        ELSE
            change_reason := 'tier_demotion';
        END IF;
    ELSIF OLD.is_admin != NEW.is_admin THEN
        IF NEW.is_admin THEN
            change_reason := 'manual_grant';
        ELSE
            change_reason := 'manual_revoke';
        END IF;
    ELSE
        change_reason := 'system_cleanup';
    END IF;

    -- STRICT RULE: is_admin can ONLY be TRUE if user_tier is 'admin'
    IF NEW.user_tier != 'admin' THEN
        NEW.is_admin = FALSE;
    END IF;
    
    -- OPTIONAL: Auto-promote admin tier users to is_admin = TRUE
    -- Uncomment if you want this behavior:
    -- IF NEW.user_tier = 'admin' AND NEW.is_admin IS NOT TRUE THEN
    --     NEW.is_admin = TRUE;
    -- END IF;

    -- Security check: Prevent privilege escalation attempts
    IF TG_OP = 'UPDATE' AND OLD.user_tier != 'admin' AND NEW.user_tier = 'admin' THEN
        -- Log potential privilege escalation attempt
        RAISE WARNING 'Potential privilege escalation attempt detected for user %', NEW.id;
        
        -- You could add additional security checks here, such as:
        -- - Requiring specific permissions to promote to admin
        -- - Notifying security team
        -- - Requiring approval workflow
    END IF;

    -- Audit logging (only if there's actually a change)
    IF TG_OP = 'INSERT' OR 
       (TG_OP = 'UPDATE' AND (OLD.user_tier != NEW.user_tier OR OLD.is_admin != NEW.is_admin)) THEN
        
        INSERT INTO admin_privilege_audit (
            user_id,
            old_user_tier,
            new_user_tier, 
            old_is_admin,
            new_is_admin,
            change_reason,
            changed_by,
            notes
        ) VALUES (
            NEW.id,
            CASE WHEN TG_OP = 'UPDATE' THEN OLD.user_tier ELSE NULL END,
            NEW.user_tier,
            CASE WHEN TG_OP = 'UPDATE' THEN OLD.is_admin ELSE NULL END,
            NEW.is_admin,
            change_reason,
            current_user_id,
            CASE 
                WHEN TG_OP = 'INSERT' THEN 'New user created'
                WHEN change_reason = 'tier_demotion' THEN 'Admin privileges automatically revoked due to tier change'
                WHEN change_reason = 'tier_promotion' THEN 'Admin privileges granted with tier promotion'
                ELSE 'Manual admin privilege change'
            END
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Replace the previous trigger with the enhanced version
DROP TRIGGER IF EXISTS trigger_enforce_admin_tier_consistency ON profiles;
DROP TRIGGER IF EXISTS trigger_enforce_strict_admin_validation ON profiles;

CREATE TRIGGER trigger_enforce_strict_admin_validation
    BEFORE INSERT OR UPDATE OF user_tier, is_admin ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION enforce_strict_admin_validation();

-- Create function to safely promote user to admin (with audit trail)
CREATE OR REPLACE FUNCTION promote_user_to_admin(
    target_user_id UUID,
    promoting_admin_id UUID DEFAULT auth.uid(),
    reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    target_user profiles%ROWTYPE;
    promoting_user profiles%ROWTYPE;
BEGIN
    -- Verify the promoting user is an admin
    SELECT * INTO promoting_user FROM profiles WHERE id = promoting_admin_id;
    IF NOT FOUND OR NOT promoting_user.is_admin THEN
        RAISE EXCEPTION 'Only existing admins can promote users to admin status';
    END IF;
    
    -- Get target user
    SELECT * INTO target_user FROM profiles WHERE id = target_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target user not found';
    END IF;
    
    -- Promote user (trigger will handle the audit logging)
    UPDATE profiles 
    SET user_tier = 'admin', is_admin = TRUE 
    WHERE id = target_user_id;
    
    -- Add detailed audit entry
    INSERT INTO admin_privilege_audit (
        user_id, old_user_tier, new_user_tier, old_is_admin, new_is_admin,
        change_reason, changed_by, notes
    ) VALUES (
        target_user_id, target_user.user_tier, 'admin', target_user.is_admin, TRUE,
        'tier_promotion', promoting_admin_id,
        COALESCE(reason, 'Admin promotion via promote_user_to_admin function')
    );
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to safely demote admin user
CREATE OR REPLACE FUNCTION demote_admin_user(
    target_user_id UUID,
    demoting_admin_id UUID DEFAULT auth.uid(),
    new_tier user_tier DEFAULT 'paid',
    reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    target_user profiles%ROWTYPE;
    demoting_user profiles%ROWTYPE;
BEGIN
    -- Verify the demoting user is an admin
    SELECT * INTO demoting_user FROM profiles WHERE id = demoting_admin_id;
    IF NOT FOUND OR NOT demoting_user.is_admin THEN
        RAISE EXCEPTION 'Only existing admins can demote admin users';
    END IF;
    
    -- Prevent self-demotion (optional safety check)
    IF target_user_id = demoting_admin_id THEN
        RAISE EXCEPTION 'Admins cannot demote themselves';
    END IF;
    
    -- Get target user
    SELECT * INTO target_user FROM profiles WHERE id = target_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target user not found';
    END IF;
    
    IF NOT target_user.is_admin THEN
        RAISE EXCEPTION 'Target user is not an admin';
    END IF;
    
    -- Demote user (trigger will handle the audit logging and is_admin = FALSE)
    UPDATE profiles 
    SET user_tier = new_tier 
    WHERE id = target_user_id;
    
    -- Add detailed audit entry
    INSERT INTO admin_privilege_audit (
        user_id, old_user_tier, new_user_tier, old_is_admin, new_is_admin,
        change_reason, changed_by, notes
    ) VALUES (
        target_user_id, 'admin', new_tier, TRUE, FALSE,
        'tier_demotion', demoting_admin_id,
        COALESCE(reason, 'Admin demotion via demote_admin_user function')
    );
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Clean up existing inconsistent data with audit trail
INSERT INTO admin_privilege_audit (user_id, old_user_tier, new_user_tier, old_is_admin, new_is_admin, change_reason, notes)
SELECT 
    id, user_tier, user_tier, is_admin, FALSE, 'system_cleanup', 
    'Cleanup: Removed admin privileges for non-admin tier users'
FROM profiles 
WHERE user_tier != 'admin' AND is_admin = TRUE;

UPDATE profiles 
SET is_admin = FALSE 
WHERE user_tier != 'admin' AND is_admin = TRUE;

-- Enable RLS on audit table
ALTER TABLE admin_privilege_audit ENABLE ROW LEVEL SECURITY;

-- RLS policy: Only admins can view audit logs
CREATE POLICY admin_privilege_audit_select_policy ON admin_privilege_audit
    FOR SELECT 
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.is_admin = TRUE
        )
    );

-- Grant appropriate permissions
GRANT SELECT ON admin_privilege_audit TO authenticated;
GRANT EXECUTE ON FUNCTION promote_user_to_admin(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION demote_admin_user(UUID, UUID, user_tier, TEXT) TO authenticated;

-- Add helpful comments
COMMENT ON TABLE admin_privilege_audit IS 'Audit trail for all admin privilege changes with security logging';
COMMENT ON FUNCTION promote_user_to_admin IS 'Safely promote user to admin with proper audit trail and validation';
COMMENT ON FUNCTION demote_admin_user IS 'Safely demote admin user with proper audit trail and validation';

-- Log the migration
DO $$
BEGIN
    RAISE NOTICE 'Migration 21 applied: Strict admin validation with audit trail active';
    RAISE NOTICE 'Functions created: promote_user_to_admin(), demote_admin_user()';
    RAISE NOTICE 'Audit table created: admin_privilege_audit';
    RAISE NOTICE 'Enhanced trigger: trigger_enforce_strict_admin_validation';
END $$;