-- =====================================================
-- Migration 17: Deck-Subjects Hierarchy
-- =====================================================
-- Implements cards → subjects → decks hierarchy
-- Preserves all FSRS functionality and user progress
-- Requires: All previous migrations

-- =====================================================
-- DECK_SUBJECTS JUNCTION TABLE
-- =====================================================

CREATE TABLE deck_subjects (
    -- Composite primary key
    deck_id UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Primary key constraint
    PRIMARY KEY (deck_id, subject_id)
);

-- Enable Row Level Security
ALTER TABLE deck_subjects ENABLE ROW LEVEL SECURITY;

-- RLS Policies for deck_subjects
CREATE POLICY "Users can view their deck subjects" ON deck_subjects
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM decks 
            WHERE id = deck_id AND user_id = auth.uid()
        )
    );

CREATE POLICY "Users can add subjects to their decks" ON deck_subjects
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM decks 
            WHERE id = deck_id AND user_id = auth.uid()
        )
    );

CREATE POLICY "Users can remove subjects from their decks" ON deck_subjects
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM decks 
            WHERE id = deck_id AND user_id = auth.uid()
        )
    );

CREATE POLICY "Admins can manage all deck subjects" ON deck_subjects
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND is_admin = TRUE
        )
    );

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX idx_deck_subjects_deck_id ON deck_subjects(deck_id);
CREATE INDEX idx_deck_subjects_subject_id ON deck_subjects(subject_id);

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Updated at trigger
CREATE TRIGGER deck_subjects_updated_at
    BEFORE UPDATE ON deck_subjects
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- SUBJECT MANAGEMENT FUNCTIONS
-- =====================================================

