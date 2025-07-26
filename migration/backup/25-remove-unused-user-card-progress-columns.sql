-- Migration 25: Remove unused columns from user_card_progress table
-- Removes columns that exist in schema but are not referenced in current JavaScript codebase

-- Remove learning_step column (not referenced in any JavaScript files)
-- This was likely part of a more complex learning step system that wasn't implemented
ALTER TABLE public.user_card_progress DROP COLUMN IF EXISTS learning_step;

-- Remove current_step_interval column (not referenced in any JavaScript files)
-- This was likely part of the same unimplemented learning step system
ALTER TABLE public.user_card_progress DROP COLUMN IF EXISTS current_step_interval;

-- Remove streak column (superseded by user_profiles streak fields)
-- The streak tracking was moved to user_profiles table with more detailed fields:
-- - current_daily_streak, longest_daily_streak, last_streak_date, streak_freeze_count
ALTER TABLE public.user_card_progress DROP COLUMN IF EXISTS streak;

-- Note: All core FSRS columns are kept as they are actively used:
--   - stability, difficulty, elapsed_days, scheduled_days (core FSRS algorithm)
--   - reps, lapses (review counting)
--   - state, last_rating (current status)
--   - due_date, last_review_date, next_review_date (scheduling)
--   - total_reviews, correct_reviews, incorrect_reviews (statistics)
--   - average_time_ms (performance tracking)
--   - created_at, updated_at (audit trail)

-- Log the changes
INSERT INTO public.migration_log (migration_name, description, applied_at) 
VALUES (
    '25-remove-unused-user-card-progress-columns',
    'Removed unused columns: learning_step, current_step_interval, streak from user_card_progress table',
    NOW()
) ON CONFLICT (migration_name) DO NOTHING;