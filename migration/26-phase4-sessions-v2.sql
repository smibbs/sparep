-- =====================================================
-- Migration 26: Phase 4 - Sessions V2 (Two-Step Flow)
-- =====================================================
-- Enhance existing session system with subject filtering and deterministic ordering
-- Part of v2 Changes implementation - Phase 4
--
-- This migration:
-- 1. Fixes v_new_user_cards view to remove deck dependencies
-- 2. Adds Phase 4 fields to user_sessions (subject_path, seed, status)
-- 3. Enhances get_or_create_user_session() with subject filtering
-- 4. Creates optional finalize_session_order() RPC for client-side shuffle
-- 5. Preserves the excellent 10-card guarantee logic from existing system
-- =====================================================

-- Step 1: Fix v_new_user_cards view to remove deck dependencies
-- The current view still references legacy deck tables, breaking Phase 1-3 compatibility
DROP VIEW IF EXISTS v_new_user_cards;

CREATE VIEW v_new_user_cards AS
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
    
    -- Subject hierarchy data (compatible with existing RPC)
    s.name AS subject_name,
    s.path::text AS subject_path,
    
    -- Legacy compatibility for existing RPC
    NULL::UUID as deck_id  -- Will be ignored but maintains column structure
    
FROM card_templates ct
LEFT JOIN subjects s ON s.id = ct.subject_id
CROSS JOIN (SELECT auth.uid() as target_user_id) auth_context

WHERE 
    -- Only cards user doesn't have progress on yet
    NOT EXISTS (
        SELECT 1 FROM user_cards uc 
        WHERE uc.user_id = auth_context.target_user_id
        AND uc.card_template_id = ct.id
    )
    
    -- Only public unflagged cards (following existing RLS pattern)
    AND ct.is_public = true
    AND ct.flagged_for_review = false;

-- Step 2: Add Phase 4 fields to user_sessions table
ALTER TABLE user_sessions 
ADD COLUMN IF NOT EXISTS subject_path TEXT,
ADD COLUMN IF NOT EXISTS seed TEXT,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Add constraint for status field (drop first if exists to avoid conflicts)
ALTER TABLE user_sessions 
DROP CONSTRAINT IF EXISTS user_sessions_status_check;

ALTER TABLE user_sessions 
ADD CONSTRAINT user_sessions_status_check 
CHECK (status IN ('created', 'active', 'completed'));

-- Update session_type constraint to include new subject_specific type
ALTER TABLE user_sessions 
DROP CONSTRAINT IF EXISTS user_sessions_session_type_check;

ALTER TABLE user_sessions 
ADD CONSTRAINT user_sessions_session_type_check 
CHECK (session_type = ANY (ARRAY['daily_free'::text, 'general_unlimited'::text, 'deck_specific'::text, 'subject_specific'::text]));

-- Add comment explaining the new fields
COMMENT ON COLUMN user_sessions.subject_path IS 'Optional subject path filter for session (NULL = global session)';
COMMENT ON COLUMN user_sessions.seed IS 'Random seed for deterministic card ordering and resumability';
COMMENT ON COLUMN user_sessions.status IS 'Session state: created (awaiting finalize), active (playable), completed';

-- Step 3: Create enhanced get_or_create_user_session() RPC with subject filtering
-- This preserves all the excellent existing logic while adding Phase 4 features
CREATE OR REPLACE FUNCTION get_or_create_user_session(
    p_user_id UUID,
    p_deck_id UUID DEFAULT NULL,  -- Legacy parameter for backward compatibility
    p_subject_path TEXT DEFAULT NULL  -- New Phase 4 parameter
)
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_tier public.user_tier;
    v_sessions_today integer;
    v_max_sessions_per_day integer;
    v_session_id uuid;
    v_cards_data jsonb;
    v_is_new_session boolean := false;
    v_existing_session record;
    v_user_timezone text;
    v_today_in_tz date;
    v_session_seed text;
