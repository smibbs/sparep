-- =====================================================
-- Migration 20: Global Deck Assignments
-- =====================================================
-- Moves deck_id from user_cards to card_templates
-- making deck assignments global rather than per-user
-- Requires: All previous migrations
-- =====================================================

-- =====================================================
-- PHASE 1: ADD DECK_ID TO CARD_TEMPLATES
-- =====================================================

-- Add deck_id column to card_templates
ALTER TABLE card_templates 
ADD COLUMN deck_id UUID REFERENCES decks(id) ON DELETE SET NULL;

-- Create index for better performance
CREATE INDEX idx_card_templates_deck_id ON card_templates(deck_id);

-- =====================================================
-- PHASE 2: MIGRATE EXISTING CARD-DECK RELATIONSHIPS
-- =====================================================

-- Update card_templates.deck_id based on existing user_cards relationships
-- Since we confirmed no duplicates exist, this is straightforward
UPDATE card_templates ct
SET deck_id = (
    SELECT DISTINCT uc.deck_id 
    FROM user_cards uc 
    WHERE uc.card_template_id = ct.id 
    LIMIT 1
);

-- =====================================================
-- PHASE 3: REMOVE DUPLICATE USER_CARDS (NONE EXIST)
-- =====================================================
-- Skip this phase - analysis confirmed no duplicates exist

-- =====================================================
-- PHASE 4: UPDATE USER_CARDS PRIMARY KEY
-- =====================================================

-- Drop the existing primary key constraint
ALTER TABLE user_cards DROP CONSTRAINT user_cards_pkey;

-- Create new primary key without deck_id
ALTER TABLE user_cards ADD CONSTRAINT user_cards_pkey 
PRIMARY KEY (user_id, card_template_id);

-- =====================================================
-- PHASE 5: REMOVE DECK_ID FROM USER_CARDS
-- =====================================================

-- Drop foreign key constraint first
ALTER TABLE user_cards DROP CONSTRAINT user_cards_deck_id_fkey;

-- Drop the deck_id column
ALTER TABLE user_cards DROP COLUMN deck_id;

-- =====================================================
-- PHASE 6: REMOVE DECK_ID FROM REVIEWS TABLE
-- =====================================================

-- Drop foreign key constraint
ALTER TABLE reviews DROP CONSTRAINT reviews_deck_id_fkey;

-- Drop the deck_id column
ALTER TABLE reviews DROP COLUMN deck_id;

-- =====================================================
-- PHASE 7: UPDATE DATABASE VIEWS
-- =====================================================

-- Drop and recreate v_due_counts_by_deck view
DROP VIEW IF EXISTS v_due_counts_by_deck CASCADE;

