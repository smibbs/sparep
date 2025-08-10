-- =====================================================
-- Migration 04: Card Templates
-- =====================================================
-- Shared card content separate from user progress
-- Requires: 01-extensions-and-enums.sql, 02-profiles.sql, 03-subjects-and-decks.sql

-- =====================================================
-- CARD TEMPLATES TABLE
-- =====================================================

CREATE TABLE card_templates (
    -- Core identity
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Card content
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    
    -- Organization
    subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
    subsection VARCHAR, -- Hierarchical location (e.g., "2.15.3")
    tags TEXT[], -- Array of tags for flexible organization
    
    -- Ownership and visibility
    creator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Admin flagging system
    flagged_for_review BOOLEAN NOT NULL DEFAULT FALSE,
    flagged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    flagged_reason TEXT,
    flagged_at TIMESTAMPTZ,
    
    -- User flag tracking
    user_flag_count INTEGER NOT NULL DEFAULT 0,
    
    -- Global statistics (across all users)
    total_reviews INTEGER NOT NULL DEFAULT 0,
    correct_reviews INTEGER NOT NULL DEFAULT 0,
    incorrect_reviews INTEGER NOT NULL DEFAULT 0,
    average_response_time_ms INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT card_templates_question_not_empty CHECK (length(trim(question)) > 0),
    CONSTRAINT card_templates_answer_not_empty CHECK (length(trim(answer)) > 0),
    CONSTRAINT card_templates_user_flag_count_check CHECK (user_flag_count >= 0),
    CONSTRAINT card_templates_total_reviews_check CHECK (total_reviews >= 0),
    CONSTRAINT card_templates_correct_reviews_check CHECK (correct_reviews >= 0),
    CONSTRAINT card_templates_incorrect_reviews_check CHECK (incorrect_reviews >= 0),
    CONSTRAINT card_templates_average_response_time_ms_check CHECK (average_response_time_ms IS NULL OR average_response_time_ms >= 0),
    CONSTRAINT card_templates_reviews_consistency CHECK (correct_reviews + incorrect_reviews <= total_reviews)
);

-- Enable Row Level Security
ALTER TABLE card_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for card_templates
CREATE POLICY "Public unflagged cards are viewable by all" ON card_templates
    FOR SELECT USING (
        is_public = TRUE 
        AND flagged_for_review = FALSE
    );

CREATE POLICY "Users can view their own cards" ON card_templates
    FOR SELECT USING (auth.uid() = creator_id);

CREATE POLICY "Users can create cards" ON card_templates
    FOR INSERT WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Users can update their own unflagged cards" ON card_templates
    FOR UPDATE USING (
        auth.uid() = creator_id 
        AND flagged_for_review = FALSE
    );

CREATE POLICY "Users can delete their own unflagged cards" ON card_templates
    FOR DELETE USING (
        auth.uid() = creator_id 
        AND flagged_for_review = FALSE
    );

CREATE POLICY "Admins can manage all cards" ON card_templates
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND is_admin = TRUE
        )
    );

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Updated at trigger
CREATE TRIGGER card_templates_updated_at
    BEFORE UPDATE ON card_templates
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX idx_card_templates_creator_id ON card_templates(creator_id);
CREATE INDEX idx_card_templates_subject_id ON card_templates(subject_id);
CREATE INDEX idx_card_templates_is_public ON card_templates(is_public);
CREATE INDEX idx_card_templates_flagged_for_review ON card_templates(flagged_for_review);
CREATE INDEX idx_card_templates_tags ON card_templates USING GIN(tags);
CREATE INDEX idx_card_templates_subsection ON card_templates(subsection);

-- Full text search indexes (for question/answer search)
CREATE INDEX idx_card_templates_question_fts ON card_templates USING GIN(to_tsvector('english', question));
CREATE INDEX idx_card_templates_answer_fts ON card_templates USING GIN(to_tsvector('english', answer));

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to update card statistics after review
CREATE OR REPLACE FUNCTION update_card_template_stats(
    template_id UUID,
    was_correct BOOLEAN,
    response_time_ms INTEGER
)
RETURNS VOID AS $$
BEGIN
    UPDATE card_templates
    SET 
        total_reviews = total_reviews + 1,
        correct_reviews = correct_reviews + CASE WHEN was_correct THEN 1 ELSE 0 END,
        incorrect_reviews = incorrect_reviews + CASE WHEN was_correct THEN 0 ELSE 1 END,
        average_response_time_ms = CASE 
            WHEN total_reviews = 0 THEN response_time_ms
            ELSE ROUND((COALESCE(average_response_time_ms, 0) * total_reviews + response_time_ms) / (total_reviews + 1))
        END,
        updated_at = NOW()
    WHERE id = template_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to search cards by content
CREATE OR REPLACE FUNCTION search_card_templates(
    search_query TEXT,
    limit_count INTEGER DEFAULT 50,
    include_private BOOLEAN DEFAULT FALSE,
    user_id UUID DEFAULT NULL
)
RETURNS TABLE(
    id UUID,
    question TEXT,
    answer TEXT,
    subject_id UUID,
    tags TEXT[],
    creator_id UUID,
    is_public BOOLEAN,
    rank REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ct.id,
        ct.question,
        ct.answer,
        ct.subject_id,
        ct.tags,
        ct.creator_id,
        ct.is_public,
        ts_rank(
            to_tsvector('english', ct.question || ' ' || ct.answer), 
            plainto_tsquery('english', search_query)
        ) as rank
    FROM card_templates ct
    WHERE 
        (
            to_tsvector('english', ct.question || ' ' || ct.answer) @@ plainto_tsquery('english', search_query)
            OR ct.question ILIKE '%' || search_query || '%'
            OR ct.answer ILIKE '%' || search_query || '%'
        )
        AND ct.flagged_for_review = FALSE
        AND (
            ct.is_public = TRUE
            OR (include_private AND ct.creator_id = user_id)
        )
    ORDER BY rank DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to flag card for admin review
CREATE OR REPLACE FUNCTION admin_flag_card(
    template_id UUID,
    admin_id UUID,
    reason TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    is_admin BOOLEAN;
BEGIN
    -- Check if user is admin
    SELECT profiles.is_admin INTO is_admin
    FROM profiles
    WHERE id = admin_id;
    
    IF NOT is_admin THEN
        RETURN FALSE;
    END IF;
    
    -- Flag the card
    UPDATE card_templates
    SET 
        flagged_for_review = TRUE,
        flagged_by = admin_id,
        flagged_reason = reason,
        flagged_at = NOW(),
        updated_at = NOW()
    WHERE id = template_id;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to unflag card (resolve admin flag)
CREATE OR REPLACE FUNCTION admin_unflag_card(
    template_id UUID,
    admin_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    is_admin BOOLEAN;
BEGIN
    -- Check if user is admin
    SELECT profiles.is_admin INTO is_admin
    FROM profiles
    WHERE id = admin_id;
    
    IF NOT is_admin THEN
        RETURN FALSE;
    END IF;
    
    -- Unflag the card
    UPDATE card_templates
    SET 
        flagged_for_review = FALSE,
        flagged_by = NULL,
        flagged_reason = NULL,
        flagged_at = NULL,
        updated_at = NOW()
    WHERE id = template_id;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Card templates with shared content are ready
-- Next: Run 05-user-cards.sql