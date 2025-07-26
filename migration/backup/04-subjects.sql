-- Migration: 04-subjects.sql
-- Description: Creates the subjects table for organizing flashcards
-- Dependencies: 01-initial-setup.sql, 02-enums.sql, 03-user-profiles.sql

-- Create subjects table
CREATE TABLE public.subjects (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    
    -- Metadata
    creator_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Subject fields
    name VARCHAR NOT NULL,
    description TEXT,
    
    -- Visual customization
    icon_name VARCHAR,
    color_hex VARCHAR CHECK (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
    
    -- Hierarchical organization
    parent_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE,
    display_order INT NOT NULL DEFAULT 0,
    
    -- Status and permissions
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_public BOOLEAN NOT NULL DEFAULT false,
    requires_approval BOOLEAN NOT NULL DEFAULT false,
    
    -- Statistics
    total_chapters INT NOT NULL DEFAULT 0,
    total_sections INT NOT NULL DEFAULT 0,
    total_subsections INT NOT NULL DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
CREATE INDEX subjects_parent_id_idx ON public.subjects(parent_id);
CREATE INDEX subjects_is_public_idx ON public.subjects(is_public);
CREATE INDEX subjects_is_active_idx ON public.subjects(is_active);
CREATE INDEX subjects_created_at_idx ON public.subjects(created_at);

-- Comments
COMMENT ON TABLE public.subjects IS 'Subject categories for organizing flashcards';
COMMENT ON COLUMN public.subjects.id IS 'Unique identifier for the subject';
COMMENT ON COLUMN public.subjects.name IS 'Name of the subject';
COMMENT ON COLUMN public.subjects.description IS 'Optional description of the subject';
COMMENT ON COLUMN public.subjects.icon_name IS 'Icon identifier for UI display';
COMMENT ON COLUMN public.subjects.color_hex IS 'Hex color code for UI theming';
COMMENT ON COLUMN public.subjects.parent_id IS 'Optional parent subject for hierarchical organization';
COMMENT ON COLUMN public.subjects.display_order IS 'Order for displaying subjects in lists';
COMMENT ON COLUMN public.subjects.is_public IS 'Whether this subject is visible to all users';
COMMENT ON COLUMN public.subjects.requires_approval IS 'Whether new cards need approval before being added';
COMMENT ON COLUMN public.subjects.creator_id IS 'User who created this subject';