CREATE VIEW v_due_counts_by_deck AS
WITH deck_counts AS (
    SELECT 
        ct.deck_id,
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
    JOIN card_templates ct ON ct.id = uc.card_template_id
    WHERE ct.flagged_for_review = FALSE
    AND ct.deck_id IS NOT NULL
    GROUP BY ct.deck_id, uc.user_id
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

-- =====================================================
-- PHASE 8: UPDATE HELPER FUNCTIONS
-- =====================================================

-- Update add_card_to_deck function to work with global deck assignments
DROP FUNCTION IF EXISTS add_card_to_deck(UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION add_card_to_deck(
    p_user_id UUID,
    p_card_template_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    card_deck_id UUID;
    card_exists BOOLEAN;
BEGIN
    -- Get the deck assigned to this card template
    SELECT deck_id INTO card_deck_id
    FROM card_templates 
    WHERE id = p_card_template_id 
    AND flagged_for_review = FALSE
    AND (is_public = TRUE OR creator_id = p_user_id);
    
    IF card_deck_id IS NULL THEN
        RAISE EXCEPTION 'Card not found, not accessible, or not assigned to a deck';
    END IF;
    
    -- Check if user already has this card
    SELECT EXISTS (
        SELECT 1 FROM user_cards 
        WHERE user_id = p_user_id AND card_template_id = p_card_template_id
    ) INTO card_exists;
    
    IF card_exists THEN
        RETURN FALSE; -- Card already exists for user
    END IF;
    
    -- Add card to user
    INSERT INTO user_cards (user_id, card_template_id)
    VALUES (p_user_id, p_card_template_id);
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update remove_card_from_deck function
DROP FUNCTION IF EXISTS remove_card_from_deck(UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION remove_card_from_deck(
    p_user_id UUID,
    p_card_template_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    cards_removed INTEGER;
BEGIN
    -- Remove card BUT PRESERVE FSRS PROGRESS
    DELETE FROM user_cards
    WHERE user_id = p_user_id 
    AND card_template_id = p_card_template_id
    AND state = 'new'  -- Only remove unstudied cards to preserve FSRS progress
    AND total_reviews = 0; -- Double-check no progress exists
    
    GET DIAGNOSTICS cards_removed = ROW_COUNT;
    
    RETURN cards_removed > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- PHASE 9: UPDATE ADMIN FUNCTIONS
-- =====================================================

-- Update admin functions to assign cards to decks globally
DROP FUNCTION IF EXISTS admin_add_cards_by_path(UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION admin_assign_cards_to_deck_by_path(
    p_admin_id UUID,
    p_deck_id UUID,
    p_path_pattern TEXT
)
RETURNS INTEGER AS $$
DECLARE
    is_admin BOOLEAN;
    deck_owner UUID;
    path_ltree LTREE;
    cards_updated INTEGER := 0;
BEGIN
    -- Verify admin privileges
    SELECT profiles.is_admin INTO is_admin
    FROM profiles
    WHERE id = p_admin_id;
    
    IF NOT is_admin THEN
        RAISE EXCEPTION 'Admin privileges required';
    END IF;
    
    -- Verify deck is admin-owned
    SELECT user_id INTO deck_owner
    FROM decks
    WHERE id = p_deck_id;
    
    IF deck_owner != p_admin_id THEN
        RAISE EXCEPTION 'Can only assign cards to admin-owned decks';
    END IF;
    
    -- Convert path to LTREE
    BEGIN
        path_ltree := p_path_pattern::LTREE;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE EXCEPTION 'Invalid LTREE path format: %', p_path_pattern;
    END;
    
    -- Assign all matching cards to this deck
    UPDATE card_templates
    SET deck_id = p_deck_id, updated_at = NOW()
    WHERE path IS NOT NULL
    AND (path <@ path_ltree OR path ~ (p_path_pattern || '.*')::lquery)
    AND flagged_for_review = FALSE
    AND is_public = TRUE;
    
    GET DIAGNOSTICS cards_updated = ROW_COUNT;
    
    RETURN cards_updated;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to assign individual card to deck
CREATE OR REPLACE FUNCTION admin_assign_card_to_deck(
    p_admin_id UUID,
    p_card_template_id UUID,
    p_deck_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    is_admin BOOLEAN;
    deck_owner UUID;
BEGIN
    -- Verify admin privileges
    SELECT profiles.is_admin INTO is_admin
    FROM profiles
    WHERE id = p_admin_id;
    
    IF NOT is_admin THEN
        RAISE EXCEPTION 'Admin privileges required';
    END IF;
    
    -- Verify deck is admin-owned
    SELECT user_id INTO deck_owner
    FROM decks
    WHERE id = p_deck_id;
    
    IF deck_owner != p_admin_id THEN
        RAISE EXCEPTION 'Can only assign cards to admin-owned decks';
    END IF;
    
    -- Assign card to deck
    UPDATE card_templates
    SET deck_id = p_deck_id, updated_at = NOW()
    WHERE id = p_card_template_id
    AND flagged_for_review = FALSE;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- PHASE 10: AUTO-ASSIGN PUBLIC DECK CARDS TO USERS
-- =====================================================

-- Function to auto-assign all public deck cards to all users
CREATE OR REPLACE FUNCTION auto_assign_public_deck_cards()
RETURNS INTEGER AS $$
DECLARE
    cards_added INTEGER := 0;
BEGIN
    -- Add all cards from public decks to all users (if they don't already have them)
    INSERT INTO user_cards (user_id, card_template_id)
    SELECT DISTINCT
        p.id as user_id,
        ct.id as card_template_id
    FROM profiles p
    CROSS JOIN card_templates ct
    JOIN decks d ON d.id = ct.deck_id
    WHERE d.is_public = TRUE
    AND ct.flagged_for_review = FALSE
    AND ct.deck_id IS NOT NULL
    AND NOT EXISTS (
        -- Don't add if user already has this card
        SELECT 1 FROM user_cards uc 
        WHERE uc.user_id = p.id 
        AND uc.card_template_id = ct.id
    );
    
    GET DIAGNOSTICS cards_added = ROW_COUNT;
    
    RETURN cards_added;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Execute the auto-assignment for existing users
SELECT auto_assign_public_deck_cards() as cards_auto_assigned;

-- =====================================================
-- PHASE 11: CLEANUP OLD FUNCTIONS
-- =====================================================

-- Drop old functions that are no longer needed
DROP FUNCTION IF EXISTS add_subject_to_deck(UUID, UUID, UUID);
DROP FUNCTION IF EXISTS remove_subject_from_deck(UUID, UUID, UUID);
DROP FUNCTION IF EXISTS add_card_to_deck_by_path(UUID, UUID, LTREE);
DROP FUNCTION IF EXISTS remove_card_from_deck_by_path(UUID, UUID, LTREE);
DROP FUNCTION IF EXISTS get_deck_subjects(UUID, UUID);
DROP FUNCTION IF EXISTS get_cards_available_for_deck(UUID, UUID, INTEGER);

-- Drop deck_subjects table as it's no longer needed
DROP TABLE IF EXISTS deck_subjects CASCADE;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- 
-- SUMMARY OF CHANGES:
-- 1. Added deck_id to card_templates (global deck assignment)
-- 2. Removed deck_id from user_cards and reviews tables
-- 3. Updated primary key constraint on user_cards
-- 4. Updated all database functions for new structure
-- 5. Auto-assigned all public deck cards to existing users
-- 6. Cleaned up obsolete functions and tables
--
-- RESULT:
-- - Cards are now globally assigned to decks by admins
-- - Users automatically get all cards from public decks
-- - Simplified data model with no user-specific deck assignments
-- - All FSRS functionality preserved
-- 
-- =====================================================