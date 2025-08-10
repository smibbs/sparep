-- =====================================================
-- Migration 05: User Cards
-- =====================================================
-- Individual user progress tracking with FSRS state
-- Requires: 01-extensions-and-enums.sql through 04-card-templates.sql

-- =====================================================
-- USER CARDS TABLE
-- =====================================================

CREATE TABLE user_cards (
    -- Core identity (composite primary key)
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    card_template_id UUID NOT NULL REFERENCES card_templates(id) ON DELETE CASCADE,
    deck_id UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    
    -- FSRS Algorithm State (modern 0-3 rating scale)
    state card_state NOT NULL DEFAULT 'new',
    stability DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
    difficulty DECIMAL(10,4) NOT NULL DEFAULT 5.0000,
    
    -- Scheduling
    due_at TIMESTAMPTZ,
    last_reviewed_at TIMESTAMPTZ,
    
    -- FSRS Tracking
    elapsed_days DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
    scheduled_days DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
    reps INTEGER NOT NULL DEFAULT 0,
    lapses INTEGER NOT NULL DEFAULT 0,
    
    -- Last review info
    last_rating INTEGER, -- 0=Again, 1=Hard, 2=Good, 3=Easy (modern FSRS scale)
    
    -- Individual statistics
    total_reviews INTEGER NOT NULL DEFAULT 0,
    correct_reviews INTEGER NOT NULL DEFAULT 0,
    incorrect_reviews INTEGER NOT NULL DEFAULT 0,
    average_response_time_ms INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Primary key
    PRIMARY KEY (user_id, card_template_id, deck_id),
    
    -- Constraints
    CONSTRAINT user_cards_stability_check CHECK (stability >= 0.0000),
    CONSTRAINT user_cards_difficulty_check CHECK (difficulty >= 1.0000 AND difficulty <= 10.0000),
    CONSTRAINT user_cards_elapsed_days_check CHECK (elapsed_days >= 0.0000),
    CONSTRAINT user_cards_scheduled_days_check CHECK (scheduled_days >= 0.0000),
    CONSTRAINT user_cards_reps_check CHECK (reps >= 0),
    CONSTRAINT user_cards_lapses_check CHECK (lapses >= 0),
    CONSTRAINT user_cards_last_rating_check CHECK (last_rating IS NULL OR (last_rating >= 0 AND last_rating <= 3)),
    CONSTRAINT user_cards_total_reviews_check CHECK (total_reviews >= 0),
    CONSTRAINT user_cards_correct_reviews_check CHECK (correct_reviews >= 0),
    CONSTRAINT user_cards_incorrect_reviews_check CHECK (incorrect_reviews >= 0),
    CONSTRAINT user_cards_average_response_time_ms_check CHECK (average_response_time_ms IS NULL OR average_response_time_ms >= 0),
    CONSTRAINT user_cards_reviews_consistency CHECK (correct_reviews + incorrect_reviews <= total_reviews)
);

-- Enable Row Level Security
ALTER TABLE user_cards ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_cards
CREATE POLICY "Users can view their own cards" ON user_cards
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own cards" ON user_cards
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own cards" ON user_cards
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own cards" ON user_cards
    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all user cards" ON user_cards
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
CREATE TRIGGER user_cards_updated_at
    BEFORE UPDATE ON user_cards
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Core indexes for lookups
CREATE INDEX idx_user_cards_user_id ON user_cards(user_id);
CREATE INDEX idx_user_cards_card_template_id ON user_cards(card_template_id);
CREATE INDEX idx_user_cards_deck_id ON user_cards(deck_id);

-- FSRS scheduling indexes (critical for performance)
CREATE INDEX idx_user_cards_due_at ON user_cards(due_at);
CREATE INDEX idx_user_cards_state ON user_cards(state);
CREATE INDEX idx_user_cards_user_state ON user_cards(user_id, state);
CREATE INDEX idx_user_cards_user_due ON user_cards(user_id, due_at) WHERE due_at IS NOT NULL;
CREATE INDEX idx_user_cards_user_deck_state ON user_cards(user_id, deck_id, state);

-- Composite indexes for common queries
CREATE INDEX idx_user_cards_user_deck_due ON user_cards(user_id, deck_id, due_at) WHERE due_at IS NOT NULL;
CREATE INDEX idx_user_cards_user_state_due ON user_cards(user_id, state, due_at) WHERE state IN ('learning', 'review');

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to add a card template to a user's deck
CREATE OR REPLACE FUNCTION add_card_to_deck(
    p_user_id UUID,
    p_card_template_id UUID,
    p_deck_id UUID
)
RETURNS UUID AS $$
DECLARE
    card_exists BOOLEAN;
    deck_belongs_to_user BOOLEAN;
BEGIN
    -- Check if deck belongs to user
    SELECT EXISTS (
        SELECT 1 FROM decks 
        WHERE id = p_deck_id AND user_id = p_user_id
    ) INTO deck_belongs_to_user;
    
    IF NOT deck_belongs_to_user THEN
        RAISE EXCEPTION 'Deck does not belong to user';
    END IF;
    
    -- Check if card already exists for this user/template/deck combo
    SELECT EXISTS (
        SELECT 1 FROM user_cards 
        WHERE user_id = p_user_id 
        AND card_template_id = p_card_template_id 
        AND deck_id = p_deck_id
    ) INTO card_exists;
    
    IF card_exists THEN
        RAISE EXCEPTION 'Card already exists in this deck for this user';
    END IF;
    
    -- Insert the new user card
    INSERT INTO user_cards (user_id, card_template_id, deck_id)
    VALUES (p_user_id, p_card_template_id, p_deck_id);
    
    RETURN p_card_template_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get cards due for review
