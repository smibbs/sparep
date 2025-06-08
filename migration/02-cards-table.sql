-- Migration: 02-cards-table.sql
-- Description: Creates the flashcards table and imports initial data
-- Dependencies: 01-users-table.sql (for creator_id reference)

-- Create cards table
CREATE TABLE public.cards (
    -- Primary key and metadata
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- Card content
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    hint TEXT,
    explanation TEXT,
    
    -- Card organization
    subject_id UUID, -- Will be constrained in 03-subjects-table.sql
    subsection VARCHAR(20), -- Format: "2.15.3" (chapter.section.subsection)
    tags TEXT[], -- Array of tags for flexible organization
    
    -- Card settings
    is_public BOOLEAN NOT NULL DEFAULT false,
    difficulty_rating SMALLINT CHECK (difficulty_rating BETWEEN 1 AND 5),
    
    -- Media attachments (optional)
    image_url TEXT,
    audio_url TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_reviewed_at TIMESTAMPTZ,
    
    -- Statistics
    total_reviews INT NOT NULL DEFAULT 0,
    correct_reviews INT NOT NULL DEFAULT 0,
    incorrect_reviews INT NOT NULL DEFAULT 0,
    average_response_time_ms INT DEFAULT 0
);

-- Create updated_at trigger
CREATE TRIGGER update_cards_updated_at
    BEFORE UPDATE ON public.cards
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Set up Row Level Security (RLS)
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Public cards are viewable by everyone"
    ON public.cards
    FOR SELECT
    USING (is_public = true);

CREATE POLICY "Users can view their own cards"
    ON public.cards
    FOR SELECT
    USING (creator_id = auth.uid());

CREATE POLICY "Users can insert their own cards"
    ON public.cards
    FOR INSERT
    WITH CHECK (creator_id = auth.uid());

CREATE POLICY "Users can update their own cards"
    ON public.cards
    FOR UPDATE
    USING (creator_id = auth.uid());

CREATE POLICY "Users can delete their own cards"
    ON public.cards
    FOR DELETE
    USING (creator_id = auth.uid());

-- Create indexes
CREATE INDEX cards_creator_id_idx ON public.cards(creator_id);
CREATE INDEX cards_subject_id_idx ON public.cards(subject_id);
CREATE INDEX cards_subsection_idx ON public.cards(subsection);
CREATE INDEX cards_created_at_idx ON public.cards(created_at);
CREATE INDEX cards_is_public_idx ON public.cards(is_public);
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

-- Insert sample data (these will be public cards)
INSERT INTO public.cards (question, answer, is_public, subsection, tags) VALUES
(
    'What is JavaScript?',
    'JavaScript is a high-level, interpreted programming language primarily used for creating interactive web applications.',
    true,
    '1.1.1',
    ARRAY['javascript', 'programming', 'basics']
),
(
    'What is the DOM?',
    'The Document Object Model (DOM) is a programming interface for HTML documents that represents the page as a tree-like structure of objects.',
    true,
    '1.2.1',
    ARRAY['javascript', 'dom', 'web']
),
(
    'What is CSS?',
    'Cascading Style Sheets (CSS) is a style sheet language used for describing the presentation of a document written in HTML.',
    true,
    '1.3.1',
    ARRAY['css', 'web', 'styling']
); 