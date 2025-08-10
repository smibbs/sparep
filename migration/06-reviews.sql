-- =====================================================
-- Migration 06: Reviews
-- =====================================================
-- Immutable review history for FSRS calculations and analytics
-- Requires: 01-extensions-and-enums.sql through 05-user-cards.sql

-- =====================================================
-- REVIEWS TABLE
-- =====================================================

CREATE TABLE reviews (
    -- Core identity
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Review context
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    card_template_id UUID NOT NULL REFERENCES card_templates(id) ON DELETE CASCADE,
    deck_id UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    
    -- Review timing
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    response_time_ms INTEGER NOT NULL,
    
    -- FSRS Rating (0-3 scale: Again=0, Hard=1, Good=2, Easy=3)
    rating INTEGER NOT NULL,
    
    -- FSRS State Before Review
    state_before card_state NOT NULL,
    stability_before DECIMAL(10,4) NOT NULL,
    difficulty_before DECIMAL(10,4) NOT NULL,
    due_at_before TIMESTAMPTZ,
    
    -- FSRS State After Review
    state_after card_state NOT NULL,
    stability_after DECIMAL(10,4) NOT NULL,
    difficulty_after DECIMAL(10,4) NOT NULL,
    due_at_after TIMESTAMPTZ,
    
    -- FSRS Calculation Values
    elapsed_days DECIMAL(10,4) NOT NULL, -- Days since last review
    scheduled_days DECIMAL(10,4) NOT NULL, -- Days that were scheduled for this review
    
    -- Review sequence tracking
    reps_before INTEGER NOT NULL, -- Number of reps before this review
    lapses_before INTEGER NOT NULL, -- Number of lapses before this review
    
    -- Immutable timestamp (never changes)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT reviews_rating_check CHECK (rating >= 0 AND rating <= 3),
    CONSTRAINT reviews_response_time_ms_check CHECK (response_time_ms > 0),
    CONSTRAINT reviews_stability_before_check CHECK (stability_before >= 0.0000),
    CONSTRAINT reviews_difficulty_before_check CHECK (difficulty_before >= 1.0000 AND difficulty_before <= 10.0000),
    CONSTRAINT reviews_stability_after_check CHECK (stability_after >= 0.0000),
    CONSTRAINT reviews_difficulty_after_check CHECK (difficulty_after >= 1.0000 AND difficulty_after <= 10.0000),
    CONSTRAINT reviews_elapsed_days_check CHECK (elapsed_days >= 0.0000),
    CONSTRAINT reviews_scheduled_days_check CHECK (scheduled_days >= 0.0000),
    CONSTRAINT reviews_reps_before_check CHECK (reps_before >= 0),
    CONSTRAINT reviews_lapses_before_check CHECK (lapses_before >= 0)
);

-- Enable Row Level Security
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- RLS Policies for reviews
CREATE POLICY "Users can view their own reviews" ON reviews
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own reviews" ON reviews
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Note: Reviews are immutable - no UPDATE or DELETE policies

CREATE POLICY "Admins can view all reviews" ON reviews
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND is_admin = TRUE
        )
    );

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Core lookup indexes
CREATE INDEX idx_reviews_user_id ON reviews(user_id);
CREATE INDEX idx_reviews_card_template_id ON reviews(card_template_id);
CREATE INDEX idx_reviews_deck_id ON reviews(deck_id);

-- Time-based indexes for analytics
CREATE INDEX idx_reviews_reviewed_at ON reviews(reviewed_at);
CREATE INDEX idx_reviews_user_reviewed_at ON reviews(user_id, reviewed_at);
CREATE INDEX idx_reviews_user_card_reviewed_at ON reviews(user_id, card_template_id, reviewed_at);

-- Rating and performance indexes
CREATE INDEX idx_reviews_rating ON reviews(rating);
CREATE INDEX idx_reviews_user_rating ON reviews(user_id, rating);
CREATE INDEX idx_reviews_response_time ON reviews(response_time_ms);

-- FSRS analytics indexes
CREATE INDEX idx_reviews_user_card_deck ON reviews(user_id, card_template_id, deck_id);

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to record a review (called by update_card_after_review)
CREATE OR REPLACE FUNCTION record_review(
    p_user_id UUID,
    p_card_template_id UUID,
    p_deck_id UUID,
    p_rating INTEGER,
    p_response_time_ms INTEGER,
    p_state_before card_state,
    p_stability_before DECIMAL,
    p_difficulty_before DECIMAL,
    p_due_at_before TIMESTAMPTZ,
    p_state_after card_state,
    p_stability_after DECIMAL,
    p_difficulty_after DECIMAL,
    p_due_at_after TIMESTAMPTZ,
    p_elapsed_days DECIMAL,
    p_scheduled_days DECIMAL,
    p_reps_before INTEGER,
    p_lapses_before INTEGER
)
RETURNS UUID AS $$
DECLARE
    new_review_id UUID;
