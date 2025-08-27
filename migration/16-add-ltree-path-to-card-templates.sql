-- =====================================================
-- Migration 16: Add LTREE Path to Card Templates
-- =====================================================
-- Add hierarchical path support for book section categorization
-- Requires: All previous migrations (especially 01-extensions-and-enums.sql for LTREE)

-- =====================================================
-- ADD LTREE PATH COLUMN TO CARD_TEMPLATES
-- =====================================================

-- Add the new path column for hierarchical categorization
-- Examples: 1.7.2.1 = Book 1, Section 7, Subsection 2, Item 1
ALTER TABLE card_templates 
ADD COLUMN path ltree NULL;

-- Add column comment for documentation
COMMENT ON COLUMN card_templates.path IS 'Hierarchical path for book sections (e.g., 1.7.2.1 = Book 1, Section 7, Subsection 2, Item 1)';

-- =====================================================
-- PERFORMANCE INDEXES FOR LTREE PATH
-- =====================================================

-- GiST index for efficient hierarchical queries (ancestor/descendant operations)
CREATE INDEX idx_card_templates_path_gist ON card_templates USING GIST (path);

-- B-tree index for exact path matches and sorting
CREATE INDEX idx_card_templates_path_btree ON card_templates USING BTREE (path);

-- Combined index for common query patterns (subject + path)
CREATE INDEX idx_card_templates_subject_path ON card_templates (subject_id, path);

-- =====================================================
-- HELPER FUNCTIONS FOR HIERARCHICAL OPERATIONS
-- =====================================================

-- Function to search cards by hierarchical path
CREATE OR REPLACE FUNCTION search_cards_by_path(
    search_path ltree,
    include_descendants BOOLEAN DEFAULT TRUE,
    limit_count INTEGER DEFAULT 50,
    user_id UUID DEFAULT NULL
)
RETURNS TABLE(
    id UUID,
    question TEXT,
    answer TEXT,
    path ltree,
    subject_id UUID,
    tags TEXT[],
    creator_id UUID,
    is_public BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ct.id,
        ct.question,
        ct.answer,
        ct.path,
        ct.subject_id,
        ct.tags,
        ct.creator_id,
        ct.is_public
    FROM card_templates ct
    WHERE 
        ct.flagged_for_review = FALSE
        AND ct.path IS NOT NULL
        AND (
            CASE 
                WHEN include_descendants THEN ct.path <@ search_path OR ct.path ~ (search_path::text || '.*')::lquery
                ELSE ct.path = search_path
            END
        )
        AND (
            ct.is_public = TRUE
            OR (user_id IS NOT NULL AND ct.creator_id = user_id)
        )
    ORDER BY ct.path, ct.created_at
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get cards at specific hierarchy depth
CREATE OR REPLACE FUNCTION get_cards_by_depth(
    target_depth INTEGER,
    limit_count INTEGER DEFAULT 50,
    user_id UUID DEFAULT NULL
)
RETURNS TABLE(
    id UUID,
    question TEXT,
    answer TEXT,
    path ltree,
    depth INTEGER,
    subject_id UUID
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ct.id,
        ct.question,
        ct.answer,
        ct.path,
        nlevel(ct.path) as depth,
        ct.subject_id
    FROM card_templates ct
    WHERE 
        ct.flagged_for_review = FALSE
        AND ct.path IS NOT NULL
        AND nlevel(ct.path) = target_depth
        AND (
            ct.is_public = TRUE
            OR (user_id IS NOT NULL AND ct.creator_id = user_id)
        )
    ORDER BY ct.path, ct.created_at
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to validate path format (numeric segments separated by dots)
CREATE OR REPLACE FUNCTION validate_book_path(input_path TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if path matches pattern: number.number.number.number (1-4 levels)
    -- Examples: 1, 1.7, 1.7.2, 1.7.2.1
    IF input_path ~ '^[0-9]+(\.[0-9]+){0,3}$' THEN
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to convert string path to ltree (with validation)
CREATE OR REPLACE FUNCTION convert_to_book_path(input_path TEXT)
RETURNS ltree AS $$
BEGIN
    -- Validate the path format first
    IF NOT validate_book_path(input_path) THEN
        RAISE EXCEPTION 'Invalid path format: %. Expected format: number.number.number.number (1-4 levels)', input_path;
    END IF;
    
    -- Convert to ltree (replace dots with underscores for ltree compatibility if needed)
    -- Note: ltree can handle numeric paths directly
    RETURN input_path::ltree;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get hierarchy summary for a path
CREATE OR REPLACE FUNCTION get_path_hierarchy_info(input_path ltree)
RETURNS TABLE(
    full_path ltree,
    depth INTEGER,
    book_number INTEGER,
    section_number INTEGER,
    subsection_number INTEGER,
    item_number INTEGER
) AS $$
DECLARE
    path_array TEXT[];
BEGIN
    -- Convert ltree to text array
    path_array := string_to_array(input_path::text, '.');
    
    RETURN QUERY
    SELECT 
        input_path as full_path,
        nlevel(input_path) as depth,
        CASE WHEN array_length(path_array, 1) >= 1 THEN path_array[1]::INTEGER ELSE NULL END as book_number,
        CASE WHEN array_length(path_array, 1) >= 2 THEN path_array[2]::INTEGER ELSE NULL END as section_number,
        CASE WHEN array_length(path_array, 1) >= 3 THEN path_array[3]::INTEGER ELSE NULL END as subsection_number,
        CASE WHEN array_length(path_array, 1) >= 4 THEN path_array[4]::INTEGER ELSE NULL END as item_number;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================
-- DATA CONSISTENCY FUNCTIONS
-- =====================================================

-- Function to migrate existing subsection data to path format
CREATE OR REPLACE FUNCTION migrate_subsection_to_path()
RETURNS INTEGER AS $$
DECLARE
    record_count INTEGER := 0;
    card_record RECORD;
BEGIN
    -- Update cards where subsection looks like a numeric path and path is null
    FOR card_record IN 
        SELECT id, subsection 
        FROM card_templates 
        WHERE subsection IS NOT NULL 
        AND path IS NULL 
        AND validate_book_path(subsection)
    LOOP
        UPDATE card_templates 
        SET path = convert_to_book_path(card_record.subsection)
        WHERE id = card_record.id;
        
        record_count := record_count + 1;
    END LOOP;
    
    RETURN record_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- ADDITIONAL INDEXES FOR COMMON QUERIES
-- =====================================================

-- Index for public unflagged cards with path (extending existing pattern)
CREATE INDEX idx_card_templates_public_path ON card_templates (is_public, flagged_for_review, path) 
WHERE is_public = TRUE AND flagged_for_review = FALSE AND path IS NOT NULL;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- LTREE path column added to card_templates with:
-- - Performance-optimized indexes
-- - Helper functions for hierarchical queries  
-- - Path validation and conversion utilities
-- - Migration function for existing data
-- 
-- Next steps:
-- 1. Run migrate_subsection_to_path() to populate existing data
-- 2. Update application code to use new path column
-- 3. Consider subjects strategy (2-level hierarchy recommended)