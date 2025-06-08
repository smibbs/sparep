-- Migration: 04-cards.sql
-- Description: Creates the cards table for storing flashcard content
-- Dependencies: 01-initial-setup.sql, 02-user-profiles.sql, 03-subjects.sql

-- Create cards table
CREATE TABLE public.cards (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Card content
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    hint TEXT,
    explanation TEXT,
    
    -- Organization
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    subsection VARCHAR(100),
    tags TEXT[],
    
    -- Metadata
    creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    is_public BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Card statistics
    total_reviews INT NOT NULL DEFAULT 0,
    correct_reviews INT NOT NULL DEFAULT 0,
    average_response_time INT, -- in milliseconds
    
    -- Ensure cards have non-empty content
    CONSTRAINT non_empty_content CHECK (
        length(trim(question)) > 0 AND
        length(trim(answer)) > 0
    )
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
CREATE INDEX cards_subject_id_idx ON public.cards(subject_id);
CREATE INDEX cards_creator_id_idx ON public.cards(creator_id);
CREATE INDEX cards_is_public_idx ON public.cards(is_public);
CREATE INDEX cards_created_at_idx ON public.cards(created_at);
CREATE INDEX cards_tags_idx ON public.cards USING GIN(tags);

-- Comments
COMMENT ON TABLE public.cards IS 'Flashcard content and metadata';
COMMENT ON COLUMN public.cards.question IS 'Front side of the flashcard';
COMMENT ON COLUMN public.cards.answer IS 'Back side of the flashcard';
COMMENT ON COLUMN public.cards.hint IS 'Optional hint for the card';
COMMENT ON COLUMN public.cards.explanation IS 'Optional detailed explanation';
COMMENT ON COLUMN public.cards.subject_id IS 'Subject this card belongs to';
COMMENT ON COLUMN public.cards.subsection IS 'Optional subsection within the subject';
COMMENT ON COLUMN public.cards.tags IS 'Array of tags for categorization';
COMMENT ON COLUMN public.cards.is_public IS 'Whether this card is visible to all users';
COMMENT ON COLUMN public.cards.total_reviews IS 'Number of times this card has been reviewed';
COMMENT ON COLUMN public.cards.correct_reviews IS 'Number of correct reviews';
COMMENT ON COLUMN public.cards.average_response_time IS 'Average time taken to answer this card'; 