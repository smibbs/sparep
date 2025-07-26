-- Migration 27: Remove unused database functions
-- These functions are not called from JavaScript code and are not used in RLS policies

-- Remove calculate_next_review function (not used anywhere, was marked for replacement)
DROP FUNCTION IF EXISTS public.calculate_next_review(p_stability double precision, p_difficulty double precision, p_rating integer);

-- Remove daily review limit functions (not used in current JavaScript implementation)
-- The application uses session-based limiting instead of database-enforced daily limits
DROP FUNCTION IF EXISTS public.has_daily_reviews_remaining(user_id uuid);
DROP FUNCTION IF EXISTS public.get_daily_review_limit(user_id uuid);

-- Remove any remaining analytics functions that should have been dropped in migration 19
-- These were part of the hesitation analytics that were removed
DROP FUNCTION IF EXISTS public.get_error_pattern_analytics(p_subject_id uuid, p_min_reviews integer, p_limit integer);
DROP FUNCTION IF EXISTS public.get_hesitation_analytics(p_subject_id uuid, p_min_reviews integer, p_limit integer);

-- Note: Keeping these functions as they are used in RLS policies and database security:
--   - is_admin() - Used in RLS policies
--   - get_user_tier() - Used in RLS policies and other functions
--   - has_card_access() - Used in RLS policies
--   - has_subject_access() - Used in RLS policies
--   - can_access_flagged_cards() - Used in RLS policies

-- Note: Keeping these functions as they are actively called from JavaScript:
--   - admin_toggle_subject_status()
--   - admin_bulk_toggle_subjects()
--   - get_flagged_cards_for_admin()
--   - resolve_card_flag()
--   - get_difficulty_consistency_analytics()
--   - get_failed_attempts_before_good_rating()
--   - increment_daily_reviews()
--   - flag_card_for_review()
--   - update_user_streak()
--   - get_unclaimed_streak_rewards()
--   - claim_streak_reward()

-- Log the changes
INSERT INTO public.migration_log (migration_name, description, applied_at) 
VALUES (
    '27-remove-unused-functions',
    'Removed unused functions: calculate_next_review, has_daily_reviews_remaining, get_daily_review_limit, get_error_pattern_analytics, get_hesitation_analytics',
    NOW()
) ON CONFLICT (migration_name) DO NOTHING;