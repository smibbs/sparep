-- Migration 24: Remove unused columns from cards table
-- Removes columns that exist in schema but are not used in the current codebase
-- KEEP tags column as requested by user for future use

-- First, let's check what columns actually exist (for safety)
-- This migration removes: hint, explanation, image_url, audio_url, last_reviewed_at

-- Remove unused media and metadata columns
-- These columns were added for features that were never implemented in the frontend

-- Remove hint column (not used in any JavaScript files)
ALTER TABLE public.cards DROP COLUMN IF EXISTS hint;

-- Remove explanation column (not used in any JavaScript files)  
ALTER TABLE public.cards DROP COLUMN IF EXISTS explanation;

-- Remove image_url column (media support not implemented)
ALTER TABLE public.cards DROP COLUMN IF EXISTS image_url;

-- Remove audio_url column (media support not implemented)
ALTER TABLE public.cards DROP COLUMN IF EXISTS audio_url;

-- Remove last_reviewed_at column (duplicated by user_card_progress.last_review_date)
ALTER TABLE public.cards DROP COLUMN IF EXISTS last_reviewed_at;

-- Note: Keeping tags column as user requested for future use
-- Note: Keeping other metadata columns that are actually used:
--   - question, answer (core card content)
--   - subject_id, subsection (organization)
--   - is_public (access control)
--   - total_reviews, correct_reviews, incorrect_reviews (statistics)
--   - average_response_time_ms (analytics)
--   - flagged_* columns (flagging system)
--   - user_flag_count (user reporting)
--   - created_at, updated_at (audit trail)

-- Log the changes
INSERT INTO public.migration_log (migration_name, description, applied_at) 
VALUES (
    '24-remove-unused-cards-columns',
    'Removed unused columns: hint, explanation, image_url, audio_url, last_reviewed_at from cards table',
    NOW()
) ON CONFLICT (migration_name) DO NOTHING;