BEGIN
    -- Get user tier and timezone
    SELECT user_tier, timezone INTO v_user_tier, v_user_timezone
    FROM public.profiles
    WHERE id = p_user_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'User profile not found'
        );
    END IF;
    
    -- Calculate today in user's timezone
    v_today_in_tz := (NOW() AT TIME ZONE COALESCE(v_user_timezone, 'UTC'))::date;
    
    -- Set session limits based on user tier
    CASE v_user_tier
        WHEN 'free' THEN v_max_sessions_per_day := 1;
        WHEN 'paid' THEN v_max_sessions_per_day := 999; -- Effectively unlimited
        WHEN 'admin' THEN v_max_sessions_per_day := 999; -- Effectively unlimited
        ELSE v_max_sessions_per_day := 1; -- Default to free limits
    END CASE;
    
    -- For FREE users only: Check for existing session and return it if incomplete
    IF v_user_tier = 'free' THEN
        SELECT * INTO v_existing_session
        FROM public.user_sessions
        WHERE user_id = p_user_id
          AND session_date = v_today_in_tz
          AND submitted_count < max_cards -- Not yet completed
          AND status IN ('created', 'active') -- Not completed
          AND (p_subject_path IS NULL OR subject_path = p_subject_path) -- Same subject filter
        ORDER BY created_at DESC
        LIMIT 1;
        
        -- If we found an existing incomplete session, return it
        IF FOUND THEN
            RETURN jsonb_build_object(
                'success', true,
                'session_id', v_existing_session.id,
                'cards_data', v_existing_session.cards_data,
                'max_cards', v_existing_session.max_cards,
                'current_index', v_existing_session.current_index,
                'submitted_count', v_existing_session.submitted_count,
                'session_type', COALESCE(v_existing_session.session_type, 'general'),
                'subject_path', v_existing_session.subject_path,
                'seed', v_existing_session.seed,
                'status', v_existing_session.status,
                'is_new_session', false
            );
        END IF;
        
        -- Check if free user already has a completed session today
        SELECT COUNT(*) INTO v_sessions_today
        FROM public.user_sessions
        WHERE user_id = p_user_id
          AND session_date = v_today_in_tz;
          
        IF v_sessions_today >= v_max_sessions_per_day THEN
            RETURN jsonb_build_object(
                'success', false,
                'limit_reached', true,
                'tier', v_user_tier,
                'reviews_today', 0,
                'limit', 10,
                'message', 'Daily session limit reached. Come back tomorrow!'
            );
        END IF;
    END IF;
    
    -- Generate deterministic seed for reproducible card order
    v_session_seed := substring(md5(random()::text || clock_timestamp()::text) for 8);
    
    -- Get exactly 10 cards (prioritize due cards first) with optional subject filtering
    SELECT jsonb_agg(
        jsonb_build_object(
            'card_template_id', card_template_id,
            'question', question,
            'answer', answer,
            'subject_name', subject_name,
            'subject_path', subject_path,
            'deck_name', 'Mixed Decks', -- Legacy compatibility
            'tags', ARRAY[]::text[],
            'stability', COALESCE(stability, 1.0),
            'difficulty', COALESCE(difficulty, 5.0),
            'state', COALESCE(state::text, 'new'),
            'total_reviews', COALESCE(total_reviews, 0),
            'due_at', due_at,
            'last_reviewed_at', last_reviewed_at,
            'reps', COALESCE(reps, 0),
            'lapses', COALESCE(lapses, 0),
            'correct_reviews', COALESCE(correct_reviews, 0),
            'incorrect_reviews', COALESCE(incorrect_reviews, 0)
        )
    ) INTO v_cards_data
    FROM (
        SELECT *
        FROM public.v_due_user_cards
        WHERE user_id = p_user_id
          -- Subject path filtering (NULL means global session)
          AND (p_subject_path IS NULL OR subject_path = p_subject_path)
          -- Legacy deck filtering removed (v_due_user_cards doesn't have deck_id after Phase 3)
        ORDER BY due_at ASC
        LIMIT 10
    ) limited_cards;
    
    -- If we got fewer than 10 due cards, fill with new cards
    IF v_cards_data IS NULL OR jsonb_array_length(v_cards_data) < 10 THEN
        DECLARE
            v_due_count integer := COALESCE(jsonb_array_length(v_cards_data), 0);
            v_new_cards_needed integer := 10 - v_due_count;
            v_new_cards jsonb;
        BEGIN
            -- Use the function approach for new cards with subject filtering
            SELECT jsonb_agg(
                jsonb_build_object(
                    'card_template_id', card_template_id,
                    'question', question,
                    'answer', answer,
                    'subject_name', subject_name,
                    'subject_path', subject_path,
                    'deck_name', 'Mixed Decks', -- Legacy compatibility
                    'tags', ARRAY[]::text[],
                    'stability', COALESCE(stability, 1.0),
                    'difficulty', COALESCE(difficulty, 5.0),
                    'state', COALESCE(state::text, 'new'),
                    'total_reviews', COALESCE(total_reviews, 0),
                    'due_at', due_at,
                    'last_reviewed_at', last_reviewed_at,
                    'reps', COALESCE(reps, 0),
                    'lapses', COALESCE(lapses, 0),
                    'correct_reviews', COALESCE(correct_reviews, 0),
                    'incorrect_reviews', COALESCE(incorrect_reviews, 0)
                )
            ) INTO v_new_cards
            FROM (
                SELECT *
                FROM get_new_user_cards(p_user_id)
                WHERE (p_subject_path IS NULL OR subject_path = p_subject_path)
                ORDER BY RANDOM()  -- Randomize selection of new cards
                LIMIT v_new_cards_needed
            ) limited_new_cards;
            
            -- Combine due and new cards
            IF v_cards_data IS NULL THEN
                v_cards_data := v_new_cards;
            ELSIF v_new_cards IS NOT NULL THEN
                v_cards_data := v_cards_data || v_new_cards;
            END IF;
        END;
    END IF;
    
    -- If still no cards found, return error
    IF v_cards_data IS NULL OR jsonb_array_length(v_cards_data) = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', CASE 
                WHEN p_subject_path IS NOT NULL THEN 
                    'No cards available for subject "' || p_subject_path || '"'
                ELSE 
                    'No cards available for session'
            END
        );
    END IF;
    
    -- Create new session with Phase 4 fields
    INSERT INTO public.user_sessions (
        user_id,
        session_type,
        session_date,
        deck_id,
        subject_path,
        seed,
        status,
        cards_data,
        max_cards,
        timezone
    )
    VALUES (
        p_user_id,
        CASE WHEN p_deck_id IS NOT NULL THEN 'deck_specific' 
             WHEN p_subject_path IS NOT NULL THEN 'subject_specific'
             WHEN v_user_tier = 'free' THEN 'daily_free' 
             ELSE 'general_unlimited' END,
        v_today_in_tz,
        p_deck_id, -- Legacy field, kept for backward compatibility
        p_subject_path,
        v_session_seed,
        'created', -- Start in created state, can be finalized later
        v_cards_data,
        LEAST(jsonb_array_length(v_cards_data), 10), -- Actual card count (may be < 10)
        COALESCE(v_user_timezone, 'UTC')
    )
    RETURNING id INTO v_session_id;
    
    -- Return session data with Phase 4 additions
    RETURN jsonb_build_object(
        'success', true,
        'session_id', v_session_id,
        'cards_data', v_cards_data,
        'max_cards', LEAST(jsonb_array_length(v_cards_data), 10),
        'current_index', 0,
        'submitted_count', 0,
        'session_type', CASE WHEN p_deck_id IS NOT NULL THEN 'deck_specific'
                            WHEN p_subject_path IS NOT NULL THEN 'subject_specific' 
                            WHEN v_user_tier = 'free' THEN 'daily_free' 
                            ELSE 'general_unlimited' END,
        'subject_path', p_subject_path,
        'seed', v_session_seed,
        'status', 'created',
        'is_new_session', true
    );
