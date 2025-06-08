-- Migration: 04-user-card-progress-table.sql
-- Description: Creates the table for tracking user progress on individual cards using FSRS algorithm
-- Dependencies: 01-users-table.sql (for user_id), 02-cards-table.sql (for card_id)

-- Create enum for card states
CREATE TYPE card_state AS ENUM ('new', 'learning', 'review', 'relearning', 'buried', 'suspended');

-- Create user_card_progress table
CREATE TABLE public.user_card_progress (
    -- Composite primary key
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    card_id UUID REFERENCES public.cards(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, card_id),
    
    -- FSRS algorithm parameters
    stability FLOAT NOT NULL DEFAULT 0.0,
    difficulty FLOAT NOT NULL DEFAULT 5.0,
    elapsed_days FLOAT NOT NULL DEFAULT 0.0,
    scheduled_days FLOAT NOT NULL DEFAULT 0.0,
    reps INT NOT NULL DEFAULT 0,
    lapses INT NOT NULL DEFAULT 0,
    state card_state NOT NULL DEFAULT 'new',
    last_rating INT CHECK (last_rating BETWEEN 1 AND 4),
    
    -- Scheduling
    due_date TIMESTAMPTZ,
    last_review_date TIMESTAMPTZ,
    next_review_date TIMESTAMPTZ,
    
    -- Learning phase settings
    learning_step INT NOT NULL DEFAULT 0,
    current_step_interval INT NOT NULL DEFAULT 0,
    
    -- Statistics
    total_reviews INT NOT NULL DEFAULT 0,
    correct_reviews INT NOT NULL DEFAULT 0,
    incorrect_reviews INT NOT NULL DEFAULT 0,
    streak INT NOT NULL DEFAULT 0,
    average_time_ms INT NOT NULL DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_stability CHECK (stability >= 0.0),
    CONSTRAINT valid_difficulty CHECK (difficulty BETWEEN 1.0 AND 10.0),
    CONSTRAINT valid_elapsed_days CHECK (elapsed_days >= 0.0),
    CONSTRAINT valid_scheduled_days CHECK (scheduled_days >= 0.0)
);

-- Create updated_at trigger
CREATE TRIGGER update_user_card_progress_updated_at
    BEFORE UPDATE ON public.user_card_progress
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Set up Row Level Security (RLS)
ALTER TABLE public.user_card_progress ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own progress"
    ON public.user_card_progress
    FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can update their own progress"
    ON public.user_card_progress
    FOR UPDATE
    USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own progress"
    ON public.user_card_progress
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own progress"
    ON public.user_card_progress
    FOR DELETE
    USING (user_id = auth.uid());

-- Create indexes
CREATE INDEX user_card_progress_user_id_idx ON public.user_card_progress(user_id);
CREATE INDEX user_card_progress_card_id_idx ON public.user_card_progress(card_id);
CREATE INDEX user_card_progress_due_date_idx ON public.user_card_progress(due_date);
CREATE INDEX user_card_progress_state_idx ON public.user_card_progress(state);
CREATE INDEX user_card_progress_next_review_idx ON public.user_card_progress(next_review_date);

-- Comments
COMMENT ON TABLE public.user_card_progress IS 'Tracks user progress and FSRS parameters for each card';
COMMENT ON COLUMN public.user_card_progress.stability IS 'FSRS: Memory stability (higher = more stable)';
COMMENT ON COLUMN public.user_card_progress.difficulty IS 'FSRS: Card difficulty (1-10)';
COMMENT ON COLUMN public.user_card_progress.elapsed_days IS 'FSRS: Days since last review';
COMMENT ON COLUMN public.user_card_progress.scheduled_days IS 'FSRS: Days until next review';
COMMENT ON COLUMN public.user_card_progress.state IS 'Current learning state of the card';
COMMENT ON COLUMN public.user_card_progress.last_rating IS 'Last review rating (1=Again, 2=Hard, 3=Good, 4=Easy)';

-- Create function to initialize user progress for a card
CREATE OR REPLACE FUNCTION initialize_card_progress()
RETURNS TRIGGER AS $$
BEGIN
    -- When a new card is created, create progress entries for users who have access
    INSERT INTO public.user_card_progress (user_id, card_id)
    SELECT 
        up.id as user_id,
        NEW.id as card_id
    FROM public.user_profiles up
    WHERE 
        -- For public cards, create for all users
        (NEW.is_public = true)
        OR
        -- For private cards, only create for the card creator
        (NEW.creator_id = up.id);
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to initialize progress when new cards are created
CREATE TRIGGER on_card_created
    AFTER INSERT ON public.cards
    FOR EACH ROW
    EXECUTE FUNCTION initialize_card_progress();

-- Create function to calculate next review date
CREATE OR REPLACE FUNCTION calculate_next_review(
    p_stability FLOAT,
    p_difficulty FLOAT,
    p_rating INT
) RETURNS FLOAT AS $$
DECLARE
    interval_multiplier FLOAT;
BEGIN
    -- Simple FSRS implementation for MVP
    -- This will be replaced with full FSRS algorithm later
    CASE p_rating
        WHEN 1 THEN interval_multiplier := 0.2; -- Again
        WHEN 2 THEN interval_multiplier := 0.5; -- Hard
        WHEN 3 THEN interval_multiplier := 1.0; -- Good
        WHEN 4 THEN interval_multiplier := 1.5; -- Easy
        ELSE interval_multiplier := 1.0;
    END CASE;
    
    RETURN p_stability * interval_multiplier;
END;
$$ language 'plpgsql'; 