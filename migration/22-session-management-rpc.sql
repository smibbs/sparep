-- ============================================================================
-- SESSION MANAGEMENT RPC FUNCTIONS
-- ============================================================================
-- This migration adds RPC functions for server-side session management
-- with daily session limits based on user tiers
-- ============================================================================

-- Create session tracking table
CREATE TABLE IF NOT EXISTS public.user_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_type text NOT NULL DEFAULT 'general', -- 'general' or 'deck-specific'
    deck_id uuid REFERENCES public.decks(id) ON DELETE SET NULL,
    max_cards integer NOT NULL DEFAULT 10, -- Fixed 10 cards per session
    current_index integer NOT NULL DEFAULT 0,
    submitted_count integer NOT NULL DEFAULT 0,
    is_completed boolean NOT NULL DEFAULT false,
    cards_data jsonb NOT NULL DEFAULT '[]'::jsonb, -- Serialized cards for the session
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_created_at ON public.user_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_is_completed ON public.user_sessions(is_completed);

-- Add RLS policies
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own sessions
CREATE POLICY "Users can view own sessions" ON public.user_sessions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions" ON public.user_sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions" ON public.user_sessions
    FOR UPDATE USING (auth.uid() = user_id);

-- Function to get or create a user session with daily limits
CREATE OR REPLACE FUNCTION public.get_or_create_user_session(
    p_user_id uuid,
    p_deck_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_tier public.user_tier;
    v_sessions_today integer;
    v_max_sessions_per_day integer;
    v_session_id uuid;
    v_session_data jsonb;
    v_cards_data jsonb;
    v_is_new_session boolean := false;
    v_existing_session record;
BEGIN
    -- Get user tier to determine session limits
    SELECT user_tier INTO v_user_tier
    FROM public.profiles
    WHERE id = p_user_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'User profile not found'
        );
    END IF;
    
    -- Set session limits based on user tier
    CASE v_user_tier
        WHEN 'free' THEN v_max_sessions_per_day := 1;
        WHEN 'paid' THEN v_max_sessions_per_day := 999; -- Effectively unlimited
        WHEN 'admin' THEN v_max_sessions_per_day := 999; -- Effectively unlimited
        ELSE v_max_sessions_per_day := 1; -- Default to free limits
    END CASE;
    
    -- Check for existing incomplete session (preserving session continuity)
    SELECT * INTO v_existing_session
    FROM public.user_sessions
    WHERE user_id = p_user_id
      AND is_completed = false
      AND created_at::date = CURRENT_DATE
      AND (p_deck_id IS NULL OR deck_id = p_deck_id OR deck_id IS NULL)
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
            'is_new_session', false
        );
    END IF;
    
    -- Check daily session limit for new sessions
    SELECT COUNT(*) INTO v_sessions_today
    FROM public.user_sessions
    WHERE user_id = p_user_id
      AND created_at::date = CURRENT_DATE;
    
    -- For free users, enforce 1 session per day limit
    IF v_user_tier = 'free' AND v_sessions_today >= v_max_sessions_per_day THEN
        -- Get current stats for limit message
        DECLARE
            v_reviews_today integer;
            v_limit integer;
        BEGIN
            SELECT reviews_today INTO v_reviews_today
            FROM public.profiles
            WHERE id = p_user_id;
            
            v_limit := 10; -- 1 session = 10 cards
            
            RETURN jsonb_build_object(
                'success', false,
                'limit_reached', true,
                'tier', v_user_tier,
                'reviews_today', COALESCE(v_reviews_today, 0),
                'limit', v_limit,
                'message', 'Daily session limit reached. Come back tomorrow!'
            );
        END;
    END IF;
    
    -- Load cards for new session using existing adaptive system
    -- This calls the same card loading logic used by the client
    SELECT jsonb_agg(
        jsonb_build_object(
            'card_template_id', ct.id,
            'question', ct.question,
            'answer', ct.answer,
            'subject_name', s.name,
            'deck_name', d.name,
            'tags', ct.tags,
            'stability', COALESCE(uc.stability, 1.0),
            'difficulty', COALESCE(uc.difficulty, 5.0),
            'state', COALESCE(uc.state::text, 'new'),
            'total_reviews', COALESCE(uc.total_reviews, 0),
            'due_at', uc.due_at,
            'last_reviewed_at', uc.last_reviewed_at,
            'reps', COALESCE(uc.reps, 0),
            'lapses', COALESCE(uc.lapses, 0),
            'correct_reviews', COALESCE(uc.correct_reviews, 0),
            'incorrect_reviews', COALESCE(uc.incorrect_reviews, 0)
        )
    ) INTO v_cards_data
    FROM (
        -- Get up to 10 cards (prioritizing due cards, then new cards)
        (
            -- Due cards first
            SELECT ct.*, uc.*, s.name as subject_name, d.name as deck_name, 'due' as card_source
            FROM public.card_templates ct
            INNER JOIN public.subjects s ON ct.subject_id = s.id
            INNER JOIN public.decks d ON s.deck_id = d.id
            INNER JOIN public.user_cards uc ON ct.id = uc.card_template_id AND uc.user_id = p_user_id
            INNER JOIN public.user_deck_access uda ON d.id = uda.deck_id AND uda.user_id = p_user_id
            WHERE uc.state = 'review'
              AND uc.due_at <= NOW()
              AND (p_deck_id IS NULL OR d.id = p_deck_id)
            ORDER BY uc.due_at ASC
            LIMIT 7
        )
        UNION ALL
        (
            -- New cards to fill remaining slots
            SELECT ct.*, uc.*, s.name as subject_name, d.name as deck_name, 'new' as card_source
            FROM public.card_templates ct
            INNER JOIN public.subjects s ON ct.subject_id = s.id
            INNER JOIN public.decks d ON s.deck_id = d.id
            INNER JOIN public.user_cards uc ON ct.id = uc.card_template_id AND uc.user_id = p_user_id
            INNER JOIN public.user_deck_access uda ON d.id = uda.deck_id AND uda.user_id = p_user_id
            WHERE uc.state = 'new'
              AND (p_deck_id IS NULL OR d.id = p_deck_id)
            ORDER BY random()
            LIMIT 3
        )
        ORDER BY 
            CASE WHEN card_source = 'due' THEN 1 ELSE 2 END,
            random()
        LIMIT 10
    ) AS ct
    INNER JOIN public.subjects s ON ct.subject_id = s.id
    INNER JOIN public.decks d ON s.deck_id = d.id
    LEFT JOIN public.user_cards uc ON ct.id = uc.card_template_id AND uc.user_id = p_user_id;
    
    -- If no cards found, return error
    IF v_cards_data IS NULL OR jsonb_array_length(v_cards_data) = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'No cards available for session'
        );
    END IF;
    
    -- Create new session
    INSERT INTO public.user_sessions (
        user_id,
        session_type,
        deck_id,
        max_cards,
        cards_data
    )
    VALUES (
        p_user_id,
        CASE WHEN p_deck_id IS NOT NULL THEN 'deck-specific' ELSE 'general' END,
        p_deck_id,
        10, -- Fixed 10 cards per session
        v_cards_data
    )
    RETURNING id INTO v_session_id;
    
    v_is_new_session := true;
    
    -- Return session data
    RETURN jsonb_build_object(
        'success', true,
        'session_id', v_session_id,
        'cards_data', v_cards_data,
        'max_cards', 10,
        'current_index', 0,
        'submitted_count', 0,
        'session_type', CASE WHEN p_deck_id IS NOT NULL THEN 'deck-specific' ELSE 'general' END,
        'is_new_session', v_is_new_session
    );
