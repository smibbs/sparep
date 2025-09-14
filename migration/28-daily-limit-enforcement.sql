-- ============================================================================
-- Migration 28: Daily Review Limit Enforcement
-- ============================================================================
-- Adds daily review limit checks to the record_review RPC function to prevent
-- free users from circumventing the 10-card daily limit through page refreshes
-- ============================================================================

-- Enhanced record_review function with daily limit enforcement
CREATE OR REPLACE FUNCTION record_review(
    p_session_id UUID,
    p_card_template_id UUID,
    p_rating INTEGER,
    p_response_time_ms INTEGER
)
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id UUID;
    v_session_record RECORD;
    v_card_in_session BOOLEAN;
    v_current_card RECORD;
    v_fsrs_config RECORD;
    v_review_id UUID;
    v_elapsed_days DECIMAL;
    v_scheduled_days DECIMAL;
    v_new_stability DECIMAL;
    v_new_difficulty DECIMAL;
    v_new_due_at TIMESTAMPTZ;
    v_new_state card_state;
    v_new_reps INTEGER;
    v_new_lapses INTEGER;
    v_current_index INTEGER;
    -- Daily limit check variables
    v_user_tier public.user_tier;
    v_reviews_today INTEGER;
    v_daily_limit INTEGER;
    v_last_review_date DATE;
