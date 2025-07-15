-- Migration: 13-update-fsrs-defaults.sql
-- Description: Update existing users from basic defaults (1.0) to research-based optimal FSRS parameters
-- Dependencies: 08-fsrs-parameters.sql

-- Update existing users with default 1.0 values to research-based optimal parameters
UPDATE public.fsrs_parameters 
SET 
    -- Research-based optimal FSRS weights
    w0 = 0.4197,  -- Initial stability for new cards
    w1 = 1.1829,  -- Stability increase factor for Good rating  
    w2 = 3.1262,  -- Stability increase factor for Easy rating
    w3 = 15.4722, -- Stability decrease factor for Hard rating
    w4 = 7.2102,  -- Stability decrease factor for Again rating
    w5 = 0.5316,  -- Impact of card difficulty on stability
    w6 = 1.0651,  -- Impact of previous stability
    w7 = 0.0234,  -- Impact of elapsed time since last review
    w8 = 1.616,   -- Bonus factor for Easy ratings
    w9 = 0.0721,  -- Penalty factor for Hard ratings
    w10 = 0.1284, -- Penalty factor for Again ratings
    w11 = 1.0824, -- Rate at which difficulty decays
    w12 = 0.0,    -- Minimum allowed stability value
    w13 = 100.0,  -- Maximum allowed stability value
    w14 = 1.0,    -- Minimum allowed difficulty value
    w15 = 10.0,   -- Maximum allowed difficulty value
    w16 = 2.9013, -- Factor for speed-focused learning
    updated_at = NOW()
WHERE 
    -- Only update records that have the old default values
    -- Check multiple weights to ensure we're updating the right records
    w0 = 1.0 AND w1 = 1.0 AND w2 = 1.0 AND w3 = 1.0 AND w4 = 1.0
    AND w5 = 1.0 AND w6 = 1.0 AND w7 = 1.0 AND w8 = 1.0 AND w9 = 1.0;

-- Output the number of users updated
DO $$
DECLARE
    updated_count INTEGER;
BEGIN
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE 'Updated % users to optimal FSRS parameters', updated_count;
END $$;

-- Verify the update by showing sample updated records
SELECT 
    user_id,
    w0, w1, w2, w3, w4,
    updated_at,
    'Updated to optimal parameters' as status
FROM public.fsrs_parameters 
WHERE w0 = 0.4197 AND w1 = 1.1829
ORDER BY updated_at DESC
LIMIT 5;

-- Show summary statistics
SELECT 
    COUNT(*) as total_users,
    COUNT(CASE WHEN w0 = 0.4197 THEN 1 END) as users_with_optimal_params,
    COUNT(CASE WHEN w0 = 1.0 THEN 1 END) as users_with_old_defaults
FROM public.fsrs_parameters;