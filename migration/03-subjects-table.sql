-- Migration: 03-subjects-table.sql
-- Description: Creates the subjects table for organizing cards
-- Dependencies: 01-users-table.sql (for creator_id), 02-cards-table.sql (for foreign key)

-- Create subjects table
CREATE TABLE public.subjects (
    -- Primary key and metadata
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- Subject details
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon_name VARCHAR(50), -- For UI display (e.g., 'javascript', 'python', 'react')
    color_hex VARCHAR(7), -- Hex color code (e.g., '#FF5733')
    
    -- Organization
    parent_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE,
    display_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    
    -- Structure
    total_chapters INT NOT NULL DEFAULT 0,
    total_sections INT NOT NULL DEFAULT 0,
    total_subsections INT NOT NULL DEFAULT 0,
    
    -- Access control
    is_public BOOLEAN NOT NULL DEFAULT false,
    requires_approval BOOLEAN NOT NULL DEFAULT false,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_color_hex CHECK (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
    CONSTRAINT prevent_self_parent CHECK (id != parent_id)
);

-- Create updated_at trigger
CREATE TRIGGER update_subjects_updated_at
    BEFORE UPDATE ON public.subjects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add foreign key constraint to cards table
ALTER TABLE public.cards
    ADD CONSTRAINT cards_subject_id_fkey
    FOREIGN KEY (subject_id)
    REFERENCES public.subjects(id)
    ON DELETE SET NULL;

-- Set up Row Level Security (RLS)
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Public subjects are viewable by everyone"
    ON public.subjects
    FOR SELECT
    USING (is_public = true);

CREATE POLICY "Users can view their own subjects"
    ON public.subjects
    FOR SELECT
    USING (creator_id = auth.uid());

CREATE POLICY "Users can insert their own subjects"
    ON public.subjects
    FOR INSERT
    WITH CHECK (creator_id = auth.uid());

CREATE POLICY "Users can update their own subjects"
    ON public.subjects
    FOR UPDATE
    USING (creator_id = auth.uid());

CREATE POLICY "Users can delete their own subjects"
    ON public.subjects
    FOR DELETE
    USING (creator_id = auth.uid());

-- Create indexes
CREATE INDEX subjects_creator_id_idx ON public.subjects(creator_id);
CREATE INDEX subjects_parent_id_idx ON public.subjects(parent_id);
CREATE INDEX subjects_is_public_idx ON public.subjects(is_public);
CREATE INDEX subjects_display_order_idx ON public.subjects(display_order);

-- Comments
COMMENT ON TABLE public.subjects IS 'Subject categories for organizing flashcards';
COMMENT ON COLUMN public.subjects.id IS 'Unique identifier for the subject';
COMMENT ON COLUMN public.subjects.parent_id IS 'Optional parent subject for hierarchical organization';
COMMENT ON COLUMN public.subjects.icon_name IS 'Icon identifier for UI display';
COMMENT ON COLUMN public.subjects.color_hex IS 'Hex color code for UI theming';
COMMENT ON COLUMN public.subjects.display_order IS 'Order for displaying subjects in lists';
COMMENT ON COLUMN public.subjects.requires_approval IS 'Whether new cards need approval before being added';

-- Insert initial subjects
INSERT INTO public.subjects (
    name,
    description,
    icon_name,
    color_hex,
    is_public,
    total_chapters,
    total_sections,
    total_subsections,
    display_order
) VALUES
(
    'Web Development',
    'Core concepts of web development including HTML, CSS, and JavaScript',
    'web',
    '#3498db',
    true,
    3,
    9,
    27,
    1
),
(
    'JavaScript Fundamentals',
    'Essential JavaScript concepts and programming basics',
    'javascript',
    '#f1c40f',
    true,
    5,
    15,
    45,
    2
),
(
    'Frontend Frameworks',
    'Modern JavaScript frameworks and libraries',
    'react',
    '#2ecc71',
    true,
    4,
    12,
    36,
    3
); 