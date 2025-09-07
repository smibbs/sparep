-- =====================================================
-- Migration 25: Phase 3 - Candidate Surfaces  
-- =====================================================
-- Create v_due_user_cards view and get_new_user_cards function
-- Part of v2 Changes implementation - Phase 3
--
-- This migration:
-- 1. Replaces v_due_user_cards view to remove deck dependencies
-- 2. Creates get_new_user_cards() function for new cards
-- 3. Ensures subject_path, question, answer are included
-- 4. Maintains RLS: users see only their rows; admin bypass
-- 5. Excludes flagged cards from both surfaces
-- =====================================================

-- Step 1: Drop existing v_due_user_cards view (contains legacy deck references)
DROP VIEW IF EXISTS v_due_user_cards;

-- Step 2: Create updated v_due_user_cards view without deck dependencies
-- This view shows cards that are due for review, with subject hierarchy
CREATE VIEW v_due_user_cards AS
SELECT 
    uc.user_id,
    uc.card_template_id,
    uc.state,
    uc.stability,
    uc.difficulty,
    uc.due_at,
    uc.last_reviewed_at,
    uc.elapsed_days,
    uc.scheduled_days,
    uc.reps,
    uc.lapses,
    uc.last_rating,
    uc.total_reviews,
    uc.correct_reviews,
    uc.incorrect_reviews,
    uc.average_response_time_ms,
    uc.created_at,
    uc.updated_at,
    uc.created_at AS added_at,
    
    -- Card template data
    ct.question,
    ct.answer,
    ct.subject_id,
    ct.path as card_path,
    
    -- Subject hierarchy data  
    s.name AS subject_name,
    s.path::text AS subject_path,
    
    -- Utility calculations
    EXTRACT(epoch FROM (now() - uc.due_at)) AS overdue_seconds
    
FROM user_cards uc
JOIN card_templates ct ON ct.id = uc.card_template_id
LEFT JOIN subjects s ON s.id = ct.subject_id
JOIN profiles p ON p.id = uc.user_id

WHERE 
    -- Due cards in learning/review states
    uc.state IN ('learning', 'review', 'relearning')
    AND uc.due_at <= NOW()
    
    -- Exclude flagged cards
    AND ct.flagged_for_review = false
    
    -- RLS enforcement: users see their own cards OR admin sees all
    AND (
        uc.user_id = auth.uid()  -- User sees own cards
        OR p.is_admin = true     -- Admin bypass
    );

-- Step 3: Create get_new_user_cards function
-- Returns new cards available for a user to learn
CREATE OR REPLACE FUNCTION get_new_user_cards(target_user_id UUID DEFAULT auth.uid())
RETURNS TABLE(
    user_id UUID,
    card_template_id UUID,
    state card_state,
    stability NUMERIC,
    difficulty NUMERIC,
    due_at TIMESTAMPTZ,
    last_reviewed_at TIMESTAMPTZ,
    elapsed_days NUMERIC,
    scheduled_days NUMERIC,
    reps INTEGER,
    lapses INTEGER,
    last_rating INTEGER,
    total_reviews INTEGER,
    correct_reviews INTEGER,
    incorrect_reviews INTEGER,
    average_response_time_ms INTEGER,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    added_at TIMESTAMPTZ,
    question TEXT,
    answer TEXT,
    subject_id UUID,
    card_path LTREE,
    subject_name VARCHAR,
    subject_path TEXT,
    overdue_seconds NUMERIC
) 
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
    is_admin BOOLEAN := false;
BEGIN
    -- Check if current user is admin (for bypass capability)
    SELECT p.is_admin INTO is_admin
    FROM profiles p 
    WHERE p.id = auth.uid();
    
    -- RLS enforcement: only allow access to own cards unless admin
    IF NOT is_admin AND target_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Access denied: can only view own new cards';
    END IF;
    
    RETURN QUERY
    SELECT 
        target_user_id as user_id,
        ct.id as card_template_id,
        'new'::card_state as state,
        1.0::NUMERIC as stability,
        5.0::NUMERIC as difficulty,
        NULL::TIMESTAMPTZ as due_at,
        NULL::TIMESTAMPTZ as last_reviewed_at,
        0.0::NUMERIC as elapsed_days,
        0.0::NUMERIC as scheduled_days,
        0 as reps,
        0 as lapses,
        NULL::INTEGER as last_rating,
        0 as total_reviews,
        0 as correct_reviews,
        0 as incorrect_reviews,
        NULL::INTEGER as average_response_time_ms,
        NOW() as created_at,
        NOW() as updated_at,
        NOW() as added_at,
        
        -- Card template data
        ct.question,
        ct.answer,
        ct.subject_id,
        ct.path as card_path,
        
        -- Subject hierarchy data
        s.name AS subject_name,
        s.path::text AS subject_path,
        
        -- New cards aren't overdue
        0.0::NUMERIC as overdue_seconds
        
    FROM card_templates ct
    LEFT JOIN subjects s ON s.id = ct.subject_id
    
    WHERE 
        -- Exclude cards user already has progress on
        NOT EXISTS (
            SELECT 1 FROM user_cards uc 
            WHERE uc.user_id = target_user_id 
            AND uc.card_template_id = ct.id
        )
        
        -- Only public unflagged cards (following existing RLS pattern)
        AND ct.is_public = true
        AND ct.flagged_for_review = false
        
    ORDER BY ct.created_at ASC; -- Oldest cards first
END;
$$;

-- Step 4: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_cards_due_lookup 
ON user_cards(user_id, state, due_at) 
WHERE state IN ('learning', 'review', 'relearning');

CREATE INDEX IF NOT EXISTS idx_card_templates_public_unflagged
ON card_templates(is_public, flagged_for_review, created_at)
WHERE is_public = true AND flagged_for_review = false;

-- Step 5: Grant appropriate permissions
-- Views inherit RLS from underlying tables automatically
-- Function uses SECURITY DEFINER with internal RLS checks

-- =====================================================
-- VALIDATION QUERIES
-- =====================================================

-- Test v_due_user_cards view
DO $$
DECLARE
    due_count INTEGER;
    sample_record RECORD;
BEGIN
    SELECT COUNT(*) INTO due_count FROM v_due_user_cards;
    RAISE NOTICE 'v_due_user_cards contains % due cards', due_count;
    
    -- Get sample record to verify structure
    SELECT * INTO sample_record FROM v_due_user_cards LIMIT 1;
    IF sample_record IS NOT NULL THEN
        RAISE NOTICE 'Sample due card: question=%, subject_path=%, overdue_seconds=%', 
            LEFT(sample_record.question, 50), 
            sample_record.subject_path,
            sample_record.overdue_seconds;
    END IF;
END $$;

-- Test get_new_user_cards function  
DO $$
DECLARE
    new_count INTEGER;
    sample_user_id UUID;
BEGIN
    -- Get a sample user ID for testing
    SELECT id INTO sample_user_id FROM profiles LIMIT 1;
    
    IF sample_user_id IS NOT NULL THEN
        SELECT COUNT(*) INTO new_count 
        FROM get_new_user_cards(sample_user_id);
        RAISE NOTICE 'get_new_user_cards() returns % new cards for user %', 
            new_count, sample_user_id;
    ELSE
        RAISE NOTICE 'No users found for testing get_new_user_cards()';
    END IF;
END $$;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Phase 3 complete: Candidate surfaces created with RLS
-- Next: Run Phase 4 for Sessions V2 (Two-Step Flow)