-- Add entire subject to deck
CREATE OR REPLACE FUNCTION add_subject_to_deck(
    p_user_id UUID,
    p_deck_id UUID,
    p_subject_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    deck_belongs_to_user BOOLEAN;
    subject_exists BOOLEAN;
    already_exists BOOLEAN;
BEGIN
    -- Verify deck belongs to user
    SELECT EXISTS (
        SELECT 1 FROM decks 
        WHERE id = p_deck_id AND user_id = p_user_id
    ) INTO deck_belongs_to_user;
    
    IF NOT deck_belongs_to_user THEN
        RAISE EXCEPTION 'Deck does not belong to user';
    END IF;
    
    -- Verify subject exists and user has access
    SELECT EXISTS (
        SELECT 1 FROM subjects 
        WHERE id = p_subject_id 
        AND (is_public = TRUE OR creator_id = p_user_id)
        AND is_active = TRUE
    ) INTO subject_exists;
    
    IF NOT subject_exists THEN
        RAISE EXCEPTION 'Subject does not exist or user does not have access';
    END IF;
    
    -- Check if relationship already exists
    SELECT EXISTS (
        SELECT 1 FROM deck_subjects 
        WHERE deck_id = p_deck_id AND subject_id = p_subject_id
    ) INTO already_exists;
    
    IF already_exists THEN
        RETURN FALSE; -- Already exists, no action needed
    END IF;
    
    -- Add subject to deck
    INSERT INTO deck_subjects (deck_id, subject_id)
    VALUES (p_deck_id, p_subject_id);
    
    -- Auto-add all cards from this subject to user's deck
    INSERT INTO user_cards (user_id, card_template_id, deck_id)
    SELECT 
        p_user_id,
        ct.id,
        p_deck_id
    FROM card_templates ct
    WHERE ct.subject_id = p_subject_id
    AND ct.flagged_for_review = FALSE
    AND NOT EXISTS (
        -- Don't add if card already exists in this deck for this user
        SELECT 1 FROM user_cards uc 
        WHERE uc.user_id = p_user_id 
        AND uc.card_template_id = ct.id 
        AND uc.deck_id = p_deck_id
    );
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remove entire subject from deck
CREATE OR REPLACE FUNCTION remove_subject_from_deck(
    p_user_id UUID,
    p_deck_id UUID,
    p_subject_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    deck_belongs_to_user BOOLEAN;
    relationship_exists BOOLEAN;
BEGIN
    -- Verify deck belongs to user
    SELECT EXISTS (
        SELECT 1 FROM decks 
        WHERE id = p_deck_id AND user_id = p_user_id
    ) INTO deck_belongs_to_user;
    
    IF NOT deck_belongs_to_user THEN
        RAISE EXCEPTION 'Deck does not belong to user';
    END IF;
    
    -- Check if relationship exists
    SELECT EXISTS (
        SELECT 1 FROM deck_subjects 
        WHERE deck_id = p_deck_id AND subject_id = p_subject_id
    ) INTO relationship_exists;
    
    IF NOT relationship_exists THEN
        RETURN FALSE; -- Relationship doesn't exist
    END IF;
    
    -- Remove subject from deck
    DELETE FROM deck_subjects 
    WHERE deck_id = p_deck_id AND subject_id = p_subject_id;
    
    -- Remove all cards from this subject from user's deck
    -- BUT PRESERVE FSRS PROGRESS - only remove cards that haven't been studied
    DELETE FROM user_cards
    WHERE user_id = p_user_id 
    AND deck_id = p_deck_id
    AND card_template_id IN (
        SELECT id FROM card_templates WHERE subject_id = p_subject_id
    )
    AND state = 'new'  -- Only remove unstudied cards to preserve FSRS progress
    AND total_reviews = 0; -- Double-check no progress exists
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- INDIVIDUAL CARD MANAGEMENT FUNCTIONS
-- =====================================================

-- Add individual card by path to deck
CREATE OR REPLACE FUNCTION add_card_to_deck_by_path(
    p_user_id UUID,
    p_deck_id UUID,
    p_card_path LTREE
)
RETURNS BOOLEAN AS $$
DECLARE
    deck_belongs_to_user BOOLEAN;
    card_template_id UUID;
BEGIN
    -- Verify deck belongs to user
    SELECT EXISTS (
        SELECT 1 FROM decks 
        WHERE id = p_deck_id AND user_id = p_user_id
    ) INTO deck_belongs_to_user;
    
    IF NOT deck_belongs_to_user THEN
        RAISE EXCEPTION 'Deck does not belong to user';
    END IF;
    
    -- Find card template by path
    SELECT id INTO card_template_id
    FROM card_templates 
    WHERE path = p_card_path 
    AND flagged_for_review = FALSE
    AND (is_public = TRUE OR creator_id = p_user_id)
    LIMIT 1;
    
    IF card_template_id IS NULL THEN
        RAISE EXCEPTION 'Card not found or user does not have access';
    END IF;
    
    -- Use existing add_card_to_deck function to maintain FSRS compatibility
    PERFORM add_card_to_deck(p_user_id, card_template_id, p_deck_id);
    
    RETURN TRUE;
EXCEPTION
    WHEN OTHERS THEN
        -- Card already exists or other error
        RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remove individual card by path from deck
CREATE OR REPLACE FUNCTION remove_card_from_deck_by_path(
    p_user_id UUID,
    p_deck_id UUID,
    p_card_path LTREE
)
RETURNS BOOLEAN AS $$
DECLARE
    deck_belongs_to_user BOOLEAN;
    card_template_id UUID;
    cards_removed INTEGER;
BEGIN
    -- Verify deck belongs to user
    SELECT EXISTS (
        SELECT 1 FROM decks 
        WHERE id = p_deck_id AND user_id = p_user_id
    ) INTO deck_belongs_to_user;
    
    IF NOT deck_belongs_to_user THEN
        RAISE EXCEPTION 'Deck does not belong to user';
    END IF;
    
    -- Find card template by path
    SELECT id INTO card_template_id
    FROM card_templates 
    WHERE path = p_card_path
    LIMIT 1;
    
    IF card_template_id IS NULL THEN
        RAISE EXCEPTION 'Card not found';
    END IF;
    
    -- Remove card BUT PRESERVE FSRS PROGRESS
    DELETE FROM user_cards
    WHERE user_id = p_user_id 
    AND deck_id = p_deck_id
    AND card_template_id = card_template_id
    AND state = 'new'  -- Only remove unstudied cards to preserve FSRS progress
    AND total_reviews = 0; -- Double-check no progress exists
    
    GET DIAGNOSTICS cards_removed = ROW_COUNT;
    
    RETURN cards_removed > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Get subjects in a deck
CREATE OR REPLACE FUNCTION get_deck_subjects(
    p_user_id UUID,
    p_deck_id UUID
)
RETURNS TABLE(
    subject_id UUID,
    subject_name VARCHAR,
    subject_description TEXT,
    card_count BIGINT,
    added_at TIMESTAMPTZ
) AS $$
BEGIN
    -- Verify deck belongs to user
    IF NOT EXISTS (
        SELECT 1 FROM decks 
        WHERE id = p_deck_id AND user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'Deck does not belong to user';
    END IF;
    
    RETURN QUERY
    SELECT 
        s.id,
        s.name,
        s.description,
        COUNT(ct.id) as card_count,
        ds.created_at
    FROM deck_subjects ds
    JOIN subjects s ON s.id = ds.subject_id
    LEFT JOIN card_templates ct ON ct.subject_id = s.id 
        AND ct.flagged_for_review = FALSE
    WHERE ds.deck_id = p_deck_id
    AND s.is_active = TRUE
    GROUP BY s.id, s.name, s.description, ds.created_at
    ORDER BY s.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get cards available for deck (from deck's subjects)
CREATE OR REPLACE FUNCTION get_cards_available_for_deck(
    p_user_id UUID,
    p_deck_id UUID,
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE(
    card_template_id UUID,
    subject_id UUID,
    subject_name VARCHAR,
    question TEXT,
    answer TEXT,
    path LTREE,
    in_deck BOOLEAN
) AS $$
BEGIN
    -- Verify deck belongs to user
    IF NOT EXISTS (
        SELECT 1 FROM decks 
        WHERE id = p_deck_id AND user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'Deck does not belong to user';
    END IF;
    
    RETURN QUERY
    SELECT 
        ct.id,
        ct.subject_id,
        s.name,
        ct.question,
        ct.answer,
        ct.path,
        EXISTS(
            SELECT 1 FROM user_cards uc 
            WHERE uc.user_id = p_user_id 
            AND uc.card_template_id = ct.id 
            AND uc.deck_id = p_deck_id
        ) as in_deck
    FROM card_templates ct
    JOIN subjects s ON s.id = ct.subject_id
    JOIN deck_subjects ds ON ds.subject_id = ct.subject_id
    WHERE ds.deck_id = p_deck_id
    AND ct.flagged_for_review = FALSE
    AND (ct.is_public = TRUE OR ct.creator_id = p_user_id)
    AND s.is_active = TRUE
    ORDER BY s.name, ct.path, ct.created_at
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Deck-subject hierarchy implemented with FSRS preservation
-- All existing FSRS functionality remains intact
-- Users can now manage decks by subjects and individual cards