-- Migration: 03-subjects.sql
-- Description: Creates the subjects table for organizing flashcards
-- Dependencies: 01-initial-setup.sql, 02-user-profiles.sql

-- Create subjects table
CREATE TABLE public.subjects (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Subject fields
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_public BOOLEAN NOT NULL DEFAULT false,
    
    -- Metadata
    creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Study organization
    total_cards INT NOT NULL DEFAULT 0,
    total_subsections INT NOT NULL DEFAULT 0,
    
    -- Ensure unique names per creator
    UNIQUE (creator_id, name)
);

-- Create updated_at trigger
CREATE TRIGGER update_subjects_updated_at
    BEFORE UPDATE ON public.subjects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create helper function for subject access
CREATE OR REPLACE FUNCTION has_subject_access(user_id UUID, subject_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.subjects s
        WHERE s.id = subject_id AND (
            s.is_public = true OR
            s.creator_id = user_id OR
            is_admin(user_id)
        )
    );
END;
$$ language 'plpgsql' SECURITY DEFINER;

-- Set up Row Level Security (RLS)
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view accessible subjects"
    ON public.subjects
    FOR SELECT
    USING (
        is_public = true OR
        creator_id = auth.uid() OR
        is_admin(auth.uid())
    );

CREATE POLICY "Users can create subjects"
    ON public.subjects
    FOR INSERT
    WITH CHECK (creator_id = auth.uid());

CREATE POLICY "Users can update own subjects"
    ON public.subjects
    FOR UPDATE
    USING (creator_id = auth.uid())
    WITH CHECK (creator_id = auth.uid());

CREATE POLICY "Users can delete own subjects"
    ON public.subjects
    FOR DELETE
    USING (creator_id = auth.uid());

CREATE POLICY "Admins can manage all subjects"
    ON public.subjects
    FOR ALL
    USING (is_admin(auth.uid()))
    WITH CHECK (is_admin(auth.uid()));

-- Grant necessary permissions
GRANT ALL ON public.subjects TO postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subjects TO authenticated;

-- Create indexes
CREATE INDEX subjects_creator_id_idx ON public.subjects(creator_id);
CREATE INDEX subjects_is_public_idx ON public.subjects(is_public);
CREATE INDEX subjects_created_at_idx ON public.subjects(created_at);

-- Comments
COMMENT ON TABLE public.subjects IS 'Subject categories for organizing flashcards';
COMMENT ON COLUMN public.subjects.name IS 'Name of the subject';
COMMENT ON COLUMN public.subjects.description IS 'Optional description of the subject';
COMMENT ON COLUMN public.subjects.is_public IS 'Whether this subject is visible to all users';
COMMENT ON COLUMN public.subjects.creator_id IS 'User who created this subject';
COMMENT ON COLUMN public.subjects.total_cards IS 'Total number of cards in this subject';
COMMENT ON COLUMN public.subjects.total_subsections IS 'Number of subsections in this subject'; 