-- =====================================================
-- Migration 07: FSRS Parameters
-- =====================================================
-- Modern JSONB FSRS parameter storage for flexible optimization
-- Requires: 01-extensions-and-enums.sql through 06-reviews.sql

-- =====================================================
-- FSRS PARAMETERS TABLE
-- =====================================================

CREATE TABLE fsrs_params (
    -- Core identity
    user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- FSRS Algorithm Weights (JSONB for flexibility)
    weights JSONB NOT NULL DEFAULT '{
        "w0": 0.4197,  "w1": 1.1829,  "w2": 3.1262,  "w3": 15.4722,
        "w4": 7.2102,  "w5": 0.5316,  "w6": 1.0651,  "w7": 0.0234,
        "w8": 1.616,   "w9": 0.0721,  "w10": 0.1284, "w11": 1.0824,
        "w12": 0.0,    "w13": 100.0,  "w14": 1.0,    "w15": 10.0,
        "w16": 2.9013, "w17": 0.0,    "w18": 0.0
    }'::jsonb,
    
    -- Learning Configuration
    learning_steps_minutes INTEGER[] NOT NULL DEFAULT ARRAY[1, 10],
    graduating_interval_days INTEGER NOT NULL DEFAULT 1,
    easy_interval_days INTEGER NOT NULL DEFAULT 4,
    
    -- Interval Limits
    maximum_interval_days INTEGER NOT NULL DEFAULT 36500, -- ~100 years
    minimum_interval_days INTEGER NOT NULL DEFAULT 1,
    
    -- Daily Limits (can override profile defaults)
    new_cards_per_day INTEGER DEFAULT NULL, -- NULL = use profile default
    reviews_per_day INTEGER DEFAULT NULL,   -- NULL = use profile default
    
    -- Relearning Configuration
    relearning_steps_minutes INTEGER[] NOT NULL DEFAULT ARRAY[10],
    minimum_relearning_interval_days INTEGER NOT NULL DEFAULT 1,
    
    -- Lapse Handling
    lapse_minimum_interval_days INTEGER NOT NULL DEFAULT 1,
    lapse_multiplier DECIMAL(4,3) NOT NULL DEFAULT 0.500,
    
    -- Algorithm Configuration
    desired_retention DECIMAL(4,3) NOT NULL DEFAULT 0.900, -- 90% retention
    
    -- Optimization Tracking
    optimization_count INTEGER NOT NULL DEFAULT 0,
    last_optimization_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT fsrs_params_graduating_interval_days_check CHECK (graduating_interval_days > 0),
    CONSTRAINT fsrs_params_easy_interval_days_check CHECK (easy_interval_days > 0),
    CONSTRAINT fsrs_params_maximum_interval_days_check CHECK (maximum_interval_days > 0),
    CONSTRAINT fsrs_params_minimum_interval_days_check CHECK (minimum_interval_days > 0),
    CONSTRAINT fsrs_params_new_cards_per_day_check CHECK (new_cards_per_day IS NULL OR new_cards_per_day >= 0),
    CONSTRAINT fsrs_params_reviews_per_day_check CHECK (reviews_per_day IS NULL OR reviews_per_day >= 0),
    CONSTRAINT fsrs_params_minimum_relearning_interval_days_check CHECK (minimum_relearning_interval_days > 0),
    CONSTRAINT fsrs_params_lapse_minimum_interval_days_check CHECK (lapse_minimum_interval_days > 0),
    CONSTRAINT fsrs_params_lapse_multiplier_check CHECK (lapse_multiplier > 0 AND lapse_multiplier <= 1),
    CONSTRAINT fsrs_params_desired_retention_check CHECK (desired_retention > 0 AND desired_retention <= 1),
    CONSTRAINT fsrs_params_optimization_count_check CHECK (optimization_count >= 0),
    CONSTRAINT fsrs_params_interval_consistency CHECK (minimum_interval_days <= maximum_interval_days)
);

-- Enable Row Level Security
ALTER TABLE fsrs_params ENABLE ROW LEVEL SECURITY;

-- RLS Policies for fsrs_params
CREATE POLICY "Users can view their own FSRS parameters" ON fsrs_params
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own FSRS parameters" ON fsrs_params
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own FSRS parameters" ON fsrs_params
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own FSRS parameters" ON fsrs_params
    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all FSRS parameters" ON fsrs_params
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND is_admin = TRUE
        )
    );

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Updated at trigger
CREATE TRIGGER fsrs_params_updated_at
    BEFORE UPDATE ON fsrs_params
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- INDEXES
-- =====================================================

-- JSONB index for weights queries
CREATE INDEX idx_fsrs_params_weights ON fsrs_params USING GIN(weights);

