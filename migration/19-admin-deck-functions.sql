-- =====================================================
-- Migration 19: Admin Deck Designer Functions
-- =====================================================
-- Admin-only functions for creating and managing decks
-- with LTREE path-based card addition
-- Requires: 16-add-ltree-path-to-card-templates.sql

-- =====================================================
-- ADMIN DECK CREATION FUNCTIONS
-- =====================================================

-- Create admin-managed deck
CREATE OR REPLACE FUNCTION admin_create_deck(
    p_admin_id UUID,
    p_name VARCHAR,
    p_description TEXT DEFAULT NULL,
    p_is_public BOOLEAN DEFAULT FALSE
)
RETURNS UUID AS $$
DECLARE
    is_admin BOOLEAN;
    new_deck_id UUID;
BEGIN
    -- Verify admin privileges
    SELECT profiles.is_admin INTO is_admin
    FROM profiles
    WHERE id = p_admin_id;
    
    IF NOT is_admin THEN
        RAISE EXCEPTION 'Admin privileges required';
    END IF;
    
    -- Create deck owned by admin
    INSERT INTO decks (user_id, name, description, is_public)
    VALUES (p_admin_id, p_name, p_description, p_is_public)
    RETURNING id INTO new_deck_id;
    
    RETURN new_deck_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Delete admin deck
