-- =====================================================
-- Migration 18: Update Card Retrieval Functions
-- =====================================================
-- Updates existing functions to work with deck-subject hierarchy
-- Preserves all FSRS functionality and maintains backward compatibility
-- Requires: 17-deck-subjects-hierarchy.sql

-- =====================================================
-- ENHANCED CARD RETRIEVAL FUNCTIONS
-- =====================================================

-- Enhanced version of get_due_cards_for_user with subject filtering
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
    JOIN decks d ON d.id = uc.deck_id
    WHERE 
        uc.user_id = p_user_id
        AND (p_deck_id IS NULL OR uc.deck_id = p_deck_id)
        AND uc.state IN ('learning', 'review', 'relearning')
        AND uc.due_at <= NOW()
        AND ct.flagged_for_review = FALSE
        AND d.is_active = TRUE
        -- Include cards that are either:
        -- 1. From subjects added to the deck, OR
        -- 2. Individual cards added directly to the deck
        AND (
            EXISTS (
                -- Card's subject is in the deck
                SELECT 1 FROM deck_subjects ds 
                WHERE ds.deck_id = uc.deck_id 
                AND ds.subject_id = ct.subject_id
            )
            OR 
            -- Card was added individually (backward compatibility)
            ct.subject_id IS NULL
            OR
            -- Card exists in user_cards but subject not in deck_subjects
            -- (maintains existing functionality)
            NOT EXISTS (
                SELECT 1 FROM deck_subjects ds2 
                WHERE ds2.deck_id = uc.deck_id
            )
        )
    ORDER BY uc.due_at ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enhanced version of get_new_cards_for_user with subject filtering
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
    JOIN decks d ON d.id = uc.deck_id
    WHERE 
        uc.user_id = p_user_id
        AND (p_deck_id IS NULL OR uc.deck_id = p_deck_id)
        AND uc.state = 'new'
        AND ct.flagged_for_review = FALSE
        AND d.is_active = TRUE
        -- Include cards that are either:
        -- 1. From subjects added to the deck, OR
        -- 2. Individual cards added directly to the deck
        AND (
            EXISTS (
                -- Card's subject is in the deck
                SELECT 1 FROM deck_subjects ds 
                WHERE ds.deck_id = uc.deck_id 
                AND ds.subject_id = ct.subject_id
            )
            OR 
            -- Card was added individually (backward compatibility)
            ct.subject_id IS NULL
            OR
            -- Card exists in user_cards but subject not in deck_subjects
            -- (maintains existing functionality)
            NOT EXISTS (
                SELECT 1 FROM deck_subjects ds2 
                WHERE ds2.deck_id = uc.deck_id
            )
        )
    ORDER BY uc.created_at ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop and recreate get_card_counts_by_deck to add subject information
DROP FUNCTION IF EXISTS get_card_counts_by_deck(UUID);

