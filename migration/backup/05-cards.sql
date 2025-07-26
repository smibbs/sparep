-- Migration: 05-cards.sql
-- Description: Creates the cards table for storing flashcard content
-- Dependencies: 01-initial-setup.sql, 02-enums.sql, 03-user-profiles.sql, 04-subjects.sql

-- Create cards table
CREATE TABLE public.cards (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    
    -- Metadata
    creator_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Card content
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    hint TEXT,
    explanation TEXT,
    
    -- Organization
    subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE,
    subsection VARCHAR,
    tags TEXT[],
    
    -- Permissions and status
    is_public BOOLEAN NOT NULL DEFAULT false,
    
    -- Content metadata
    difficulty_rating SMALLINT CHECK (difficulty_rating >= 1 AND difficulty_rating <= 5),
    image_url TEXT,
    audio_url TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_reviewed_at TIMESTAMPTZ,
    
    -- Card statistics
    total_reviews INT NOT NULL DEFAULT 0,
    correct_reviews INT NOT NULL DEFAULT 0,
    incorrect_reviews INT NOT NULL DEFAULT 0,
    average_response_time_ms INT DEFAULT 0,
    
    -- Admin flagging system
    flagged_for_review BOOLEAN NOT NULL DEFAULT false,
    flagged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    flagged_reason TEXT,
    flagged_at TIMESTAMPTZ,
    
    -- User flagging system
    user_flag_count INT NOT NULL DEFAULT 0,
    last_user_flagged_at TIMESTAMPTZ
);

-- Create updated_at trigger
CREATE TRIGGER update_cards_updated_at
    BEFORE UPDATE ON public.cards
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create helper function for card access
CREATE OR REPLACE FUNCTION has_card_access(user_id UUID, card_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.cards c
        WHERE c.id = card_id AND (
            c.is_public = true OR
            c.creator_id = user_id OR
            has_subject_access(user_id, c.subject_id) OR
            is_admin(user_id)
        )
    );
END;
$$ language 'plpgsql' SECURITY DEFINER;

-- Set up Row Level Security (RLS)
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view accessible cards"
    ON public.cards
    FOR SELECT
    USING (
        is_public = true OR
        creator_id = auth.uid() OR
        has_subject_access(auth.uid(), subject_id) OR
        is_admin(auth.uid())
    );

CREATE POLICY "Users can create cards in accessible subjects"
    ON public.cards
    FOR INSERT
    WITH CHECK (
        creator_id = auth.uid() AND
        has_subject_access(auth.uid(), subject_id)
    );

CREATE POLICY "Users can update own cards"
    ON public.cards
    FOR UPDATE
    USING (creator_id = auth.uid())
    WITH CHECK (creator_id = auth.uid());

CREATE POLICY "Users can delete own cards"
    ON public.cards
    FOR DELETE
    USING (creator_id = auth.uid());

CREATE POLICY "Admins can manage all cards"
    ON public.cards
    FOR ALL
    USING (is_admin(auth.uid()))
    WITH CHECK (is_admin(auth.uid()));

-- Grant necessary permissions
GRANT ALL ON public.cards TO postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cards TO authenticated;

-- Create indexes
CREATE INDEX cards_creator_id_idx ON public.cards(creator_id);
CREATE INDEX cards_subject_id_idx ON public.cards(subject_id);
CREATE INDEX cards_is_public_idx ON public.cards(is_public);
CREATE INDEX cards_created_at_idx ON public.cards(created_at);
CREATE INDEX cards_flagged_for_review_idx ON public.cards(flagged_for_review) WHERE flagged_for_review = true;
CREATE INDEX cards_user_flag_count_idx ON public.cards(user_flag_count) WHERE user_flag_count > 0;
CREATE INDEX cards_tags_idx ON public.cards USING GIN(tags);

-- Comments
COMMENT ON TABLE public.cards IS 'Flashcards containing questions and answers';
COMMENT ON COLUMN public.cards.id IS 'Unique identifier for the card';
COMMENT ON COLUMN public.cards.creator_id IS 'User who created the card';
COMMENT ON COLUMN public.cards.subject_id IS 'Reference to the subject this card belongs to';
COMMENT ON COLUMN public.cards.subsection IS 'Hierarchical location within subject (e.g., "2.15.3")';
COMMENT ON COLUMN public.cards.tags IS 'Array of tags for flexible organization';
COMMENT ON COLUMN public.cards.is_public IS 'Whether this card is visible to other users';
COMMENT ON COLUMN public.cards.difficulty_rating IS 'Manual difficulty rating (1-5)';
COMMENT ON COLUMN public.cards.flagged_for_review IS 'Whether card is flagged for admin review before general availability';
COMMENT ON COLUMN public.cards.flagged_by IS 'Admin user who flagged this card';
COMMENT ON COLUMN public.cards.flagged_reason IS 'Reason why card was flagged for review';
COMMENT ON COLUMN public.cards.flagged_at IS 'Timestamp when card was flagged';
COMMENT ON COLUMN public.cards.user_flag_count IS 'Count of unresolved user flags for this card';
COMMENT ON COLUMN public.cards.last_user_flagged_at IS 'Timestamp of most recent user flag for this card';