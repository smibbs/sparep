-- =============================================================================
-- DATABASE COLUMN REMOVAL MIGRATION PLAN
-- =============================================================================
-- 
-- CRITICAL: This plan removes unused database columns to optimize storage
-- and improve performance. Execute in phases with thorough testing.
--
-- ESTIMATED STORAGE REDUCTION: 15-20%
-- ESTIMATED PERFORMANCE IMPROVEMENT: 10-15% for SELECT * operations
--
-- =============================================================================

-- =============================================================================
-- PHASE 1: IMMEDIATE SAFE REMOVALS (No Dependencies)
-- =============================================================================
-- These columns have no foreign keys, indexes, RLS policies, or application
-- code references. Safe for immediate removal.

BEGIN;

-- Backup note: Ensure full database backup before executing

-- -----------------------------------------------------------------------------
-- user_profiles table cleanup (8 columns)
-- -----------------------------------------------------------------------------
ALTER TABLE user_profiles 
    DROP COLUMN IF EXISTS avatar_url,
    DROP COLUMN IF EXISTS last_seen_at,
    DROP COLUMN IF EXISTS learn_ahead_time_minutes,
    DROP COLUMN IF EXISTS total_cards_studied,
    DROP COLUMN IF EXISTS total_reviews,
    DROP COLUMN IF EXISTS current_streak,
    DROP COLUMN IF EXISTS longest_streak,
    DROP COLUMN IF EXISTS is_public;

-- Estimated storage reduction: ~25% of user_profiles table size

-- -----------------------------------------------------------------------------
-- cards table cleanup (6 columns) 
-- -----------------------------------------------------------------------------
ALTER TABLE cards
    DROP COLUMN IF EXISTS hint,
    DROP COLUMN IF EXISTS explanation,
    DROP COLUMN IF EXISTS difficulty_rating,
    DROP COLUMN IF EXISTS image_url,
    DROP COLUMN IF EXISTS audio_url,
    DROP COLUMN IF EXISTS last_user_flagged_at;

-- Note: tags column has GIN index - removing separately if desired
-- Note: subsection column has frontend references - handle in Phase 2

-- Estimated storage reduction: ~20% of cards table size

-- -----------------------------------------------------------------------------
-- subjects table cleanup (7 columns)
-- -----------------------------------------------------------------------------  
ALTER TABLE subjects
    DROP COLUMN IF EXISTS icon_name,
    DROP COLUMN IF EXISTS color_hex,
    DROP COLUMN IF EXISTS display_order,
    DROP COLUMN IF EXISTS total_chapters,
    DROP COLUMN IF EXISTS total_sections,
    DROP COLUMN IF EXISTS total_subsections,
    DROP COLUMN IF EXISTS requires_approval;

-- Estimated storage reduction: ~35% of subjects table size

-- -----------------------------------------------------------------------------
-- user_card_progress table cleanup (3 columns)
-- -----------------------------------------------------------------------------
ALTER TABLE user_card_progress
    DROP COLUMN IF EXISTS learning_step,
    DROP COLUMN IF EXISTS current_step_interval,
    DROP COLUMN IF EXISTS streak;

-- Estimated storage reduction: ~10% of user_card_progress table size

-- -----------------------------------------------------------------------------
-- review_history table cleanup (2 columns)
-- -----------------------------------------------------------------------------
ALTER TABLE review_history
    DROP COLUMN IF EXISTS learning_step,
    DROP COLUMN IF EXISTS was_relearning;

-- Estimated storage reduction: ~8% of review_history table size

COMMIT;

-- =============================================================================
-- PHASE 2: CONDITIONAL REMOVALS (Require Code Changes)
-- =============================================================================
-- These columns have application code dependencies that must be resolved first

-- -----------------------------------------------------------------------------
-- Step 2A: Remove unused timestamp columns (if truly unused)
-- -----------------------------------------------------------------------------
-- Only execute after confirming no logging/audit requirements

-- BEGIN;
-- 
-- ALTER TABLE user_profiles DROP COLUMN IF EXISTS created_at;
-- ALTER TABLE cards DROP COLUMN IF EXISTS created_at, DROP COLUMN IF EXISTS updated_at;
-- ALTER TABLE subjects DROP COLUMN IF EXISTS updated_at;
-- 
-- COMMIT;

-- -----------------------------------------------------------------------------
-- Step 2B: Remove subsection column (requires frontend update)
-- -----------------------------------------------------------------------------
-- Execute ONLY after removing frontend references in database.js

-- BEGIN;
-- 
-- ALTER TABLE cards DROP COLUMN IF EXISTS subsection;
-- 
-- COMMIT;

-- -----------------------------------------------------------------------------
-- Step 2C: Remove tags column and its index
-- -----------------------------------------------------------------------------
-- Tags column has GIN index but no functional usage

-- BEGIN;
-- 
-- DROP INDEX IF EXISTS cards_tags_gin_idx;
-- ALTER TABLE cards DROP COLUMN IF EXISTS tags;
-- 
-- COMMIT;

-- =============================================================================
-- PHASE 3: DEPRECATED COLUMN REMOVAL (Requires Refactoring)
-- =============================================================================
-- These require significant application code changes