CREATE OR REPLACE FUNCTION get_due_cards_for_user(
    p_user_id UUID,
    p_deck_id UUID DEFAULT NULL,
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE(
    card_template_id UUID,
    deck_id UUID,
    state card_state,
    due_at TIMESTAMPTZ,
    stability DECIMAL,
    difficulty DECIMAL,
    question TEXT,
    answer TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        uc.card_template_id,
        uc.deck_id,
        uc.state,
        uc.due_at,
        uc.stability,
        uc.difficulty,
        ct.question,
        ct.answer
    FROM user_cards uc
    JOIN card_templates ct ON ct.id = uc.card_template_id
    WHERE 
        uc.user_id = p_user_id
        AND (p_deck_id IS NULL OR uc.deck_id = p_deck_id)
        AND uc.state IN ('learning', 'review', 'relearning')
        AND uc.due_at <= NOW()
        AND ct.flagged_for_review = FALSE
    ORDER BY uc.due_at ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get new cards for user
CREATE OR REPLACE FUNCTION get_new_cards_for_user(
    p_user_id UUID,
    p_deck_id UUID DEFAULT NULL,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE(
    card_template_id UUID,
    deck_id UUID,
    question TEXT,
    answer TEXT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        uc.card_template_id,
        uc.deck_id,
        ct.question,
        ct.answer,
        uc.created_at
    FROM user_cards uc
    JOIN card_templates ct ON ct.id = uc.card_template_id
    WHERE 
        uc.user_id = p_user_id
        AND (p_deck_id IS NULL OR uc.deck_id = p_deck_id)
        AND uc.state = 'new'
        AND ct.flagged_for_review = FALSE
    ORDER BY uc.created_at ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update card after review (FSRS state update)
CREATE OR REPLACE FUNCTION update_card_after_review(
    p_user_id UUID,
    p_card_template_id UUID,
    p_deck_id UUID,
    p_rating INTEGER, -- 0=Again, 1=Hard, 2=Good, 3=Easy
    p_response_time_ms INTEGER,
    p_new_state card_state,
    p_new_stability DECIMAL,
    p_new_difficulty DECIMAL,
    p_new_due_at TIMESTAMPTZ,
    p_elapsed_days DECIMAL,
    p_scheduled_days DECIMAL
)
RETURNS BOOLEAN AS $$
DECLARE
    old_total_reviews INTEGER;
    old_avg_time INTEGER;
    was_correct BOOLEAN;
BEGIN
    -- Determine if rating was correct (Good or Easy)
    was_correct := p_rating >= 2;
    
    -- Get current stats for average calculation
    SELECT total_reviews, average_response_time_ms
    INTO old_total_reviews, old_avg_time
    FROM user_cards
    WHERE user_id = p_user_id 
    AND card_template_id = p_card_template_id 
    AND deck_id = p_deck_id;
    
    -- Update the user card
    UPDATE user_cards
    SET 
        state = p_new_state,
        stability = p_new_stability,
        difficulty = p_new_difficulty,
        due_at = p_new_due_at,
        last_reviewed_at = NOW(),
        elapsed_days = p_elapsed_days,
        scheduled_days = p_scheduled_days,
        last_rating = p_rating,
        reps = reps + 1,
        lapses = lapses + CASE WHEN p_rating = 0 THEN 1 ELSE 0 END,
        total_reviews = total_reviews + 1,
        correct_reviews = correct_reviews + CASE WHEN was_correct THEN 1 ELSE 0 END,
        incorrect_reviews = incorrect_reviews + CASE WHEN was_correct THEN 0 ELSE 1 END,
        average_response_time_ms = CASE 
            WHEN old_total_reviews = 0 THEN p_response_time_ms
            ELSE ROUND((COALESCE(old_avg_time, 0) * old_total_reviews + p_response_time_ms) / (old_total_reviews + 1))
        END,
        updated_at = NOW()
    WHERE user_id = p_user_id 
    AND card_template_id = p_card_template_id 
    AND deck_id = p_deck_id;
    
    -- Update global card template statistics
    PERFORM update_card_template_stats(p_card_template_id, was_correct, p_response_time_ms);
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get card counts by deck
CREATE OR REPLACE FUNCTION get_card_counts_by_deck(p_user_id UUID)
RETURNS TABLE(
    deck_id UUID,
    deck_name VARCHAR,
    new_count INTEGER,
    learning_count INTEGER,
    review_count INTEGER,
    total_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.id,
        d.name,
        COUNT(*) FILTER (WHERE uc.state = 'new')::INTEGER,
        COUNT(*) FILTER (WHERE uc.state IN ('learning', 'relearning'))::INTEGER,
        COUNT(*) FILTER (WHERE uc.state = 'review')::INTEGER,
        COUNT(*)::INTEGER
    FROM decks d
    LEFT JOIN user_cards uc ON uc.deck_id = d.id AND uc.user_id = p_user_id
    WHERE d.user_id = p_user_id AND d.is_active = TRUE
    GROUP BY d.id, d.name
    ORDER BY d.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- User cards with individual FSRS progress tracking are ready
-- Next: Run 06-reviews.sql