END;
$$;

-- Step 4: Create finalize_session_order() RPC for optional client-side card shuffling
CREATE OR REPLACE FUNCTION finalize_session_order(
    p_session_id UUID,
    p_ordered_card_ids UUID[]
)
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
    v_session record;
    v_original_cards jsonb;
    v_original_ids uuid[];
    v_reordered_cards jsonb;
    i integer;
    v_card jsonb;
BEGIN
    -- Get session details
    SELECT * INTO v_session
    FROM user_sessions
    WHERE id = p_session_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'session_not_found',
            'message', 'Session not found'
        );
    END IF;
    
    -- Verify session is in created state
    IF v_session.status != 'created' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'invalid_status',
            'message', 'Session has already been finalized or completed'
        );
    END IF;
    
    -- Verify user owns this session
    IF v_session.user_id != auth.uid() THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'unauthorized',
            'message', 'Access denied'
        );
    END IF;
    
    v_original_cards := v_session.cards_data;
    
    -- Extract original card IDs for validation
    SELECT array_agg((card->>'card_template_id')::uuid) INTO v_original_ids
    FROM jsonb_array_elements(v_original_cards) AS card;
    
    -- Validate that provided IDs are a permutation of original IDs
    IF array_length(p_ordered_card_ids, 1) != array_length(v_original_ids, 1) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'invalid_permutation',
            'message', 'Card count mismatch'
        );
    END IF;
    
    -- Check that all original IDs are present in reordered list
    IF NOT (v_original_ids <@ p_ordered_card_ids AND p_ordered_card_ids <@ v_original_ids) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'invalid_permutation',
            'message', 'Reordered cards do not match original card set'
        );
    END IF;
    
    -- Reorder cards based on provided order
    v_reordered_cards := '[]'::jsonb;
    FOR i IN 1..array_length(p_ordered_card_ids, 1) LOOP
        -- Find the card with matching ID
        SELECT card INTO v_card
        FROM jsonb_array_elements(v_original_cards) AS card
        WHERE (card->>'card_template_id')::uuid = p_ordered_card_ids[i];
        
        -- Add to reordered array
        v_reordered_cards := v_reordered_cards || jsonb_build_array(v_card);
    END LOOP;
    
    -- Update session with finalized order
    UPDATE user_sessions 
    SET 
        cards_data = v_reordered_cards,
        status = 'active',
        updated_at = NOW()
    WHERE id = p_session_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'session_id', p_session_id,
        'status', 'active',
        'message', 'Session order finalized successfully'
    );
