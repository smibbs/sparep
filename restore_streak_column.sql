-- =============================================================================
-- RESTORE STREAK COLUMN FOR STREAK REWARDS SYSTEM
-- =============================================================================
-- 
-- This script restores the streak column that was removed in Phase 1 cleanup
-- We need this column for implementing streak rewards and gamification features
--

BEGIN;

-- Restore the streak column to user_card_progress table
ALTER TABLE user_card_progress 
    ADD COLUMN IF NOT EXISTS streak INT NOT NULL DEFAULT 0;

-- Verify the column was added successfully
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'user_card_progress' 
    AND column_name = 'streak'
    AND table_schema = 'public';

COMMIT;

-- =============================================================================
-- NOTES
-- =============================================================================
-- 
-- This restores functionality for:
-- 1. Session completion (fixes "column does not exist" error)
-- 2. Future streak tracking and reward system
-- 3. Gamification features
--
-- The streak column will be used to track consecutive days of study
-- for individual cards, which can contribute to overall user streak metrics
--
-- =============================================================================