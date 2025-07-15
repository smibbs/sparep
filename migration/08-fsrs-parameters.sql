-- Migration: 08-fsrs-parameters.sql
-- Description: Creates the table for storing personalized FSRS algorithm parameters
-- Dependencies: 01-initial-setup.sql, 02-enums.sql, 03-user-profiles.sql

-- Create fsrs_parameters table
CREATE TABLE public.fsrs_parameters (
    -- Primary key (one row per user)
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- FSRS algorithm weights (research-based optimal defaults)
    w0 DOUBLE PRECISION NOT NULL DEFAULT 0.4197,  -- Initial stability for new cards
    w1 DOUBLE PRECISION NOT NULL DEFAULT 1.1829,  -- Stability increase factor for Good rating
    w2 DOUBLE PRECISION NOT NULL DEFAULT 3.1262,  -- Stability increase factor for Easy rating
    w3 DOUBLE PRECISION NOT NULL DEFAULT 15.4722, -- Stability decrease factor for Hard rating
    w4 DOUBLE PRECISION NOT NULL DEFAULT 7.2102,  -- Stability decrease factor for Again rating
    w5 DOUBLE PRECISION NOT NULL DEFAULT 0.5316,  -- Impact of card difficulty on stability
    w6 DOUBLE PRECISION NOT NULL DEFAULT 1.0651,  -- Impact of previous stability
    w7 DOUBLE PRECISION NOT NULL DEFAULT 0.0234,  -- Impact of elapsed time since last review
    w8 DOUBLE PRECISION NOT NULL DEFAULT 1.616,   -- Bonus factor for Easy ratings
    w9 DOUBLE PRECISION NOT NULL DEFAULT 0.0721,  -- Penalty factor for Hard ratings
    w10 DOUBLE PRECISION NOT NULL DEFAULT 0.1284, -- Penalty factor for Again ratings
    w11 DOUBLE PRECISION NOT NULL DEFAULT 1.0824, -- Rate at which difficulty decays
    w12 DOUBLE PRECISION NOT NULL DEFAULT 0.0,    -- Minimum allowed stability value
    w13 DOUBLE PRECISION NOT NULL DEFAULT 100.0,  -- Maximum allowed stability value
    w14 DOUBLE PRECISION NOT NULL DEFAULT 1.0,    -- Minimum allowed difficulty value
    w15 DOUBLE PRECISION NOT NULL DEFAULT 10.0,   -- Maximum allowed difficulty value
    w16 DOUBLE PRECISION NOT NULL DEFAULT 2.9013, -- Factor for speed-focused learning
    
    -- Learning phase settings
    learning_steps_minutes INT[] NOT NULL DEFAULT ARRAY[1, 10],
    graduating_interval_days INT NOT NULL DEFAULT 1,
    easy_interval_days INT NOT NULL DEFAULT 4,
    
    -- Review settings
    maximum_interval_days INT NOT NULL DEFAULT 36500,
    minimum_interval_days INT NOT NULL DEFAULT 1,
    new_cards_per_day INT NOT NULL DEFAULT 20,
    reviews_per_day INT NOT NULL DEFAULT 200,
    
    -- Relearning settings
    relearning_steps_minutes INT[] NOT NULL DEFAULT ARRAY[10],
    minimum_relearning_interval_days INT NOT NULL DEFAULT 1,
    
    -- Lapses settings
    lapse_minimum_interval_days INT NOT NULL DEFAULT 1,
    lapse_multiplier DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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