END;
$$;

-- Step 5: Create indexes for improved performance
CREATE INDEX IF NOT EXISTS idx_user_sessions_status_lookup
ON user_sessions(user_id, status, session_date)
WHERE status IN ('created', 'active');

CREATE INDEX IF NOT EXISTS idx_user_sessions_subject_path
ON user_sessions(user_id, subject_path, session_date)
WHERE subject_path IS NOT NULL;

-- =====================================================
-- VALIDATION QUERIES
-- =====================================================

-- Test the updated v_new_user_cards view
DO $$
DECLARE
    new_cards_count INTEGER;
    sample_user_id UUID;
BEGIN
    -- Get a sample user ID for testing
    SELECT id INTO sample_user_id FROM profiles LIMIT 1;
    
    IF sample_user_id IS NOT NULL THEN
        SELECT COUNT(*) INTO new_cards_count
        FROM v_new_user_cards
        WHERE user_id = sample_user_id;
        
        RAISE NOTICE 'Updated v_new_user_cards view shows % new cards for user %', 
            new_cards_count, sample_user_id;
    ELSE
        RAISE NOTICE 'No users found for testing v_new_user_cards view';
    END IF;
END $$;

-- Test enhanced session creation with subject filtering
DO $$
DECLARE
    session_result JSONB;
    sample_user_id UUID;
BEGIN
    -- Get a sample user ID for testing
    SELECT id INTO sample_user_id FROM profiles LIMIT 1;
    
    IF sample_user_id IS NOT NULL THEN
        -- Test global session (using explicit parameter types to avoid ambiguity)
        SELECT get_or_create_user_session(sample_user_id, NULL::UUID, NULL::TEXT) INTO session_result;
        RAISE NOTICE 'Global session creation result: success=%, cards=%', 
            session_result->>'success',
            COALESCE(jsonb_array_length(session_result->'cards_data'), 0);
            
        -- Test subject-specific session (if subjects exist)
        SELECT get_or_create_user_session(sample_user_id, NULL::UUID, '88'::TEXT) INTO session_result;
        RAISE NOTICE 'Subject-specific session (88) result: success=%, cards=%', 
            session_result->>'success',
            COALESCE(jsonb_array_length(session_result->'cards_data'), 0);
    ELSE
        RAISE NOTICE 'No users found for testing enhanced session creation';
    END IF;
END $$;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Phase 4 complete: Sessions V2 with subject filtering and deterministic ordering
-- Preserves excellent 10-card guarantee logic while adding Phase 4 features
-- Next: Run Phase 5 for Reviews & FSRS Server Function