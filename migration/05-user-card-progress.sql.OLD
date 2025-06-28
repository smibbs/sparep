-- Migration: 05-user-card-progress.sql
-- Description: Creates the table for tracking user progress on cards
-- Dependencies: 01-initial-setup.sql, 02-user-profiles.sql, 04-cards.sql

-- Create user_card_progress table
CREATE TABLE public.user_card_progress (
    -- Composite primary key
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, card_id),
    
    -- FSRS algorithm state
    stability FLOAT NOT NULL DEFAULT 1.0,
    difficulty FLOAT NOT NULL DEFAULT 5.0,
    elapsed_days FLOAT NOT NULL DEFAULT 0.0,
    scheduled_days FLOAT NOT NULL DEFAULT 0.0,
    reps INT NOT NULL DEFAULT 0,
    lapses INT NOT NULL DEFAULT 0,
    state TEXT NOT NULL DEFAULT 'new' CHECK (state IN ('new', 'learning', 'review', 'relearning')),
    
    -- Scheduling
    last_review_at TIMESTAMPTZ,
    next_review_at TIMESTAMPTZ,
    
    -- Statistics
    total_reviews INT NOT NULL DEFAULT 0,
    correct_reviews INT NOT NULL DEFAULT 0,
    average_response_time INT, -- in milliseconds
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Ensure valid FSRS values
    CONSTRAINT valid_fsrs_values CHECK (
        stability >= 0.0 AND
        difficulty >= 1.0 AND difficulty <= 10.0 AND
        elapsed_days >= 0.0 AND
        scheduled_days >= 0.0 AND
        reps >= 0 AND
        lapses >= 0
    )
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
CREATE INDEX user_card_progress_next_review_idx ON public.user_card_progress(next_review_at);
CREATE INDEX user_card_progress_state_idx ON public.user_card_progress(state);
CREATE INDEX user_card_progress_created_at_idx ON public.user_card_progress(created_at);

-- Comments
COMMENT ON TABLE public.user_card_progress IS 'Tracks learning progress for each user-card pair';
COMMENT ON COLUMN public.user_card_progress.stability IS 'FSRS stability factor';
COMMENT ON COLUMN public.user_card_progress.difficulty IS 'FSRS difficulty rating (1-10)';
COMMENT ON COLUMN public.user_card_progress.elapsed_days IS 'Days since last review';
COMMENT ON COLUMN public.user_card_progress.scheduled_days IS 'Days until next review';
COMMENT ON COLUMN public.user_card_progress.reps IS 'Number of times reviewed';
COMMENT ON COLUMN public.user_card_progress.lapses IS 'Number of times forgotten';
COMMENT ON COLUMN public.user_card_progress.state IS 'Current learning state of the card';
COMMENT ON COLUMN public.user_card_progress.next_review_at IS 'When this card is due for review'; 