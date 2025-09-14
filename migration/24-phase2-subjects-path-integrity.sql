-- =====================================================
-- Migration 24: Phase 2 - Subjects & Path Integrity
-- =====================================================
-- Enforce card_templates.path -> subjects.path -> subject_id mapping
-- Part of v2 Changes implementation - Phase 2
--
-- This migration:
-- 1. Backfills missing paths with '88' for test cards
-- 2. Verifies path/subject_id consistency 
-- 3. Ensures all cards have valid path/subject relationships
-- 4. Maintains existing trigger functionality
-- =====================================================

-- Step 1: Backfill missing paths with '88' (links to test subject)
-- This affects ~225 cards that currently have subject_id but no path
UPDATE card_templates 
SET path = '88'::ltree
WHERE path IS NULL;

-- Step 2: Verify the test subject exists (should already exist)
-- If for some reason it doesn't exist, create it
INSERT INTO subjects (name, path, is_public, is_active, description)
SELECT 
  'Test Deck',
  '88'::ltree,
  true,
  true,
  'Default test subject for cards without specific hierarchical paths'
WHERE NOT EXISTS (
  SELECT 1 FROM subjects WHERE path = '88'::ltree
);

-- Step 3: Force trigger execution to ensure all cards have correct subject_id
-- This will auto-populate subject_id based on path using existing triggers
UPDATE card_templates 
SET updated_at = NOW()
WHERE path IS NOT NULL;

-- Step 4: Add a check constraint to ensure path/subject_id consistency
-- This constraint validates that subject_id matches a valid ancestor of the card path
ALTER TABLE card_templates 
ADD CONSTRAINT card_templates_path_subject_consistency
CHECK (
  -- Allow both path and subject_id to be null (legacy compatibility)
  (path IS NULL AND subject_id IS NULL) OR
  -- If path exists, subject_id must be populated and valid 
  (path IS NOT NULL AND subject_id IS NOT NULL AND
   EXISTS (
     SELECT 1 FROM subjects s 
     WHERE s.id = subject_id 
     AND (
       -- Exact match at 1-3 levels
       s.path = subpath(path, 0, LEAST(nlevel(path), 3)) OR
       s.path = subpath(path, 0, LEAST(nlevel(path), 2)) OR  
       s.path = subpath(path, 0, 1)
     )
   ))
);

-- Step 5: Create index to support the constraint efficiently
CREATE INDEX IF NOT EXISTS idx_card_templates_path_subject_lookup 
ON card_templates(subject_id, path) 
WHERE path IS NOT NULL AND subject_id IS NOT NULL;

-- Step 6: Audit report - identify any remaining inconsistencies
DO $$
DECLARE
  total_cards INTEGER;
  cards_with_path INTEGER; 
  cards_without_path INTEGER;
  inconsistent_cards INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_cards FROM card_templates;
  SELECT COUNT(*) INTO cards_with_path FROM card_templates WHERE path IS NOT NULL;
  SELECT COUNT(*) INTO cards_without_path FROM card_templates WHERE path IS NULL;
  
  -- Check for inconsistent path/subject_id relationships
  SELECT COUNT(*) INTO inconsistent_cards 
  FROM card_templates ct
  LEFT JOIN subjects s ON ct.subject_id = s.id
  WHERE ct.path IS NOT NULL 
    AND ct.subject_id IS NOT NULL
    AND s.path IS NOT NULL
    AND NOT (
      s.path = subpath(ct.path, 0, LEAST(nlevel(ct.path), 3)) OR
      s.path = subpath(ct.path, 0, LEAST(nlevel(ct.path), 2)) OR
      s.path = subpath(ct.path, 0, 1)
    );

  RAISE NOTICE '=== Phase 2 Migration Summary ===';
  RAISE NOTICE 'Total cards: %', total_cards;
  RAISE NOTICE 'Cards with path: %', cards_with_path; 
  RAISE NOTICE 'Cards without path: %', cards_without_path;
  RAISE NOTICE 'Inconsistent path/subject relationships: %', inconsistent_cards;
  
  IF inconsistent_cards > 0 THEN
    RAISE WARNING 'Found % cards with inconsistent path/subject_id relationships!', inconsistent_cards;
  ELSE
    RAISE NOTICE '✅ All path/subject_id relationships are consistent';
  END IF;
END $$;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Phase 2 complete: Path/subject_id integrity enforced
-- Next: Run Phase 3 for candidate surfaces (views and functions)