-- Migration 26: Remove unused columns from review_history table
-- Removes columns that were part of abandoned analytics features

-- Remove hesitation_time_ms column (analytics feature removed in migration 19)
-- This was part of hesitation analytics that was completely removed
ALTER TABLE public.review_history DROP COLUMN IF EXISTS hesitation_time_ms;

-- Remove card_flip_time_ms column (analytics feature removed in migration 19)
-- This was part of the same hesitation analytics system that was removed
ALTER TABLE public.review_history DROP COLUMN IF EXISTS card_flip_time_ms;

-- Remove learning_step column (not referenced in current codebase)
-- This was likely part of an unimplemented complex learning step system
ALTER TABLE public.review_history DROP COLUMN IF EXISTS learning_step;

-- Remove was_relearning column (not referenced in current codebase)
-- This appears to be unused in the current FSRS implementation
ALTER TABLE public.review_history DROP COLUMN IF EXISTS was_relearning;

-- Note: All core review tracking columns are kept as they are actively used:
--   - user_id, card_id (review identification)
--   - review_date, rating, response_time_ms (core review data)
--   - stability_before, difficulty_before (FSRS state before)
--   - elapsed_days, scheduled_days (FSRS timing data)
--   - stability_after, difficulty_after (FSRS state after)
--   - state_before, state_after (card state transitions)
--   - created_at (audit trail)

-- Log the changes
INSERT INTO public.migration_log (migration_name, description, applied_at) 
VALUES (
    '26-remove-unused-review-history-columns',
    'Removed unused columns: hesitation_time_ms, card_flip_time_ms, learning_step, was_relearning from review_history table',
    NOW()
) ON CONFLICT (migration_name) DO NOTHING;