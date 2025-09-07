-- =====================================================
-- Migration 23: Phase 1 - Deck Detach (Non-Breaking)
-- =====================================================
-- Drop deck foreign keys and update session constraints
-- Part of v2 Changes implementation - Phase 1
-- 
-- This migration:
-- 1. Drops foreign key constraints from deck_id columns
-- 2. Keeps columns nullable for legacy data compatibility
-- 3. Restricts session_type to remove deck-specific sessions
-- 4. Maintains backward compatibility with existing data
-- =====================================================

-- Drop foreign key constraints from user_cards.deck_id
ALTER TABLE user_cards DROP CONSTRAINT IF EXISTS user_cards_deck_id_fkey;

-- Drop foreign key constraints from user_sessions.deck_id  
ALTER TABLE user_sessions DROP CONSTRAINT IF EXISTS user_sessions_deck_id_fkey;

-- Drop foreign key constraints from card_deck_assignments
ALTER TABLE card_deck_assignments DROP CONSTRAINT IF EXISTS card_deck_assignments_deck_id_fkey;
ALTER TABLE card_deck_assignments DROP CONSTRAINT IF EXISTS card_deck_assignments_card_template_id_fkey;

-- Update session_type constraint to remove 'deck_specific'
-- First drop the existing constraint
ALTER TABLE user_sessions DROP CONSTRAINT IF EXISTS user_sessions_session_type_check;

-- Add new constraint with only 'daily_free' and 'general_unlimited'
ALTER TABLE user_sessions ADD CONSTRAINT user_sessions_session_type_check 
    CHECK (session_type = ANY (ARRAY['daily_free'::text, 'general_unlimited'::text]));

-- Update table comments to reflect the new structure
COMMENT ON COLUMN user_cards.deck_id IS 'Legacy column - kept for compatibility but no longer enforced with foreign key';
COMMENT ON COLUMN user_sessions.deck_id IS 'Legacy column - kept for compatibility but no longer enforced with foreign key';
COMMENT ON TABLE card_deck_assignments IS 'Legacy junction table - foreign keys removed as part of deck detachment phase';

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Phase 1 complete: Foreign keys dropped, columns kept nullable
-- Next: Update application code to remove deck dependencies