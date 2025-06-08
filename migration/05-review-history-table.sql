-- Migration: 05-review-history-table.sql
-- Description: Creates the table for storing detailed review history for FSRS calculations
-- Dependencies: 01-users-table.sql (for user_id), 02-cards-table.sql (for card_id)

-- Create review_history table
CREATE TABLE public.review_history (
    -- Primary key
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Foreign keys
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
    
    -- Review data
    review_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 4),
    response_time_ms INT NOT NULL CHECK (response_time_ms >= 0),
    
    -- FSRS parameters at time of review
    stability_before FLOAT NOT NULL,
    difficulty_before FLOAT NOT NULL,
    elapsed_days FLOAT NOT NULL,
    scheduled_days FLOAT NOT NULL,
    
    -- FSRS parameters after review
    stability_after FLOAT NOT NULL,
    difficulty_after FLOAT NOT NULL,
    
    -- Learning phase data
    learning_step INT,
    was_relearning BOOLEAN NOT NULL DEFAULT false,
    
    -- Review state changes
    state_before card_state NOT NULL,
    state_after card_state NOT NULL,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_stability_before CHECK (stability_before >= 0.0),
    CONSTRAINT valid_stability_after CHECK (stability_after >= 0.0),
    CONSTRAINT valid_difficulty_before CHECK (difficulty_before BETWEEN 1.0 AND 10.0),
    CONSTRAINT valid_difficulty_after CHECK (difficulty_after BETWEEN 1.0 AND 10.0),
    CONSTRAINT valid_elapsed_days CHECK (elapsed_days >= 0.0),
    CONSTRAINT valid_scheduled_days CHECK (scheduled_days >= 0.0)
);

-- Set up Row Level Security (RLS)
ALTER TABLE public.review_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own review history"
    ON public.review_history
    FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own review history"
    ON public.review_history
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Note: No UPDATE or DELETE policies as review history should be immutable

-- Create indexes
CREATE INDEX review_history_user_id_idx ON public.review_history(user_id);
CREATE INDEX review_history_card_id_idx ON public.review_history(card_id);
CREATE INDEX review_history_review_date_idx ON public.review_history(review_date);
CREATE INDEX review_history_rating_idx ON public.review_history(rating);

-- Create composite index for common queries
CREATE INDEX review_history_user_card_date_idx ON public.review_history(user_id, card_id, review_date DESC);

-- Comments
COMMENT ON TABLE public.review_history IS 'Stores detailed history of card reviews for FSRS calculations';
COMMENT ON COLUMN public.review_history.rating IS 'User rating (1=Again, 2=Hard, 3=Good, 4=Easy)';
COMMENT ON COLUMN public.review_history.stability_before IS 'FSRS: Memory stability before review';
COMMENT ON COLUMN public.review_history.stability_after IS 'FSRS: Memory stability after review';
COMMENT ON COLUMN public.review_history.difficulty_before IS 'FSRS: Card difficulty before review';
COMMENT ON COLUMN public.review_history.difficulty_after IS 'FSRS: Card difficulty after review';
COMMENT ON COLUMN public.review_history.elapsed_days IS 'Days since last review';
COMMENT ON COLUMN public.review_history.scheduled_days IS 'Days that were scheduled for this review';

-- Create function to update user_card_progress after review
CREATE OR REPLACE FUNCTION update_card_progress_after_review()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the user_card_progress table with the new FSRS parameters
    UPDATE public.user_card_progress
    SET 
        stability = NEW.stability_after,
        difficulty = NEW.difficulty_after,
        state = NEW.state_after,
        last_rating = NEW.rating,
        last_review_date = NEW.review_date,
        total_reviews = total_reviews + 1,
        correct_reviews = CASE 
            WHEN NEW.rating >= 3 THEN correct_reviews + 1 
            ELSE correct_reviews 
        END,
        incorrect_reviews = CASE 
            WHEN NEW.rating < 3 THEN incorrect_reviews + 1 
            ELSE incorrect_reviews 
        END,
        streak = CASE 
            WHEN NEW.rating >= 3 THEN streak + 1 
            ELSE 0 
        END,
        average_time_ms = ((average_time_ms * total_reviews) + NEW.response_time_ms) / (total_reviews + 1)
    WHERE 
        user_id = NEW.user_id 
        AND card_id = NEW.card_id;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to update progress after review
CREATE TRIGGER after_review_recorded
    AFTER INSERT ON public.review_history
    FOR EACH ROW
    EXECUTE FUNCTION update_card_progress_after_review(); 