CREATE OR REPLACE FUNCTION admin_delete_deck(
    p_admin_id UUID,
    p_deck_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    is_admin BOOLEAN;
    deck_owner UUID;
BEGIN
    -- Verify admin privileges
    SELECT profiles.is_admin INTO is_admin
    FROM profiles
    WHERE id = p_admin_id;
    
    IF NOT is_admin THEN
        RAISE EXCEPTION 'Admin privileges required';
    END IF;
    
    -- Verify deck is admin-owned
    SELECT user_id INTO deck_owner
    FROM decks
    WHERE id = p_deck_id;
    
    IF deck_owner != p_admin_id THEN
        RAISE EXCEPTION 'Can only delete admin-owned decks';
    END IF;
    
    -- Delete deck (CASCADE will handle user_cards)
    DELETE FROM decks WHERE id = p_deck_id;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Toggle deck visibility
CREATE OR REPLACE FUNCTION admin_set_deck_visibility(
    p_admin_id UUID,
    p_deck_id UUID,
    p_is_public BOOLEAN
)
RETURNS BOOLEAN AS $$
DECLARE
    is_admin BOOLEAN;
    deck_owner UUID;
BEGIN
    -- Verify admin privileges
    SELECT profiles.is_admin INTO is_admin
    FROM profiles
    WHERE id = p_admin_id;
    
    IF NOT is_admin THEN
        RAISE EXCEPTION 'Admin privileges required';
    END IF;
    
    -- Verify deck is admin-owned
    SELECT user_id INTO deck_owner
    FROM decks
    WHERE id = p_deck_id;
    
    IF deck_owner != p_admin_id THEN
        RAISE EXCEPTION 'Can only modify admin-owned decks';
    END IF;
    
    -- Update visibility
    UPDATE decks 
    SET is_public = p_is_public, updated_at = NOW()
    WHERE id = p_deck_id;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- LTREE PATH CARD MANAGEMENT FUNCTIONS
-- =====================================================

-- Add all cards matching LTREE path to admin deck
CREATE OR REPLACE FUNCTION admin_add_cards_by_path(
    p_admin_id UUID,
    p_deck_id UUID,
    p_path_pattern TEXT
)
RETURNS INTEGER AS $$
DECLARE
    is_admin BOOLEAN;
    deck_owner UUID;
    path_ltree LTREE;
    cards_added INTEGER := 0;
BEGIN
    -- Verify admin privileges
    SELECT profiles.is_admin INTO is_admin
    FROM profiles
    WHERE id = p_admin_id;
    
    IF NOT is_admin THEN
        RAISE EXCEPTION 'Admin privileges required';
    END IF;
    
    -- Verify deck is admin-owned
    SELECT user_id INTO deck_owner
    FROM decks
    WHERE id = p_deck_id;
    
    IF deck_owner != p_admin_id THEN
        RAISE EXCEPTION 'Can only add cards to admin-owned decks';
    END IF;
    
    -- Convert path to LTREE
    BEGIN
        path_ltree := p_path_pattern::LTREE;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE EXCEPTION 'Invalid LTREE path format: %', p_path_pattern;
    END;
    
    -- Add all cards with paths that start with the pattern
    INSERT INTO user_cards (user_id, card_template_id, deck_id)
    SELECT 
        p_admin_id,
        ct.id,
        p_deck_id
    FROM card_templates ct
    WHERE ct.path IS NOT NULL
    AND (ct.path <@ path_ltree OR ct.path ~ (p_path_pattern || '.*')::lquery)
    AND ct.flagged_for_review = FALSE
    AND ct.is_public = TRUE
    AND NOT EXISTS (
        -- Don't add if card already exists in this deck
        SELECT 1 FROM user_cards uc 
        WHERE uc.user_id = p_admin_id 
        AND uc.card_template_id = ct.id 
        AND uc.deck_id = p_deck_id
    );
    
    GET DIAGNOSTICS cards_added = ROW_COUNT;
    
    RETURN cards_added;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Preview cards that would be added by LTREE path
CREATE OR REPLACE FUNCTION admin_preview_cards_by_path(
    p_admin_id UUID,
    p_path_pattern TEXT,
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE(
    card_template_id UUID,
    question TEXT,
    answer TEXT,
    path LTREE,
    subject_name VARCHAR
) AS $$
DECLARE
    is_admin BOOLEAN;
    path_ltree LTREE;
BEGIN
    -- Verify admin privileges
    SELECT profiles.is_admin INTO is_admin
    FROM profiles
    WHERE id = p_admin_id;
    
    IF NOT is_admin THEN
        RAISE EXCEPTION 'Admin privileges required';
    END IF;
    
    -- Convert path to LTREE
    BEGIN
        path_ltree := p_path_pattern::LTREE;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE EXCEPTION 'Invalid LTREE path format: %', p_path_pattern;
    END;
    
    RETURN QUERY
    SELECT 
        ct.id,
        ct.question,
        ct.answer,
        ct.path,
        COALESCE(s.name, 'No Subject') as subject_name
    FROM card_templates ct
    LEFT JOIN subjects s ON s.id = ct.subject_id
    WHERE ct.path IS NOT NULL
    AND (ct.path <@ path_ltree OR ct.path ~ (p_path_pattern || '.*')::lquery)
    AND ct.flagged_for_review = FALSE
    AND ct.is_public = TRUE
    ORDER BY ct.path, ct.created_at
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get count of cards that would be added by LTREE path
CREATE OR REPLACE FUNCTION admin_count_cards_by_path(
    p_admin_id UUID,
    p_path_pattern TEXT
)
RETURNS INTEGER AS $$
DECLARE
    is_admin BOOLEAN;
    path_ltree LTREE;
    card_count INTEGER;
BEGIN
    -- Verify admin privileges
    SELECT profiles.is_admin INTO is_admin
    FROM profiles
    WHERE id = p_admin_id;
    
    IF NOT is_admin THEN
        RAISE EXCEPTION 'Admin privileges required';
    END IF;
    
    -- Convert path to LTREE
    BEGIN
        path_ltree := p_path_pattern::LTREE;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE EXCEPTION 'Invalid LTREE path format: %', p_path_pattern;
    END;
    
    SELECT COUNT(*)::INTEGER INTO card_count
    FROM card_templates ct
    WHERE ct.path IS NOT NULL
    AND (ct.path <@ path_ltree OR ct.path ~ (p_path_pattern || '.*')::lquery)
    AND ct.flagged_for_review = FALSE
    AND ct.is_public = TRUE;
    
    RETURN card_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- ADMIN DECK LISTING FUNCTIONS
-- =====================================================

-- Get all admin-owned decks with stats
CREATE OR REPLACE FUNCTION admin_list_decks(
    p_admin_id UUID
)
RETURNS TABLE(
    deck_id UUID,
    deck_name VARCHAR,
    description TEXT,
    is_public BOOLEAN,
    card_count BIGINT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
DECLARE
    is_admin BOOLEAN;
BEGIN
    -- Verify admin privileges
    SELECT profiles.is_admin INTO is_admin
    FROM profiles
    WHERE id = p_admin_id;
    
    IF NOT is_admin THEN
        RAISE EXCEPTION 'Admin privileges required';
    END IF;
    
    RETURN QUERY
    SELECT 
        d.id,
        d.name,
        d.description,
        d.is_public,
        COUNT(uc.card_template_id) as card_count,
        d.created_at,
        d.updated_at
    FROM decks d
    LEFT JOIN user_cards uc ON uc.deck_id = d.id AND uc.user_id = p_admin_id
    WHERE d.user_id = p_admin_id  -- Only admin-owned decks
    GROUP BY d.id, d.name, d.description, d.is_public, d.created_at, d.updated_at
    ORDER BY d.updated_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get detailed deck information
CREATE OR REPLACE FUNCTION admin_get_deck_details(
    p_admin_id UUID,
    p_deck_id UUID
)
RETURNS TABLE(
    deck_id UUID,
    deck_name VARCHAR,
    description TEXT,
    is_public BOOLEAN,
    card_count BIGINT,
    unique_paths TEXT[],
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
DECLARE
    is_admin BOOLEAN;
    deck_owner UUID;
BEGIN
    -- Verify admin privileges
    SELECT profiles.is_admin INTO is_admin
    FROM profiles
    WHERE id = p_admin_id;
    
    IF NOT is_admin THEN
        RAISE EXCEPTION 'Admin privileges required';
    END IF;
    
    -- Verify deck is admin-owned
    SELECT user_id INTO deck_owner
    FROM decks
    WHERE id = p_deck_id;
    
    IF deck_owner != p_admin_id THEN
        RAISE EXCEPTION 'Can only view admin-owned decks';
    END IF;
    
    RETURN QUERY
    SELECT 
        d.id,
        d.name,
        d.description,
        d.is_public,
        COUNT(uc.card_template_id) as card_count,
        ARRAY_AGG(DISTINCT ct.path::TEXT ORDER BY ct.path::TEXT) FILTER (WHERE ct.path IS NOT NULL) as unique_paths,
        d.created_at,
        d.updated_at
    FROM decks d
    LEFT JOIN user_cards uc ON uc.deck_id = d.id AND uc.user_id = p_admin_id
    LEFT JOIN card_templates ct ON ct.id = uc.card_template_id
    WHERE d.id = p_deck_id
    GROUP BY d.id, d.name, d.description, d.is_public, d.created_at, d.updated_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Admin deck designer functions ready:
-- - Create/delete/manage admin decks
-- - Add cards by LTREE path patterns
-- - Preview and count cards before adding
-- - List and view deck details