BEGIN
    INSERT INTO reviews (
        user_id,
        card_template_id,
        deck_id,
        rating,
        response_time_ms,
        state_before,
        stability_before,
        difficulty_before,
        due_at_before,
        state_after,
        stability_after,
        difficulty_after,
        due_at_after,
        elapsed_days,
        scheduled_days,
        reps_before,
        lapses_before
    ) VALUES (
        p_user_id,
        p_card_template_id,
        p_deck_id,
        p_rating,
        p_response_time_ms,
        p_state_before,
        p_stability_before,
        p_difficulty_before,
        p_due_at_before,
        p_state_after,
        p_stability_after,
        p_difficulty_after,
        p_due_at_after,
        p_elapsed_days,
        p_scheduled_days,
        p_reps_before,
        p_lapses_before
    )
    RETURNING id INTO new_review_id;
    
    RETURN new_review_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get review history for a specific card
CREATE OR REPLACE FUNCTION get_card_review_history(
    p_user_id UUID,
    p_card_template_id UUID,
    p_deck_id UUID,
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE(
    id UUID,
    reviewed_at TIMESTAMPTZ,
    rating INTEGER,
    response_time_ms INTEGER,
    state_before card_state,
    state_after card_state,
    stability_before DECIMAL,
    stability_after DECIMAL,
    difficulty_before DECIMAL,
    difficulty_after DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id,
        r.reviewed_at,
        r.rating,
        r.response_time_ms,
        r.state_before,
        r.state_after,
        r.stability_before,
        r.stability_after,
        r.difficulty_before,
        r.difficulty_after
    FROM reviews r
    WHERE 
        r.user_id = p_user_id
        AND r.card_template_id = p_card_template_id
        AND r.deck_id = p_deck_id
    ORDER BY r.reviewed_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's recent review activity
CREATE OR REPLACE FUNCTION get_recent_review_activity(
    p_user_id UUID,
    p_days INTEGER DEFAULT 30,
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE(
    reviewed_at TIMESTAMPTZ,
    rating INTEGER,
    response_time_ms INTEGER,
    question TEXT,
    answer TEXT,
    deck_name VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.reviewed_at,
        r.rating,
        r.response_time_ms,
        ct.question,
        ct.answer,
        d.name
    FROM reviews r
    JOIN card_templates ct ON ct.id = r.card_template_id
    JOIN decks d ON d.id = r.deck_id
    WHERE 
        r.user_id = p_user_id
        AND r.reviewed_at >= NOW() - INTERVAL '1 day' * p_days
    ORDER BY r.reviewed_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get review statistics for user
CREATE OR REPLACE FUNCTION get_user_review_stats(
    p_user_id UUID,
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(
    total_reviews INTEGER,
    again_count INTEGER,
    hard_count INTEGER,
    good_count INTEGER,
    easy_count INTEGER,
    avg_response_time_ms INTEGER,
    accuracy_percent DECIMAL
) AS $$
DECLARE
    start_filter TIMESTAMPTZ;
    end_filter TIMESTAMPTZ;
BEGIN
    start_filter := COALESCE(p_start_date, NOW() - INTERVAL '30 days');
    end_filter := COALESCE(p_end_date, NOW());
    
    RETURN QUERY
    SELECT 
        COUNT(*)::INTEGER as total_reviews,
        COUNT(*) FILTER (WHERE rating = 0)::INTEGER as again_count,
        COUNT(*) FILTER (WHERE rating = 1)::INTEGER as hard_count,
        COUNT(*) FILTER (WHERE rating = 2)::INTEGER as good_count,
        COUNT(*) FILTER (WHERE rating = 3)::INTEGER as easy_count,
        ROUND(AVG(response_time_ms))::INTEGER as avg_response_time_ms,
        ROUND(
            COUNT(*) FILTER (WHERE rating >= 2) * 100.0 / NULLIF(COUNT(*), 0),
            2
        ) as accuracy_percent
    FROM reviews r
    WHERE 
        r.user_id = p_user_id
        AND r.reviewed_at >= start_filter
        AND r.reviewed_at <= end_filter;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Immutable review history with comprehensive FSRS tracking is ready
-- Next: Run 07-fsrs-params.sql