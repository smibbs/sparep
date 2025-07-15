-- =============================================================================
-- CORRECTED DATABASE COLUMN REMOVAL MIGRATION PLAN
-- =============================================================================
-- 
-- CRITICAL: This plan addresses RLS policy dependencies discovered during testing
-- Execute in phases with thorough testing after each step.
--
-- =============================================================================

-- =============================================================================
-- PHASE 1A: REMOVE RLS POLICY DEPENDENCIES FIRST
-- =============================================================================

BEGIN;

-- Drop the RLS policy that depends on user_profiles.is_public
DROP POLICY IF EXISTS "Users can view public profiles" ON user_profiles;

-- Create a new policy without is_public dependency (if public profiles are needed)
-- Since is_public appears to be unused in the app, we can simplify this policy
CREATE POLICY "Users can view own profile and admins can view all"
    ON user_profiles FOR SELECT
    USING (id = auth.uid() OR is_admin(auth.uid()));

COMMIT;

-- =============================================================================
-- PHASE 1B: SAFE COLUMN REMOVALS (Updated)
-- =============================================================================
-- These columns now have no dependencies after policy removal

BEGIN;

-- -----------------------------------------------------------------------------
-- user_profiles table cleanup (8 columns including is_public)
-- -----------------------------------------------------------------------------
ALTER TABLE user_profiles 
    DROP COLUMN IF EXISTS avatar_url,
    DROP COLUMN IF EXISTS last_seen_at,
    DROP COLUMN IF EXISTS learn_ahead_time_minutes,
    DROP COLUMN IF EXISTS total_cards_studied,
    DROP COLUMN IF EXISTS total_reviews,
    DROP COLUMN IF EXISTS current_streak,
    DROP COLUMN IF EXISTS longest_streak,
    DROP COLUMN IF EXISTS is_public;  -- Now safe to remove

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

-- -----------------------------------------------------------------------------
-- user_card_progress table cleanup (3 columns)
-- -----------------------------------------------------------------------------
ALTER TABLE user_card_progress
    DROP COLUMN IF EXISTS learning_step,
    DROP COLUMN IF EXISTS current_step_interval,
    DROP COLUMN IF EXISTS streak;

-- -----------------------------------------------------------------------------
-- review_history table cleanup (2 columns)
-- -----------------------------------------------------------------------------
ALTER TABLE review_history
    DROP COLUMN IF EXISTS learning_step,
    DROP COLUMN IF EXISTS was_relearning;

COMMIT;

-- =============================================================================
-- PHASE 2: CHECK FOR OTHER RLS DEPENDENCIES
-- =============================================================================
-- Let's also check and handle other potential RLS dependencies

-- Check if cards.is_public has RLS dependencies
DO $$
BEGIN
    -- Drop cards.is_public related policies if they exist and aren't used
    -- Note: Keep this if the app actually uses public cards feature
    
    -- Example: If you want to remove is_public from cards table:
    -- DROP POLICY IF EXISTS "Users can view public cards" ON cards;
    -- ALTER TABLE cards DROP COLUMN IF EXISTS is_public;
    
    RAISE NOTICE 'Phase 2: Check cards.is_public policies manually';
END $$;

-- Check if subjects.is_public has RLS dependencies  
DO $$
BEGIN
    -- Example: If you want to remove is_public from subjects table:
    -- DROP POLICY IF EXISTS "Users can view public subjects" ON subjects;
    -- ALTER TABLE subjects DROP COLUMN IF EXISTS is_public;
    
    RAISE NOTICE 'Phase 2: Check subjects.is_public policies manually';
END $$;

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

-- Check remaining RLS policies
SELECT schemaname, tablename, policyname, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('user_profiles', 'cards', 'subjects')
ORDER BY tablename, policyname;

-- Check for any remaining dependencies
SELECT 
    t.table_name,
    t.column_name,
    tc.constraint_name,
    tc.constraint_type
FROM information_schema.columns t
LEFT JOIN information_schema.key_column_usage kcu ON t.table_name = kcu.table_name 
    AND t.column_name = kcu.column_name
LEFT JOIN information_schema.table_constraints tc ON kcu.constraint_name = tc.constraint_name
WHERE t.table_schema = 'public' 
    AND t.table_name IN ('user_profiles', 'cards', 'subjects', 'user_card_progress', 'review_history')
    AND tc.constraint_type IS NOT NULL
ORDER BY t.table_name, t.column_name;

-- =============================================================================
-- ALTERNATIVE: SAFER GRADUAL APPROACH
-- =============================================================================
-- If you prefer to be extra cautious, remove columns one by one:

/*
-- Remove user_profiles columns one by one
ALTER TABLE user_profiles DROP COLUMN IF EXISTS avatar_url;
-- Test application
ALTER TABLE user_profiles DROP COLUMN IF EXISTS last_seen_at;
-- Test application
-- ... continue for each column

-- This approach allows you to rollback individual columns if issues arise
*/

-- =============================================================================
-- ROLLBACK SCRIPT FOR is_public POLICY
-- =============================================================================
-- In case you need to restore the original policy:

/*
BEGIN;

-- Restore the original is_public column
ALTER TABLE user_profiles ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT false;

-- Remove our simplified policy
DROP POLICY IF EXISTS "Users can view own profile and admins can view all" ON user_profiles;

-- Restore original policy
CREATE POLICY "Users can view public profiles"
    ON user_profiles FOR SELECT
    USING ((is_public = true) OR (id = auth.uid()) OR is_admin(auth.uid()));

COMMIT;
*/

-- =============================================================================
-- NOTES
-- =============================================================================
-- 
-- 1. The error you encountered shows that RLS policies can have hidden 
--    dependencies on columns that appear unused in application code.
--
-- 2. Always check pg_policies table before removing columns that might
--    be used in security policies.
--
-- 3. Consider whether the public profiles feature might be needed in the
--    future. If so, keep the is_public column and update the analysis.
--
-- 4. This is a perfect example of why we test migrations in phases!
--
-- =============================================================================