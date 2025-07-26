-- Migration: 23-reset-cards-to-new.sql
-- Description: Reset all cards to 'new' status for testing purposes
-- WARNING: This will reset all user progress! Only use for testing/development

-- Reset all user card progress to 'new' state
UPDATE public.user_card_progress 
SET 
    state = 'new',
    stability = 1.0,
    difficulty = 5.0,
    next_review_date = NOW(),
    due_date = NOW(),
    last_review_date = NULL,
    reps = 0,
    total_reviews = 0,
    correct_reviews = 0,
    incorrect_reviews = 0,
    lapses = 0,
    average_time_ms = 0,
    elapsed_days = 0,
    scheduled_days = 0,
    updated_at = NOW()
WHERE TRUE;

-- Clear all review history (optional - uncomment if you want to completely reset)
-- WARNING: This will delete all review history data!
-- DELETE FROM public.review_history WHERE TRUE;

-- Reset user profiles review counts
UPDATE public.user_profiles 
SET 
    reviews_today = 0,
    last_review_date = NULL,
    updated_at = NOW()
WHERE TRUE;

-- Reset FSRS parameters to defaults (optional - uncomment if needed)
-- WARNING: This will reset all personalized FSRS parameters!
-- UPDATE public.fsrs_parameters 
-- SET 
--     w0 = 0.4197,
--     w1 = 1.1829,
--     w2 = 3.1262,
--     w3 = 15.4722,
--     w4 = 7.2102,
--     w5 = 0.5316,
--     w6 = 1.0651,
--     w7 = 0.0234,
--     w8 = 1.616,
--     w9 = 0.0721,
--     w10 = 0.1284,
--     w11 = 1.0824,
--     w12 = 0.0,
--     w13 = 100.0,
--     w14 = 1.0,
--     w15 = 10.0,
--     w16 = 2.9013,
--     learning_steps_minutes = ARRAY[1, 10],
--     graduating_interval_days = 1,
--     easy_interval_days = 4,
--     maximum_interval_days = 36500,
--     minimum_interval_days = 1,
--     new_cards_per_day = 20,
--     reviews_per_day = 200,
--     relearning_steps_minutes = ARRAY[10],
--     minimum_relearning_interval_days = 1,
--     lapse_minimum_interval_days = 1,
--     lapse_multiplier = 0.5,
--     updated_at = NOW()
-- WHERE TRUE;

-- Show summary of reset
SELECT 
    'Card Progress Reset' as operation,
    COUNT(*) as affected_rows,
    COUNT(DISTINCT user_id) as affected_users
FROM public.user_card_progress 
WHERE state = 'new';

SELECT 
    'User Profiles Reset' as operation,
    COUNT(*) as affected_rows
FROM public.user_profiles 
WHERE reviews_today = 0;

-- Log the reset operation (commented out to avoid enum issues)
-- INSERT INTO public.review_history (
--     user_id,
--     card_id,
--     rating,
--     response_time_ms,
--     stability_before,
--     stability_after,
--     difficulty_before,
--     difficulty_after,
--     state_before,
--     state_after,
--     scheduled_days,
--     elapsed_days,
--     review_date,
--     created_at
-- ) 
-- SELECT 
--     '00000000-0000-0000-0000-000000000000'::uuid as user_id,
--     '00000000-0000-0000-0000-000000000000'::uuid as card_id,
--     0 as rating,
--     0 as response_time_ms,
--     0 as stability_before,
--     1.0 as stability_after,
--     5.0 as difficulty_before,
--     5.0 as difficulty_after,
--     'new' as state_before,
--     'new' as state_after,
--     0 as scheduled_days,
--     0 as elapsed_days,
--     NOW() as review_date,
--     NOW() as created_at
-- WHERE FALSE; -- This creates the structure but inserts no rows

-- Alternative: Simple log message instead of inserting into review_history
DO $$
BEGIN
    RAISE NOTICE 'Migration 23: All cards reset to NEW status at %', NOW();
END $$;

-- Add a comment to indicate when reset was performed
COMMENT ON TABLE public.user_card_progress IS 
    'Cards reset to new status - check migration logs for timestamp';

-- Success message
SELECT 'All cards have been reset to NEW status for testing!' as message;