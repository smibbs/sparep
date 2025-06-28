-- Migration: 07-fsrs-parameters.sql
-- Description: Creates the table for storing FSRS algorithm parameters
-- Dependencies: 01-initial-setup.sql, 02-user-profiles.sql

-- Create fsrs_parameters table
CREATE TABLE public.fsrs_parameters (
    -- Primary key (one row per user)
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- FSRS algorithm weights
    w0 FLOAT NOT NULL DEFAULT 1.0, -- Initial stability
    w1 FLOAT NOT NULL DEFAULT 1.0, -- Stability increase for "Good" rating
    w2 FLOAT NOT NULL DEFAULT 1.0, -- Stability increase for "Easy" rating
    w3 FLOAT NOT NULL DEFAULT 1.0, -- Stability decrease for "Hard" rating
    w4 FLOAT NOT NULL DEFAULT 1.0, -- Stability decrease for "Again" rating
    w5 FLOAT NOT NULL DEFAULT 1.0, -- Difficulty impact on stability
    w6 FLOAT NOT NULL DEFAULT 1.0, -- Previous stability impact
    w7 FLOAT NOT NULL DEFAULT 1.0, -- Elapsed time impact
    w8 FLOAT NOT NULL DEFAULT 1.0, -- Easy bonus factor
    w9 FLOAT NOT NULL DEFAULT 1.0, -- Hard penalty factor
    w10 FLOAT NOT NULL DEFAULT 1.0, -- Again penalty factor
    w11 FLOAT NOT NULL DEFAULT 1.0, -- Difficulty decay rate
    w12 FLOAT NOT NULL DEFAULT 1.0, -- Minimum stability
    w13 FLOAT NOT NULL DEFAULT 1.0, -- Maximum stability
    w14 FLOAT NOT NULL DEFAULT 1.0, -- Minimum difficulty
    w15 FLOAT NOT NULL DEFAULT 1.0, -- Maximum difficulty
    w16 FLOAT NOT NULL DEFAULT 1.0, -- Speed focus factor
    
    -- Learning phase settings
    learning_steps_minutes INTEGER[] NOT NULL DEFAULT ARRAY[1, 10], -- Default: 1min, 10min
    graduating_interval_days INT NOT NULL DEFAULT 1,
    easy_interval_days INT NOT NULL DEFAULT 4,
    
    -- Review settings
    maximum_interval_days INT NOT NULL DEFAULT 36500, -- Default: 100 years
    minimum_interval_days INT NOT NULL DEFAULT 1,
    new_cards_per_day INT NOT NULL DEFAULT 20,
    reviews_per_day INT NOT NULL DEFAULT 200,
    
    -- Relearning settings
    relearning_steps_minutes INTEGER[] NOT NULL DEFAULT ARRAY[10], -- Default: 10min
    minimum_relearning_interval_days INT NOT NULL DEFAULT 1,
    
    -- Lapses settings
    lapse_minimum_interval_days INT NOT NULL DEFAULT 1,
    lapse_multiplier FLOAT NOT NULL DEFAULT 0.5,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_weights CHECK (
        w0 >= 0 AND w1 >= 0 AND w2 >= 0 AND w3 >= 0 AND w4 >= 0 AND
        w5 >= 0 AND w6 >= 0 AND w7 >= 0 AND w8 >= 0 AND w9 >= 0 AND
        w10 >= 0 AND w11 >= 0 AND w12 >= 0 AND w13 >= 0 AND w14 >= 0 AND
        w15 >= 0 AND w16 >= 0
    ),
    CONSTRAINT valid_intervals CHECK (
        maximum_interval_days > minimum_interval_days AND
        minimum_interval_days > 0 AND
        graduating_interval_days >= minimum_interval_days AND
        easy_interval_days >= graduating_interval_days
    ),
    CONSTRAINT valid_limits CHECK (
        new_cards_per_day >= 0 AND
        reviews_per_day >= 0
    )
);

-- Create updated_at trigger
CREATE TRIGGER update_fsrs_parameters_updated_at
    BEFORE UPDATE ON public.fsrs_parameters
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Set up Row Level Security (RLS)
ALTER TABLE public.fsrs_parameters ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view own FSRS parameters"
    ON public.fsrs_parameters
    FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can update own FSRS parameters"
    ON public.fsrs_parameters
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all FSRS parameters"
    ON public.fsrs_parameters
    FOR SELECT
    USING (is_admin(auth.uid()));

CREATE POLICY "Admins can update all FSRS parameters"
    ON public.fsrs_parameters
    FOR UPDATE
    USING (is_admin(auth.uid()))
    WITH CHECK (is_admin(auth.uid()));

-- Create policy for trigger-based creation
CREATE POLICY "System can create FSRS parameters"
    ON public.fsrs_parameters
    FOR INSERT
    WITH CHECK (true);

-- Grant necessary permissions
GRANT ALL ON public.fsrs_parameters TO postgres;
GRANT SELECT, UPDATE ON public.fsrs_parameters TO authenticated;

-- Comments
COMMENT ON TABLE public.fsrs_parameters IS 'Stores personalized FSRS algorithm parameters for each user';
COMMENT ON COLUMN public.fsrs_parameters.w0 IS 'Initial stability for new cards';
COMMENT ON COLUMN public.fsrs_parameters.w1 IS 'Stability increase factor for Good rating';
COMMENT ON COLUMN public.fsrs_parameters.w2 IS 'Stability increase factor for Easy rating';
COMMENT ON COLUMN public.fsrs_parameters.w3 IS 'Stability decrease factor for Hard rating';
COMMENT ON COLUMN public.fsrs_parameters.w4 IS 'Stability decrease factor for Again rating';
COMMENT ON COLUMN public.fsrs_parameters.w5 IS 'Impact of card difficulty on stability';
COMMENT ON COLUMN public.fsrs_parameters.w6 IS 'Impact of previous stability';
COMMENT ON COLUMN public.fsrs_parameters.w7 IS 'Impact of elapsed time since last review';
COMMENT ON COLUMN public.fsrs_parameters.w8 IS 'Bonus factor for Easy ratings';
COMMENT ON COLUMN public.fsrs_parameters.w9 IS 'Penalty factor for Hard ratings';
COMMENT ON COLUMN public.fsrs_parameters.w10 IS 'Penalty factor for Again ratings';
COMMENT ON COLUMN public.fsrs_parameters.w11 IS 'Rate at which difficulty decays';
COMMENT ON COLUMN public.fsrs_parameters.w12 IS 'Minimum allowed stability value';
COMMENT ON COLUMN public.fsrs_parameters.w13 IS 'Maximum allowed stability value';
COMMENT ON COLUMN public.fsrs_parameters.w14 IS 'Minimum allowed difficulty value';
COMMENT ON COLUMN public.fsrs_parameters.w15 IS 'Maximum allowed difficulty value';
COMMENT ON COLUMN public.fsrs_parameters.w16 IS 'Factor for speed-focused learning'; 