CREATE FUNCTION get_card_counts_by_deck(p_user_id UUID)
RETURNS TABLE(
    deck_id UUID,
    deck_name VARCHAR,
    new_count INTEGER,
    learning_count INTEGER,
    review_count INTEGER,
    total_count INTEGER,
    subject_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.id,
        d.name,
        COUNT(*) FILTER (WHERE uc.state = 'new')::INTEGER,
        COUNT(*) FILTER (WHERE uc.state IN ('learning', 'relearning'))::INTEGER,
        COUNT(*) FILTER (WHERE uc.state = 'review')::INTEGER,
        COUNT(*)::INTEGER,
        (SELECT COUNT(*) FROM deck_subjects ds WHERE ds.deck_id = d.id) as subject_count
    FROM decks d
    LEFT JOIN user_cards uc ON uc.deck_id = d.id AND uc.user_id = p_user_id
    LEFT JOIN card_templates ct ON ct.id = uc.card_template_id
    WHERE d.user_id = p_user_id 
    AND d.is_active = TRUE
    AND (ct.id IS NULL OR ct.flagged_for_review = FALSE)
    GROUP BY d.id, d.name
    ORDER BY d.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- DECK CONTENT MANAGEMENT FUNCTIONS
-- =====================================================

-- Get comprehensive deck content (subjects + individual cards)
CREATE OR REPLACE FUNCTION get_deck_content_summary(
    p_user_id UUID,
    p_deck_id UUID
)
RETURNS TABLE(
    content_type TEXT,
    content_id UUID,
    content_name TEXT,
    card_count BIGINT,
    new_cards BIGINT,
    learning_cards BIGINT,
    review_cards BIGINT,
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
    -- Subjects in the deck
    SELECT 
        'subject'::TEXT as content_type,
        s.id as content_id,
        s.name as content_name,
        COUNT(uc.card_template_id) as card_count,
        COUNT(*) FILTER (WHERE uc.state = 'new') as new_cards,
        COUNT(*) FILTER (WHERE uc.state IN ('learning', 'relearning')) as learning_cards,
        COUNT(*) FILTER (WHERE uc.state = 'review') as review_cards,
        ds.created_at as added_at
    FROM deck_subjects ds
    JOIN subjects s ON s.id = ds.subject_id
    LEFT JOIN card_templates ct ON ct.subject_id = s.id AND ct.flagged_for_review = FALSE
    LEFT JOIN user_cards uc ON uc.card_template_id = ct.id 
        AND uc.user_id = p_user_id 
        AND uc.deck_id = p_deck_id
    WHERE ds.deck_id = p_deck_id
    AND s.is_active = TRUE
    GROUP BY s.id, s.name, ds.created_at
    
    UNION ALL
    
    -- Individual cards not part of any subject in the deck
    SELECT 
        'individual_card'::TEXT as content_type,
        ct.id as content_id,
        SUBSTRING(ct.question, 1, 50) || CASE WHEN LENGTH(ct.question) > 50 THEN '...' ELSE '' END as content_name,
        1::BIGINT as card_count,
        CASE WHEN uc.state = 'new' THEN 1 ELSE 0 END::BIGINT as new_cards,
        CASE WHEN uc.state IN ('learning', 'relearning') THEN 1 ELSE 0 END::BIGINT as learning_cards,
        CASE WHEN uc.state = 'review' THEN 1 ELSE 0 END::BIGINT as review_cards,
        uc.created_at as added_at
    FROM user_cards uc
    JOIN card_templates ct ON ct.id = uc.card_template_id
    WHERE uc.user_id = p_user_id
    AND uc.deck_id = p_deck_id
    AND ct.flagged_for_review = FALSE
    AND (
        ct.subject_id IS NULL 
        OR NOT EXISTS (
            SELECT 1 FROM deck_subjects ds 
            WHERE ds.deck_id = p_deck_id 
            AND ds.subject_id = ct.subject_id
        )
    )
    
    ORDER BY content_type, content_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Sync deck cards when subjects are added/removed
CREATE OR REPLACE FUNCTION sync_deck_cards_for_subject(
    p_user_id UUID,
    p_deck_id UUID,
    p_subject_id UUID,
    p_action TEXT -- 'add' or 'remove'
)
RETURNS INTEGER AS $$
DECLARE
    affected_cards INTEGER := 0;
BEGIN
    IF p_action = 'add' THEN
        -- Add all cards from subject to deck
        INSERT INTO user_cards (user_id, card_template_id, deck_id)
        SELECT 
            p_user_id,
            ct.id,
            p_deck_id
        FROM card_templates ct
        WHERE ct.subject_id = p_subject_id
        AND ct.flagged_for_review = FALSE
        AND NOT EXISTS (
            SELECT 1 FROM user_cards uc 
            WHERE uc.user_id = p_user_id 
            AND uc.card_template_id = ct.id 
            AND uc.deck_id = p_deck_id
        );
        
        GET DIAGNOSTICS affected_cards = ROW_COUNT;
        
    ELSIF p_action = 'remove' THEN
        -- Remove cards from subject (preserve FSRS progress)
        DELETE FROM user_cards
        WHERE user_id = p_user_id 
        AND deck_id = p_deck_id
        AND card_template_id IN (
            SELECT id FROM card_templates WHERE subject_id = p_subject_id
        )
        AND state = 'new'  -- Only remove unstudied cards
        AND total_reviews = 0;
        
        GET DIAGNOSTICS affected_cards = ROW_COUNT;
    END IF;
    
    RETURN affected_cards;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Enhanced card retrieval functions with subject filtering
-- All FSRS functionality preserved and maintained
-- Backward compatibility ensured for existing decks