BEGIN
    -- Get session details and validate ownership
    SELECT 
        s.user_id, 
        s.status, 
        s.cards_data, 
        s.current_index,
        s.submitted_count,
        s.max_cards
    INTO v_session_record
    FROM user_sessions s
    WHERE s.id = p_session_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'session_not_found',
            'message', 'Session not found'
        );
    END IF;
    
    -- Verify user owns this session
    IF v_session_record.user_id != auth.uid() THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'unauthorized',
            'message', 'Access denied'
        );
    END IF;
    
    -- Verify session is active
    IF v_session_record.status != 'active' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'invalid_session_status',
            'message', 'Session is not active'
        );
    END IF;
    
    v_user_id := v_session_record.user_id;
    
    -- Daily limit enforcement: Check before recording review
    SELECT user_tier, reviews_today, last_review_date 
    INTO v_user_tier, v_reviews_today, v_last_review_date
    FROM public.profiles
    WHERE id = v_user_id;
    
    -- Only enforce limits for free users
    IF v_user_tier = 'free' THEN
        -- Check if it's still the same day
        IF v_last_review_date = CURRENT_DATE THEN
            v_daily_limit := 10; -- Free user daily limit
            
            -- Check if user has reached daily limit
            IF v_reviews_today >= v_daily_limit THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'daily_limit_reached',
                    'message', 'Daily review limit reached',
                    'limit_info', jsonb_build_object(
                        'tier', v_user_tier,
                        'reviews_today', v_reviews_today,
                        'limit', v_daily_limit
                    )
                );
            END IF;
        ELSE
            -- Reset count for new day (this will be updated below anyway)
            v_reviews_today := 0;
        END IF;
    END IF;
    
    -- Verify card exists in session cards_data
    SELECT EXISTS(
        SELECT 1 
        FROM jsonb_array_elements(v_session_record.cards_data) AS card
        WHERE (card->>'card_template_id')::uuid = p_card_template_id
    ) INTO v_card_in_session;
    
    IF NOT v_card_in_session THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'card_not_in_session',
            'message', 'Card is not part of this session'
        );
    END IF;
    
    -- Check for existing review (idempotency)
    IF EXISTS(
        SELECT 1 FROM reviews 
        WHERE session_id = p_session_id 
        AND card_template_id = p_card_template_id
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'review_already_exists',
            'message', 'Review already recorded for this card in this session'
        );
    END IF;
    
    -- Get current card state (or create new user_card if doesn't exist)
    SELECT * INTO v_current_card
    FROM user_cards
    WHERE user_id = v_user_id 
    AND card_template_id = p_card_template_id
    FOR UPDATE; -- Lock for concurrent access protection
    
    -- If card doesn't exist in user_cards, create it with defaults
    IF NOT FOUND THEN
        INSERT INTO user_cards (
            user_id,
            card_template_id,
            deck_id, -- Legacy field, set to NULL
            state,
            stability,
            difficulty,
            due_at,
            last_reviewed_at,
            elapsed_days,
            scheduled_days,
            reps,
            lapses,
            total_reviews,
            correct_reviews,
            incorrect_reviews
        ) VALUES (
            v_user_id,
            p_card_template_id,
            NULL, -- No deck association in Phase 5
            'new',
            1.0,
            5.0,
            NULL,
            NULL,
            0.0,
            0.0,
            0,
            0,
            0,
            0,
            0
        );
        
        -- Fetch the newly created card
        SELECT * INTO v_current_card
        FROM user_cards
        WHERE user_id = v_user_id 
        AND card_template_id = p_card_template_id;
    END IF;
    
    -- Get FSRS configuration for the user
    SELECT * INTO v_fsrs_config
    FROM get_fsrs_config(v_user_id)
    LIMIT 1;
    
    -- Calculate elapsed and scheduled days
    IF v_current_card.last_reviewed_at IS NOT NULL THEN
        v_elapsed_days := EXTRACT(EPOCH FROM (NOW() - v_current_card.last_reviewed_at)) / 86400.0;
    ELSE
        v_elapsed_days := 0;
    END IF;
    
    IF v_current_card.due_at IS NOT NULL AND v_current_card.last_reviewed_at IS NOT NULL THEN
        v_scheduled_days := EXTRACT(EPOCH FROM (v_current_card.due_at - v_current_card.last_reviewed_at)) / 86400.0;
    ELSE
        v_scheduled_days := 0;
    END IF;
    
    -- Simple FSRS calculation (this would be more complex in a full implementation)
    -- For now, implementing a basic algorithm based on rating
    CASE p_rating
        WHEN 0 THEN -- Again
            v_new_stability := GREATEST(v_current_card.stability * 0.8, 1.0);
            v_new_difficulty := LEAST(v_current_card.difficulty + 1.0, 10.0);
            v_new_state := CASE 
                WHEN v_current_card.state = 'new' THEN 'learning'::card_state
                ELSE 'relearning'::card_state
            END;
            v_new_due_at := NOW() + (v_fsrs_config.learning_steps_minutes[1] || ' minutes')::INTERVAL;
            v_new_lapses := v_current_card.lapses + 1;
            v_new_reps := v_current_card.reps + 1;
            
        WHEN 1 THEN -- Hard
            v_new_stability := v_current_card.stability * 1.1;
            v_new_difficulty := GREATEST(v_current_card.difficulty - 0.1, 1.0);
            v_new_state := 'review'::card_state;
            v_new_due_at := NOW() + (v_new_stability || ' days')::INTERVAL;
            v_new_lapses := v_current_card.lapses;
            v_new_reps := v_current_card.reps + 1;
            
        WHEN 2 THEN -- Good
            v_new_stability := v_current_card.stability * 1.3;
            v_new_difficulty := v_current_card.difficulty;
            v_new_state := 'review'::card_state;
            v_new_due_at := NOW() + (v_new_stability || ' days')::INTERVAL;
            v_new_lapses := v_current_card.lapses;
            v_new_reps := v_current_card.reps + 1;
            
        WHEN 3 THEN -- Easy
            v_new_stability := v_current_card.stability * 1.6;
            v_new_difficulty := GREATEST(v_current_card.difficulty - 0.2, 1.0);
            v_new_state := 'review'::card_state;
            v_new_due_at := NOW() + (v_new_stability || ' days')::INTERVAL;
            v_new_lapses := v_current_card.lapses;
            v_new_reps := v_current_card.reps + 1;
            
        ELSE
            RAISE EXCEPTION 'Invalid rating: %', p_rating;
    END CASE;
    
    -- Ensure due date doesn't exceed maximum interval
    IF v_new_due_at > NOW() + (v_fsrs_config.maximum_interval_days || ' days')::INTERVAL THEN
        v_new_due_at := NOW() + (v_fsrs_config.maximum_interval_days || ' days')::INTERVAL;
    END IF;
    
    -- Record the review in the reviews table
    INSERT INTO reviews (
        session_id,
        user_id,
        card_template_id,
        deck_id, -- Legacy field, set to NULL
        rating,
        response_time_ms,
        state_before,
        stability_before,
        difficulty_before,
        due_at_before,
        state_after,
        stability_after,
        difficulty_after,
        due_at_after,
        elapsed_days,
        scheduled_days,
        reps_before,
        lapses_before
    ) VALUES (
        p_session_id,
        v_user_id,
        p_card_template_id,
        NULL, -- No deck in Phase 5
        p_rating,
        p_response_time_ms,
        v_current_card.state,
        v_current_card.stability,
        v_current_card.difficulty,
        v_current_card.due_at,
        v_new_state,
        v_new_stability,
        v_new_difficulty,
        v_new_due_at,
        v_elapsed_days,
        v_scheduled_days,
        v_current_card.reps,
        v_current_card.lapses
    )
    RETURNING id INTO v_review_id;
    
    -- Update the user_card with new FSRS state
    UPDATE user_cards
    SET 
        state = v_new_state,
        stability = v_new_stability,
        difficulty = v_new_difficulty,
        due_at = v_new_due_at,
        last_reviewed_at = NOW(),
        elapsed_days = v_elapsed_days,
        scheduled_days = v_scheduled_days,
        reps = v_new_reps,
        lapses = v_new_lapses,
        last_rating = p_rating,
        total_reviews = total_reviews + 1,
        correct_reviews = correct_reviews + CASE WHEN p_rating >= 2 THEN 1 ELSE 0 END,
        incorrect_reviews = incorrect_reviews + CASE WHEN p_rating < 2 THEN 1 ELSE 0 END,
        average_response_time_ms = CASE 
            WHEN average_response_time_ms IS NULL THEN p_response_time_ms
            ELSE (average_response_time_ms * total_reviews + p_response_time_ms) / (total_reviews + 1)
        END,
        updated_at = NOW()
    WHERE user_id = v_user_id 
    AND card_template_id = p_card_template_id;
    
    -- Update session progress
    UPDATE user_sessions
    SET 
        submitted_count = submitted_count + 1,
        current_index = CASE 
            WHEN current_index < max_cards - 1 THEN current_index + 1
            ELSE current_index 
        END,
        status = CASE 
            WHEN submitted_count + 1 >= max_cards THEN 'completed'
            ELSE status
        END,
        updated_at = NOW()
    WHERE id = p_session_id;
    
    -- Update user streak (call existing function)
    PERFORM update_user_streak(v_user_id, 1);
    
    -- Update profile reviews_today counter (with proper date handling)
    UPDATE profiles
    SET 
        reviews_today = CASE 
            WHEN last_review_date = CURRENT_DATE THEN reviews_today + 1
            ELSE 1  -- Reset to 1 for new day
        END,
        last_review_date = CURRENT_DATE,
        updated_at = NOW()
    WHERE id = v_user_id;
    
    -- Return success response
    RETURN jsonb_build_object(
        'success', true,
        'review_id', v_review_id,
        'session_id', p_session_id,
        'new_state', v_new_state,
        'new_due_at', v_new_due_at,
        'session_progress', jsonb_build_object(
            'submitted_count', v_session_record.submitted_count + 1,
            'max_cards', v_session_record.max_cards,
            'completed', (v_session_record.submitted_count + 1) >= v_session_record.max_cards
        ),
        'message', 'Review recorded successfully'
    );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION record_review(UUID, UUID, INTEGER, INTEGER) TO authenticated;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Daily review limit enforcement added to record_review RPC
-- Free users are now blocked from exceeding 10 reviews per day at the server level
-- This prevents circumvention through page refreshes or multiple sessions