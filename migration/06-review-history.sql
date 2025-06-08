-- Migration: 06-review-history.sql
-- Description: Creates the table for storing review history
-- Dependencies: 01-initial-setup.sql, 02-user-profiles.sql, 04-cards.sql

-- Create review_history table
CREATE TABLE public.review_history (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Foreign keys
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
    
    -- Review data
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 4),
    response_time INT NOT NULL, -- in milliseconds
    
    -- FSRS state at time of review
    stability_before FLOAT NOT NULL,
    difficulty_before FLOAT NOT NULL,
    elapsed_days FLOAT NOT NULL,
    scheduled_days FLOAT NOT NULL,
    
    -- FSRS state after review
    stability_after FLOAT NOT NULL,
    difficulty_after FLOAT NOT NULL,
    
    -- Learning state
    state_before TEXT NOT NULL CHECK (state_before IN ('new', 'learning', 'review', 'relearning')),
    state_after TEXT NOT NULL CHECK (state_after IN ('learning', 'review', 'relearning')),
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Ensure valid FSRS values
    CONSTRAINT valid_fsrs_values CHECK (
        stability_before >= 0.0 AND
        stability_after >= 0.0 AND
        difficulty_before >= 1.0 AND difficulty_before <= 10.0 AND
        difficulty_after >= 1.0 AND difficulty_after <= 10.0 AND
        elapsed_days >= 0.0 AND
        scheduled_days >= 0.0
    )
);

-- Set up Row Level Security (RLS)
ALTER TABLE public.review_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view own review history"
    ON public.review_history
    FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can create own review history"
    ON public.review_history
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all review history"
    ON public.review_history
    FOR SELECT
    USING (is_admin(auth.uid()));

-- Grant necessary permissions
GRANT ALL ON public.review_history TO postgres;
GRANT SELECT, INSERT ON public.review_history TO authenticated;

-- Create indexes
CREATE INDEX review_history_user_id_idx ON public.review_history(user_id);
CREATE INDEX review_history_card_id_idx ON public.review_history(card_id);
CREATE INDEX review_history_created_at_idx ON public.review_history(created_at);
CREATE INDEX review_history_rating_idx ON public.review_history(rating);

-- Comments
COMMENT ON TABLE public.review_history IS 'Historical record of all card reviews';
COMMENT ON COLUMN public.review_history.rating IS 'User rating (1=Again, 2=Hard, 3=Good, 4=Easy)';
COMMENT ON COLUMN public.review_history.response_time IS 'Time taken to respond in milliseconds';
COMMENT ON COLUMN public.review_history.stability_before IS 'FSRS stability before review';
COMMENT ON COLUMN public.review_history.difficulty_before IS 'FSRS difficulty before review';
COMMENT ON COLUMN public.review_history.elapsed_days IS 'Days since last review';
COMMENT ON COLUMN public.review_history.scheduled_days IS 'Days until review was scheduled';
COMMENT ON COLUMN public.review_history.stability_after IS 'FSRS stability after review';
COMMENT ON COLUMN public.review_history.difficulty_after IS 'FSRS difficulty after review';
COMMENT ON COLUMN public.review_history.state_before IS 'Learning state before review';
COMMENT ON COLUMN public.review_history.state_after IS 'Learning state after review'; 