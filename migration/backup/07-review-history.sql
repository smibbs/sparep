-- Migration: 07-review-history.sql
-- Description: Creates the table for storing detailed review history for FSRS calculations
-- Dependencies: 01-initial-setup.sql, 02-enums.sql, 03-user-profiles.sql, 05-cards.sql

-- Create review_history table
CREATE TABLE public.review_history (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Foreign keys
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
    
    -- Review timing
    review_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Review data
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 4),
    response_time_ms INT NOT NULL CHECK (response_time_ms >= 0),
    
    -- FSRS state before review
    stability_before DOUBLE PRECISION NOT NULL CHECK (stability_before >= 0.0),
    difficulty_before DOUBLE PRECISION NOT NULL CHECK (difficulty_before >= 1.0 AND difficulty_before <= 10.0),
    elapsed_days DOUBLE PRECISION NOT NULL CHECK (elapsed_days >= 0.0),
    scheduled_days DOUBLE PRECISION NOT NULL CHECK (scheduled_days >= 0.0),
    
    -- FSRS state after review
    stability_after DOUBLE PRECISION NOT NULL CHECK (stability_after >= 0.0),
    difficulty_after DOUBLE PRECISION NOT NULL CHECK (difficulty_after >= 1.0 AND difficulty_after <= 10.0),
    
    -- Learning state tracking
    learning_step INT,
    was_relearning BOOLEAN NOT NULL DEFAULT false,
    state_before card_state NOT NULL,
    state_after card_state NOT NULL,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
CREATE INDEX review_history_review_date_idx ON public.review_history(review_date);
CREATE INDEX review_history_rating_idx ON public.review_history(rating);
CREATE INDEX review_history_created_at_idx ON public.review_history(created_at);

-- Comments
COMMENT ON TABLE public.review_history IS 'Stores detailed history of card reviews for FSRS calculations';
COMMENT ON COLUMN public.review_history.rating IS 'User rating (1=Again, 2=Hard, 3=Good, 4=Easy)';
COMMENT ON COLUMN public.review_history.response_time_ms IS 'Time taken to respond in milliseconds';
COMMENT ON COLUMN public.review_history.stability_before IS 'FSRS: Memory stability before review';
COMMENT ON COLUMN public.review_history.difficulty_before IS 'FSRS: Card difficulty before review';
COMMENT ON COLUMN public.review_history.elapsed_days IS 'Days since last review';
COMMENT ON COLUMN public.review_history.scheduled_days IS 'Days that were scheduled for this review';
COMMENT ON COLUMN public.review_history.stability_after IS 'FSRS: Memory stability after review';
COMMENT ON COLUMN public.review_history.difficulty_after IS 'FSRS: Card difficulty after review';