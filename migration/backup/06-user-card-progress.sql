-- Migration: 06-user-card-progress.sql
-- Description: Creates the table for tracking user progress on cards with FSRS
-- Dependencies: 01-initial-setup.sql, 02-enums.sql, 03-user-profiles.sql, 05-cards.sql

-- Create user_card_progress table
CREATE TABLE public.user_card_progress (
    -- Composite primary key
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, card_id),
    
    -- FSRS algorithm parameters
    stability DOUBLE PRECISION NOT NULL DEFAULT 0.0 CHECK (stability >= 0.0),
    difficulty DOUBLE PRECISION NOT NULL DEFAULT 5.0 CHECK (difficulty >= 1.0 AND difficulty <= 10.0),
    elapsed_days DOUBLE PRECISION NOT NULL DEFAULT 0.0 CHECK (elapsed_days >= 0.0),
    scheduled_days DOUBLE PRECISION NOT NULL DEFAULT 0.0 CHECK (scheduled_days >= 0.0),
    reps INT NOT NULL DEFAULT 0,
    lapses INT NOT NULL DEFAULT 0,
    
    -- Learning state using enum
    state card_state NOT NULL DEFAULT 'new',
    last_rating INT CHECK (last_rating >= 1 AND last_rating <= 4),
    
    -- Scheduling dates
    due_date TIMESTAMPTZ,
    last_review_date TIMESTAMPTZ,
    next_review_date TIMESTAMPTZ,
    
    -- Learning phase tracking
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
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create updated_at trigger
CREATE TRIGGER update_user_card_progress_updated_at
    BEFORE UPDATE ON public.user_card_progress
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Set up Row Level Security (RLS)
ALTER TABLE public.user_card_progress ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view own progress"
    ON public.user_card_progress
    FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can update own progress"
    ON public.user_card_progress
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can create own progress"
    ON public.user_card_progress
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all progress"
    ON public.user_card_progress
    FOR SELECT
    USING (is_admin(auth.uid()));

CREATE POLICY "Admins can update all progress"
    ON public.user_card_progress
    FOR UPDATE
    USING (is_admin(auth.uid()))
    WITH CHECK (is_admin(auth.uid()));

-- Grant necessary permissions
GRANT ALL ON public.user_card_progress TO postgres;
GRANT SELECT, INSERT, UPDATE ON public.user_card_progress TO authenticated;

-- Create indexes
CREATE INDEX user_card_progress_user_id_idx ON public.user_card_progress(user_id);
CREATE INDEX user_card_progress_card_id_idx ON public.user_card_progress(card_id);
CREATE INDEX user_card_progress_next_review_date_idx ON public.user_card_progress(next_review_date);
CREATE INDEX user_card_progress_state_idx ON public.user_card_progress(state);
CREATE INDEX user_card_progress_created_at_idx ON public.user_card_progress(created_at);

-- Comments
COMMENT ON TABLE public.user_card_progress IS 'Tracks user progress and FSRS parameters for each card';
COMMENT ON COLUMN public.user_card_progress.stability IS 'FSRS: Memory stability (higher = more stable)';
COMMENT ON COLUMN public.user_card_progress.difficulty IS 'FSRS: Card difficulty (1-10)';
COMMENT ON COLUMN public.user_card_progress.elapsed_days IS 'FSRS: Days since last review';
COMMENT ON COLUMN public.user_card_progress.scheduled_days IS 'FSRS: Days until next review';
COMMENT ON COLUMN public.user_card_progress.state IS 'Current learning state of the card';
COMMENT ON COLUMN public.user_card_progress.last_rating IS 'Last review rating (1=Again, 2=Hard, 3=Good, 4=Easy)';