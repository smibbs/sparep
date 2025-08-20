-- =====================================================
-- Migration 15: Admin-Only Deck Management
-- =====================================================
-- This migration restricts deck creation and modification to admins only
-- and adds a public flag for sharing decks across users.
-- 
-- BREAKING CHANGES:
-- - Users can no longer create, update, or delete decks
-- - Only admins can manage decks
-- - Adds is_public column for admin-controlled public decks
-- =====================================================

-- Add is_public column to decks table
ALTER TABLE decks 
ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT FALSE;

-- Add index for public deck queries
CREATE INDEX idx_decks_is_public ON decks(is_public);

-- =====================================================
-- UPDATE RLS POLICIES - REMOVE USER DECK MANAGEMENT
-- =====================================================

-- Remove existing user policies for decks
DROP POLICY IF EXISTS "Users can view their own decks" ON decks;
DROP POLICY IF EXISTS "Users can create their own decks" ON decks;
DROP POLICY IF EXISTS "Users can update their own decks" ON decks;
DROP POLICY IF EXISTS "Users can delete their own decks" ON decks;

-- Keep admin policy (already exists)
-- "Admins can manage all decks" should remain unchanged

-- Add new policy for users to view public decks only
CREATE POLICY "Users can view public decks" ON decks
    FOR SELECT USING (is_public = TRUE);

-- Add policy for users to access public deck data for studying
-- This allows users to see deck info when studying cards from public decks
CREATE POLICY "Users can access public deck study data" ON decks
    FOR SELECT USING (
        is_public = TRUE OR 
        EXISTS (
            SELECT 1 FROM user_cards uc 
            WHERE uc.deck_id = decks.id AND uc.user_id = auth.uid()
        )
    );

-- =====================================================
-- UPDATE VIEWS TO HANDLE PUBLIC DECKS
-- =====================================================

-- Update v_due_counts_by_deck view to include public deck access
DROP VIEW IF EXISTS v_due_counts_by_deck CASCADE;

CREATE VIEW v_due_counts_by_deck AS
WITH deck_counts AS (
    SELECT 
        uc.deck_id,
        uc.user_id,
        COUNT(*) as total_cards,
        COUNT(*) FILTER (WHERE uc.state = 'new') as new_count,
        COUNT(*) FILTER (WHERE uc.state = 'learning') as learning_count,
        COUNT(*) FILTER (WHERE uc.state = 'review') as review_count,
        COUNT(*) FILTER (WHERE uc.state = 'relearning') as relearning_count,
        COUNT(*) FILTER (WHERE uc.state = 'suspended') as suspended_count,
        COUNT(*) FILTER (WHERE uc.state = 'buried') as buried_count,
        COUNT(*) FILTER (WHERE 
            uc.state IN ('learning', 'review', 'relearning') 
            AND uc.due_at <= NOW()
        ) as total_due_count
    FROM user_cards uc
    WHERE EXISTS (
        SELECT 1 FROM card_templates ct 
        WHERE ct.id = uc.card_template_id 
        AND ct.flagged_for_review = FALSE
    )
    GROUP BY uc.deck_id, uc.user_id
)
SELECT 
    dc.*,
    d.name as deck_name,
    d.description as deck_description,
    d.is_active as deck_is_active,
    d.is_public as deck_is_public,
    d.daily_new_cards_limit,
    d.daily_review_limit,
    d.desired_retention,
    d.user_id as deck_owner_id,
    d.created_at as deck_created_at,
    d.updated_at as deck_updated_at
FROM deck_counts dc
JOIN decks d ON d.id = dc.deck_id
WHERE d.is_active = TRUE;

-- Note: Views inherit RLS from their underlying tables
-- No need to set RLS policies directly on views

-- =====================================================
-- UPDATE HELPER FUNCTIONS
-- =====================================================

-- Update create_default_deck_for_user to only work for admins
DROP FUNCTION IF EXISTS create_default_deck_for_user(UUID);

CREATE OR REPLACE FUNCTION create_default_deck_for_user(target_user_id UUID, admin_user_id UUID DEFAULT NULL)
RETURNS UUID AS $$
DECLARE
    new_deck_id UUID;
    calling_user_id UUID;
BEGIN
    -- Get the calling user (use provided admin_user_id or current auth user)
    calling_user_id := COALESCE(admin_user_id, auth.uid());
    
    -- Verify the calling user is an admin
    IF NOT EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = calling_user_id AND is_admin = TRUE
    ) THEN
        RAISE EXCEPTION 'Only administrators can create decks for users';
    END IF;

    -- Create the default deck (owned by the target user, but created by admin)
    INSERT INTO decks (user_id, name, description, is_public)
    VALUES (
        target_user_id,
        'Default Deck',
        'Default study deck created by administrator.',
        FALSE  -- Not public by default
    )
    RETURNING id INTO new_deck_id;
    
    RETURN new_deck_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- MIGRATION NOTES
-- =====================================================
-- 
-- This migration implements the following changes:
-- 
-- 1. ADDED: is_public column to decks table
-- 2. REMOVED: All user RLS policies for deck management
-- 3. ADDED: Public deck viewing policy for users  
-- 4. UPDATED: Views to handle public deck access
-- 5. UPDATED: Helper functions to require admin privileges
--
-- IMPACT:
-- - Existing users can no longer create/modify decks
-- - Existing decks remain intact and functional
-- - Users can still study cards from their assigned decks
-- - Admins can mark decks as public for sharing
-- - Admin panel retains full deck management capabilities
--
-- =====================================================

-- Mark migration as complete
-- Next steps: Update frontend to remove user deck functionality