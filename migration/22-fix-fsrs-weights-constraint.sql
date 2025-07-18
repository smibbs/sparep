-- Migration: 22-fix-fsrs-weights-constraint.sql
-- Description: Fixes the overly restrictive valid_weights constraint that prevents FSRS parameter optimization
-- Issue: The constraint requires all w0-w16 weights to be >= 0, but FSRS algorithm can legitimately use negative values

-- Drop the restrictive valid_weights constraint
ALTER TABLE public.fsrs_parameters DROP CONSTRAINT IF EXISTS valid_weights;

-- Add more reasonable bounds that allow negative values but prevent extreme outliers
-- These bounds are based on FSRS research and typical parameter ranges
ALTER TABLE public.fsrs_parameters ADD CONSTRAINT reasonable_fsrs_bounds CHECK (
    -- Stability weights can be negative but shouldn't be extreme
    w0 >= -10.0 AND w0 <= 10.0 AND
    w1 >= -10.0 AND w1 <= 10.0 AND
    w2 >= -10.0 AND w2 <= 10.0 AND
    w3 >= -50.0 AND w3 <= 50.0 AND
    w4 >= -50.0 AND w4 <= 50.0 AND
    w5 >= -5.0 AND w5 <= 5.0 AND
    w6 >= -5.0 AND w6 <= 5.0 AND
    w7 >= -1.0 AND w7 <= 1.0 AND
    w8 >= -10.0 AND w8 <= 10.0 AND
    w9 >= -1.0 AND w9 <= 1.0 AND
    w10 >= -1.0 AND w10 <= 1.0 AND
    w11 >= -5.0 AND w11 <= 5.0 AND
    
    -- Boundary constraints for min/max values
    w12 >= 0.0 AND w12 <= 1.0 AND          -- Minimum stability should be non-negative
    w13 >= 1.0 AND w13 <= 1000.0 AND       -- Maximum stability should be reasonable
    w14 >= 0.1 AND w14 <= 20.0 AND         -- Minimum difficulty should be positive
    w15 >= 1.0 AND w15 <= 100.0 AND        -- Maximum difficulty should be reasonable
    w16 >= -10.0 AND w16 <= 10.0 AND       -- Easy multiplier can be negative
    
    -- Logical constraints
    w12 < w13 AND                           -- Min stability < Max stability  
    w14 < w15 AND                           -- Min difficulty < Max difficulty
    
    -- Interval constraints
    minimum_interval_days >= 1 AND
    maximum_interval_days >= minimum_interval_days AND
    maximum_interval_days <= 36500 AND
    
    -- Daily limit constraints
    new_cards_per_day >= 0 AND
    reviews_per_day >= 0 AND
    
    -- Other reasonable bounds
    graduating_interval_days >= 1 AND
    easy_interval_days >= 1 AND
    minimum_relearning_interval_days >= 1 AND
    lapse_minimum_interval_days >= 1 AND
    lapse_multiplier >= 0.1 AND lapse_multiplier <= 2.0
);

-- Add comment explaining the constraint
COMMENT ON CONSTRAINT reasonable_fsrs_bounds ON public.fsrs_parameters IS 
    'Allows negative FSRS weights as mathematically valid while preventing extreme outliers that could break the algorithm';