END;
$$;

-- Function to submit card answer with session tracking
CREATE OR REPLACE FUNCTION public.submit_card_answer(
    p_session_id uuid,
    p_card_template_id uuid,
    p_rating integer,
    p_response_time integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session_record record;
    v_user_tier public.user_tier;
    v_reviews_today integer;
    v_daily_limit integer;
BEGIN
    -- Get session and validate ownership
    SELECT * INTO v_session_record
    FROM public.user_sessions
    WHERE id = p_session_id
      AND user_id = auth.uid()
      AND is_completed = false;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Session not found or already completed'
        );
    END IF;
    
    -- Get user tier and current review count
    SELECT user_tier, reviews_today INTO v_user_tier, v_reviews_today
    FROM public.profiles
    WHERE id = v_session_record.user_id;
    
    -- Set daily limits based on user tier
    CASE v_user_tier
        WHEN 'free' THEN v_daily_limit := 10;  -- 1 session = 10 cards
        WHEN 'paid' THEN v_daily_limit := 9999; -- Effectively unlimited
        WHEN 'admin' THEN v_daily_limit := 9999; -- Effectively unlimited
        ELSE v_daily_limit := 10; -- Default to free limits
    END CASE;
    
    -- Check daily limit (for free users)
    IF v_user_tier = 'free' AND v_reviews_today >= v_daily_limit THEN
        RETURN jsonb_build_object(
            'success', false,
            'limit_reached', true,
            'tier', v_user_tier,
            'reviews_today', v_reviews_today,
            'limit', v_daily_limit,
            'message', 'Daily review limit reached'
        );
    END IF;
    
    -- Submit review using existing increment_daily_reviews function
    PERFORM public.increment_daily_reviews(
        v_session_record.user_id,
        p_card_template_id,
        p_rating,
        p_response_time
    );
    
    -- Update session progress
    UPDATE public.user_sessions
    SET 
        submitted_count = submitted_count + 1,
        current_index = LEAST(current_index + 1, max_cards),
        is_completed = (submitted_count + 1 >= max_cards),
        updated_at = now()
    WHERE id = p_session_id;
    
    -- Get updated session state
    SELECT submitted_count, current_index INTO v_session_record.submitted_count, v_session_record.current_index
    FROM public.user_sessions
    WHERE id = p_session_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'submitted_count', v_session_record.submitted_count,
        'current_index', v_session_record.current_index
    );
END;
$$;

-- Create updated_at trigger for user_sessions
CREATE TRIGGER set_user_sessions_updated_at
    BEFORE UPDATE ON public.user_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.get_or_create_user_session(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_card_answer(uuid, uuid, integer, integer) TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_sessions TO authenticated;