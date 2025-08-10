-- =====================================================
-- Migration 03: Subjects and Decks
-- =====================================================
-- Subject organization and new deck-based learning system
-- Requires: 01-extensions-and-enums.sql, 02-profiles.sql

-- =====================================================
-- SUBJECTS TABLE
-- =====================================================

CREATE TABLE subjects (
    -- Core identity
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR NOT NULL,
    description TEXT,
    
    -- Hierarchy support
    parent_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
    
    -- Ownership and visibility
    creator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT subjects_name_not_empty CHECK (length(trim(name)) > 0)
);

-- Enable Row Level Security
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;

-- RLS Policies for subjects
CREATE POLICY "Public subjects are viewable by all" ON subjects
    FOR SELECT USING (is_public = TRUE AND is_active = TRUE);

CREATE POLICY "Users can view their own subjects" ON subjects
    FOR SELECT USING (auth.uid() = creator_id);

CREATE POLICY "Users can create subjects" ON subjects
    FOR INSERT WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Users can update their own subjects" ON subjects
    FOR UPDATE USING (auth.uid() = creator_id);

CREATE POLICY "Users can delete their own subjects" ON subjects
    FOR DELETE USING (auth.uid() = creator_id);

CREATE POLICY "Admins can manage all subjects" ON subjects
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND is_admin = TRUE
        )
    );

-- =====================================================
-- DECKS TABLE (NEW CONCEPT)
-- =====================================================

CREATE TABLE decks (
    -- Core identity
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR NOT NULL,
    description TEXT,
    
    -- Ownership
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Deck settings and limits
    daily_new_cards_limit INTEGER DEFAULT NULL, -- NULL = inherit from profile
    daily_review_limit INTEGER DEFAULT NULL,    -- NULL = inherit from profile
    
    -- FSRS overrides (NULL = use user's global FSRS params)
    desired_retention DECIMAL(3,2) DEFAULT NULL, -- e.g., 0.90 for 90% retention
    
    -- Learning configuration overrides
    learning_steps_minutes INTEGER[] DEFAULT NULL,
    graduating_interval_days INTEGER DEFAULT NULL,
    easy_interval_days INTEGER DEFAULT NULL,
    maximum_interval_days INTEGER DEFAULT NULL,
    
    -- Deck state
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT decks_name_not_empty CHECK (length(trim(name)) > 0),
    CONSTRAINT decks_daily_new_cards_limit_check CHECK (daily_new_cards_limit IS NULL OR daily_new_cards_limit >= 0),
    CONSTRAINT decks_daily_review_limit_check CHECK (daily_review_limit IS NULL OR daily_review_limit >= 0),
    CONSTRAINT decks_desired_retention_check CHECK (desired_retention IS NULL OR (desired_retention > 0 AND desired_retention <= 1)),
    CONSTRAINT decks_graduating_interval_days_check CHECK (graduating_interval_days IS NULL OR graduating_interval_days > 0),
    CONSTRAINT decks_easy_interval_days_check CHECK (easy_interval_days IS NULL OR easy_interval_days > 0),
    CONSTRAINT decks_maximum_interval_days_check CHECK (maximum_interval_days IS NULL OR maximum_interval_days > 0)
);

-- Enable Row Level Security
ALTER TABLE decks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for decks
CREATE POLICY "Users can view their own decks" ON decks
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own decks" ON decks
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own decks" ON decks
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own decks" ON decks
    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all decks" ON decks
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND is_admin = TRUE
        )
    );

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Updated at triggers
CREATE TRIGGER subjects_updated_at
    BEFORE UPDATE ON subjects
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER decks_updated_at
    BEFORE UPDATE ON decks
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- INDEXES
-- =====================================================

-- Subjects indexes
CREATE INDEX idx_subjects_creator_id ON subjects(creator_id);
CREATE INDEX idx_subjects_parent_id ON subjects(parent_id);
CREATE INDEX idx_subjects_is_public ON subjects(is_public);
CREATE INDEX idx_subjects_is_active ON subjects(is_active);

-- Decks indexes
CREATE INDEX idx_decks_user_id ON decks(user_id);
CREATE INDEX idx_decks_is_active ON decks(is_active);

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to get effective daily limits for a deck
CREATE OR REPLACE FUNCTION get_deck_daily_limits(deck_id UUID)
RETURNS TABLE(
    new_cards_limit INTEGER,
    review_limit INTEGER
) AS $$
DECLARE
    deck_record RECORD;
    profile_record RECORD;
BEGIN
    -- Get deck settings
    SELECT * INTO deck_record
    FROM decks
    WHERE id = deck_id;
    
    IF NOT FOUND THEN
        RETURN;
    END IF;
    
    -- Get user profile defaults
    SELECT * INTO profile_record
    FROM profiles
    WHERE id = deck_record.user_id;
    
    IF NOT FOUND THEN
        RETURN;
    END IF;
    
    -- Return effective limits (deck override or profile default)
    new_cards_limit := COALESCE(deck_record.daily_new_cards_limit, profile_record.daily_new_cards_limit);
    review_limit := COALESCE(deck_record.daily_review_limit, profile_record.daily_review_limit);
    
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create default deck for new user
CREATE OR REPLACE FUNCTION create_default_deck_for_user(user_id UUID)
RETURNS UUID AS $$
DECLARE
    new_deck_id UUID;
BEGIN
    INSERT INTO decks (user_id, name, description)
    VALUES (
        user_id,
        'Default Deck',
        'Your main study deck. You can create additional decks to organize your learning.'
    )
    RETURNING id INTO new_deck_id;
    
    RETURN new_deck_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Subjects and decks are ready with deck-based organization
-- Next: Run 04-card-templates.sql