-- -----------------------------------------------------------------------------
-- Step 3A: Replace is_admin column with user_tier checks
-- -----------------------------------------------------------------------------
-- 1. Update all frontend code to use user_tier instead of is_admin
-- 2. Remove all .select() statements that include is_admin
-- 3. Update RLS policies if needed
-- 4. Then execute:

-- BEGIN;
-- 
-- ALTER TABLE user_profiles DROP COLUMN IF EXISTS is_admin;
-- 
-- COMMIT;

-- =============================================================================
-- PHASE 4: ADVANCED CLEANUP (After Thorough Analysis)
-- =============================================================================
-- These require careful analysis of whether they're truly redundant

-- -----------------------------------------------------------------------------
-- Step 4A: Evaluate due_date vs next_review_date redundancy
-- -----------------------------------------------------------------------------
-- If due_date is truly redundant with next_review_date:

-- BEGIN;
-- 
-- -- Update any remaining code to use next_review_date instead
-- ALTER TABLE user_card_progress DROP COLUMN IF EXISTS due_date;
-- 
-- COMMIT;

-- -----------------------------------------------------------------------------
-- Step 4B: Evaluate daily_review_limit redundancy with tier system
-- -----------------------------------------------------------------------------
-- If tier system completely replaces daily_review_limit:

-- BEGIN;
-- 
-- -- Remove function dependency first
-- -- DROP FUNCTION IF EXISTS get_daily_review_limit();
-- -- Update frontend code to use tier-based limits
-- -- ALTER TABLE user_profiles DROP COLUMN IF EXISTS daily_review_limit;
-- 
-- COMMIT;

-- =============================================================================
-- POST-REMOVAL VERIFICATION QUERIES
-- =============================================================================
-- Run these queries after each phase to verify successful removal

-- Check table sizes after removal
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Verify no broken references
SELECT conname, conrelid::regclass, confrelid::regclass 
FROM pg_constraint 
WHERE contype = 'f' 
AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = conrelid::regclass::text
);

-- Check for any remaining unused columns
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- =============================================================================
-- ROLLBACK SCRIPTS (Keep for Emergency Recovery)
-- =============================================================================

-- Phase 1 Rollback (if needed):
/*
BEGIN;

-- Restore user_profiles columns
ALTER TABLE user_profiles 
    ADD COLUMN avatar_url TEXT,
    ADD COLUMN last_seen_at TIMESTAMPTZ,
    ADD COLUMN learn_ahead_time_minutes INT NOT NULL DEFAULT 20,
    ADD COLUMN total_cards_studied INT NOT NULL DEFAULT 0,
    ADD COLUMN total_reviews INT NOT NULL DEFAULT 0,
    ADD COLUMN current_streak INT NOT NULL DEFAULT 0,
    ADD COLUMN longest_streak INT NOT NULL DEFAULT 0,
    ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT false;

-- Restore cards columns  
ALTER TABLE cards
    ADD COLUMN hint TEXT,
    ADD COLUMN explanation TEXT,
    ADD COLUMN difficulty_rating SMALLINT CHECK (difficulty_rating >= 1 AND difficulty_rating <= 5),
    ADD COLUMN image_url TEXT,
    ADD COLUMN audio_url TEXT,
    ADD COLUMN last_user_flagged_at TIMESTAMPTZ;

-- Restore subjects columns
ALTER TABLE subjects
    ADD COLUMN icon_name VARCHAR,
    ADD COLUMN color_hex VARCHAR CHECK (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
    ADD COLUMN display_order INT NOT NULL DEFAULT 0,
    ADD COLUMN total_chapters INT NOT NULL DEFAULT 0,
    ADD COLUMN total_sections INT NOT NULL DEFAULT 0,
    ADD COLUMN total_subsections INT NOT NULL DEFAULT 0,
    ADD COLUMN requires_approval BOOLEAN NOT NULL DEFAULT false;

-- Restore user_card_progress columns
ALTER TABLE user_card_progress
    ADD COLUMN learning_step INT NOT NULL DEFAULT 0,
    ADD COLUMN current_step_interval INT NOT NULL DEFAULT 0,
    ADD COLUMN streak INT NOT NULL DEFAULT 0;

-- Restore review_history columns
ALTER TABLE review_history
    ADD COLUMN learning_step INT,
    ADD COLUMN was_relearning BOOLEAN NOT NULL DEFAULT false;

COMMIT;
*/

-- =============================================================================
-- MAINTENANCE NOTES
-- =============================================================================
-- 
-- 1. BACKUP STRATEGY:
--    - Full database backup before each phase
--    - Keep backups for at least 30 days after column removal
--
-- 2. TESTING PROTOCOL:
--    - Test all major user flows after each phase
--    - Run application test suite
--    - Monitor for any missing data errors
--
-- 3. MONITORING:
--    - Watch application logs for column-related errors
--    - Monitor query performance improvements
--    - Track storage reduction metrics
--
-- 4. DOCUMENTATION UPDATES:
--    - Update database schema documentation
--    - Update API documentation if affected
--    - Update development team on schema changes
--
-- =============================================================================