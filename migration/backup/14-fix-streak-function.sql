-- Migration: 14-fix-streak-function.sql
-- Description: Fix the update_user_streak function to handle null is_streak_break values
-- Dependencies: streak_rewards_schema.sql

-- Update the streak function to properly handle null values in is_streak_break
CREATE OR REPLACE FUNCTION update_user_streak(p_user_id UUID, p_review_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE(
    current_streak INTEGER,
    is_new_milestone BOOLEAN,
    milestone_days INTEGER
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_last_streak_date DATE;
    v_current_streak INTEGER;
    v_longest_streak INTEGER;
    v_yesterday DATE;
    v_is_consecutive BOOLEAN;
    v_cards_today INTEGER;
    v_new_milestone_days INTEGER[];
    v_milestone_day INTEGER;
BEGIN
    -- Get yesterday's date
    v_yesterday := p_review_date - INTERVAL '1 day';
    
    -- Get current user streak info
    SELECT last_streak_date, current_daily_streak, longest_daily_streak
    INTO v_last_streak_date, v_current_streak, v_longest_streak
    FROM user_profiles 
    WHERE id = p_user_id;
    
    -- Count reviews for today
    SELECT COUNT(*)::INTEGER INTO v_cards_today
    FROM review_history
    WHERE user_id = p_user_id 
        AND DATE(review_date) = p_review_date;
    
    -- Only proceed if user actually reviewed cards today
    IF v_cards_today = 0 THEN
        RETURN QUERY SELECT v_current_streak, false, 0;
        RETURN;
    END IF;
    
    -- Check if this is consecutive (yesterday or today was last streak date)
    v_is_consecutive := (v_last_streak_date = v_yesterday OR v_last_streak_date = p_review_date);
    
    -- Update streak based on consecutive status
    IF v_last_streak_date = p_review_date THEN
        -- Already recorded today, just return current values
        v_current_streak := v_current_streak;
    ELSIF COALESCE(v_is_consecutive, false) THEN
        -- Consecutive day - increment streak
        v_current_streak := COALESCE(v_current_streak, 0) + 1;
    ELSE
        -- Streak broken - reset to 1
        v_current_streak := 1;
    END IF;
    
    -- Update longest streak if current is longer
    v_longest_streak := GREATEST(COALESCE(v_longest_streak, 0), v_current_streak);
    
    -- Update user_profiles with new streak data
    UPDATE user_profiles 
    SET current_daily_streak = v_current_streak,
        longest_daily_streak = v_longest_streak,
        last_streak_date = p_review_date
    WHERE id = p_user_id;
    
    -- Record streak history (fix null handling for is_streak_break)
    INSERT INTO user_streak_history (user_id, streak_date, cards_reviewed, streak_day_number, is_streak_break)
    VALUES (p_user_id, p_review_date, v_cards_today, v_current_streak, NOT COALESCE(v_is_consecutive, false))
    ON CONFLICT (user_id, streak_date) DO UPDATE SET
        cards_reviewed = EXCLUDED.cards_reviewed,
        streak_day_number = EXCLUDED.streak_day_number,
        is_streak_break = EXCLUDED.is_streak_break;
    
    -- Check for new milestones
    SELECT ARRAY_AGG(src.milestone_days) INTO v_new_milestone_days
    FROM streak_reward_configs src
    WHERE src.milestone_days = v_current_streak
        AND src.is_active = true
        AND NOT EXISTS (
            SELECT 1 FROM user_streak_milestones usm
            WHERE usm.user_id = p_user_id 
                AND usm.milestone_days = src.milestone_days
        );
    
    -- Insert new milestone achievements
    IF v_new_milestone_days IS NOT NULL AND array_length(v_new_milestone_days, 1) > 0 THEN
        INSERT INTO user_streak_milestones (user_id, milestone_days, reward_type, reward_description)
        SELECT p_user_id, src.milestone_days, src.reward_type, src.reward_description
        FROM streak_reward_configs src
        WHERE src.milestone_days = ANY(v_new_milestone_days);
        
        v_milestone_day := v_new_milestone_days[1];
        
        RETURN QUERY SELECT v_current_streak, true, v_milestone_day;
    ELSE
        RETURN QUERY SELECT v_current_streak, false, 0;
    END IF;
END;
$$;

-- Add comment
COMMENT ON FUNCTION update_user_streak IS 'Updates user streak when they complete reviews, handles streak breaks and milestone detection. Fixed null handling for is_streak_break column.';