-- Optimization tracking indexes
CREATE INDEX idx_fsrs_params_optimization_count ON fsrs_params(optimization_count);
CREATE INDEX idx_fsrs_params_last_optimization_at ON fsrs_params(last_optimization_at);

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to create default FSRS parameters for new user
CREATE OR REPLACE FUNCTION create_default_fsrs_params(p_user_id UUID)
RETURNS UUID AS $$
BEGIN
    INSERT INTO fsrs_params (user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;
    
    RETURN p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get FSRS weight by name
CREATE OR REPLACE FUNCTION get_fsrs_weight(
    p_user_id UUID,
    p_weight_name TEXT
)
RETURNS DECIMAL AS $$
DECLARE
    weight_value DECIMAL;
BEGIN
    SELECT (weights->>p_weight_name)::DECIMAL
    INTO weight_value
    FROM fsrs_params
    WHERE user_id = p_user_id;
    
    RETURN COALESCE(weight_value, 0.0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update FSRS weight
CREATE OR REPLACE FUNCTION update_fsrs_weight(
    p_user_id UUID,
    p_weight_name TEXT,
    p_weight_value DECIMAL
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE fsrs_params
    SET 
        weights = jsonb_set(weights, ARRAY[p_weight_name], to_jsonb(p_weight_value)),
        updated_at = NOW()
    WHERE user_id = p_user_id;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update multiple FSRS weights at once
CREATE OR REPLACE FUNCTION update_fsrs_weights(
    p_user_id UUID,
    p_weights JSONB
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE fsrs_params
    SET 
        weights = weights || p_weights, -- Merge with existing weights
        optimization_count = optimization_count + 1,
        last_optimization_at = NOW(),
        updated_at = NOW()
    WHERE user_id = p_user_id;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get effective daily limits (deck -> FSRS -> profile)
CREATE OR REPLACE FUNCTION get_effective_daily_limits(
    p_user_id UUID,
    p_deck_id UUID DEFAULT NULL
)
RETURNS TABLE(
    new_cards_limit INTEGER,
    review_limit INTEGER
) AS $$
DECLARE
    deck_new_limit INTEGER;
    deck_review_limit INTEGER;
    fsrs_new_limit INTEGER;
    fsrs_review_limit INTEGER;
    profile_new_limit INTEGER;
    profile_review_limit INTEGER;
BEGIN
    -- Get deck overrides if deck specified
    IF p_deck_id IS NOT NULL THEN
        SELECT daily_new_cards_limit, daily_review_limit
        INTO deck_new_limit, deck_review_limit
        FROM decks
        WHERE id = p_deck_id AND user_id = p_user_id;
    END IF;
    
    -- Get FSRS overrides
    SELECT new_cards_per_day, reviews_per_day
    INTO fsrs_new_limit, fsrs_review_limit
    FROM fsrs_params
    WHERE user_id = p_user_id;
    
    -- Get profile defaults
    SELECT daily_new_cards_limit, daily_review_limit
    INTO profile_new_limit, profile_review_limit
    FROM profiles
    WHERE id = p_user_id;
    
    -- Return effective limits (deck -> FSRS -> profile precedence)
    new_cards_limit := COALESCE(deck_new_limit, fsrs_new_limit, profile_new_limit, 20);
    review_limit := COALESCE(deck_review_limit, fsrs_review_limit, profile_review_limit, 100);
    
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get complete FSRS configuration for user
CREATE OR REPLACE FUNCTION get_fsrs_config(p_user_id UUID)
RETURNS TABLE(
    weights JSONB,
    learning_steps_minutes INTEGER[],
    graduating_interval_days INTEGER,
    easy_interval_days INTEGER,
    maximum_interval_days INTEGER,
    minimum_interval_days INTEGER,
    desired_retention DECIMAL,
    lapse_multiplier DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        fp.weights,
        fp.learning_steps_minutes,
        fp.graduating_interval_days,
        fp.easy_interval_days,
        fp.maximum_interval_days,
        fp.minimum_interval_days,
        fp.desired_retention,
        fp.lapse_multiplier
    FROM fsrs_params fp
    WHERE fp.user_id = p_user_id;
    
    -- If no parameters exist, create default ones
    IF NOT FOUND THEN
        PERFORM create_default_fsrs_params(p_user_id);
        
        RETURN QUERY
        SELECT 
            fp.weights,
            fp.learning_steps_minutes,
            fp.graduating_interval_days,
            fp.easy_interval_days,
            fp.maximum_interval_days,
            fp.minimum_interval_days,
            fp.desired_retention,
            fp.lapse_multiplier
        FROM fsrs_params fp
        WHERE fp.user_id = p_user_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to validate FSRS weights JSONB structure
CREATE OR REPLACE FUNCTION validate_fsrs_weights(p_weights JSONB)
RETURNS BOOLEAN AS $$
DECLARE
    required_keys TEXT[] := ARRAY['w0','w1','w2','w3','w4','w5','w6','w7','w8','w9','w10','w11','w12','w13','w14','w15','w16','w17','w18'];
    key TEXT;
    weight_value NUMERIC;
BEGIN
    -- Check if all required keys exist
    FOREACH key IN ARRAY required_keys LOOP
        IF NOT p_weights ? key THEN
            RETURN FALSE;
        END IF;
        
        -- Check if value is numeric
        BEGIN
            weight_value := (p_weights->>key)::NUMERIC;
        EXCEPTION WHEN OTHERS THEN
            RETURN FALSE;
        END;
        
        -- Basic range validation for weights
        IF weight_value < -100 OR weight_value > 100 THEN
            RETURN FALSE;
        END IF;
    END LOOP;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- TRIGGER TO CREATE DEFAULT PARAMS
-- =====================================================

-- Function to auto-create FSRS params when profile is created
CREATE OR REPLACE FUNCTION create_fsrs_params_for_new_user()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM create_default_fsrs_params(NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create FSRS params for new profiles
CREATE TRIGGER create_fsrs_params_on_profile_insert
    AFTER INSERT ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION create_fsrs_params_for_new_user();

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- FSRS parameters with modern JSONB storage are ready
-- Next: Run 08-user-flags-and-streaks.sql