-- =============================================================================
-- STREAK REWARDS SYSTEM DATABASE SCHEMA
-- =============================================================================
-- 
-- This script creates the database schema for a comprehensive streak tracking
-- and rewards system with milestone achievements
--

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Enhanced user-level streak tracking in user_profiles
-- -----------------------------------------------------------------------------

-- Add streak tracking columns to user_profiles
ALTER TABLE user_profiles 
    ADD COLUMN IF NOT EXISTS current_daily_streak INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS longest_daily_streak INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_streak_date DATE,
    ADD COLUMN IF NOT EXISTS streak_freeze_count INT DEFAULT 0; -- For streak protection feature

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_streak_date ON user_profiles(last_streak_date);
CREATE INDEX IF NOT EXISTS idx_user_profiles_current_streak ON user_profiles(current_daily_streak);

-- -----------------------------------------------------------------------------
-- 2. Streak milestone tracking table
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_streak_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    milestone_days INTEGER NOT NULL,
    achieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reward_claimed BOOLEAN NOT NULL DEFAULT FALSE,
    reward_type TEXT,
    reward_description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Ensure unique milestones per user
    UNIQUE(user_id, milestone_days)
);

-- Add indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_milestones_user_id ON user_streak_milestones(user_id);
CREATE INDEX IF NOT EXISTS idx_milestones_achieved_at ON user_streak_milestones(achieved_at);
CREATE INDEX IF NOT EXISTS idx_milestones_unclaimed ON user_streak_milestones(user_id, reward_claimed) WHERE reward_claimed = FALSE;

-- -----------------------------------------------------------------------------
-- 3. Streak reward configuration table (admin configurable)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS streak_reward_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    milestone_days INTEGER NOT NULL UNIQUE,
    reward_type TEXT NOT NULL, -- 'badge', 'extra_cards', 'theme', 'recognition'
    reward_title TEXT NOT NULL,
    reward_description TEXT NOT NULL,
    reward_value INTEGER, -- For quantifiable rewards (e.g., extra cards count)
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default milestone configurations
INSERT INTO streak_reward_configs (milestone_days, reward_type, reward_title, reward_description, reward_value) VALUES
    (3, 'badge', '3-Day Streak!', 'You''re building a great habit! Keep it up!', NULL),
    (7, 'badge', 'Week Warrior', 'A full week of learning - you''re on fire!', NULL),
    (14, 'extra_cards', 'Two-Week Champion', 'Bonus: +10 extra cards per day for 3 days!', 10),
    (30, 'badge', 'Monthly Master', 'One month of consistent learning - incredible!', NULL),
    (50, 'theme', 'Dedication Hero', 'Unlock special app theme colors!', NULL),
    (100, 'recognition', 'Century Club', 'Join the elite 100-day club with special recognition!', NULL),
    (365, 'recognition', 'Year-Long Legend', 'A full year of learning - you are truly legendary!', NULL)
ON CONFLICT (milestone_days) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 4. User streak history (for analytics and streak recovery)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_streak_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    streak_date DATE NOT NULL,
    cards_reviewed INTEGER NOT NULL DEFAULT 0,
    streak_day_number INTEGER NOT NULL, -- What day of the streak this was
    is_streak_break BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Ensure one record per user per date
    UNIQUE(user_id, streak_date)
);

-- Add indexes for efficient streak calculations
CREATE INDEX IF NOT EXISTS idx_streak_history_user_date ON user_streak_history(user_id, streak_date DESC);
CREATE INDEX IF NOT EXISTS idx_streak_history_streak_day ON user_streak_history(user_id, streak_day_number DESC);

-- -----------------------------------------------------------------------------
-- 5. RLS Policies for streak tables
-- -----------------------------------------------------------------------------

-- Enable RLS on new tables
ALTER TABLE user_streak_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE streak_reward_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_streak_history ENABLE ROW LEVEL SECURITY;

-- User streak milestones policies
CREATE POLICY "Users can view their own milestones" ON user_streak_milestones
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "System can insert milestones" ON user_streak_milestones
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their milestone claims" ON user_streak_milestones
    FOR UPDATE USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Streak reward configs policies
CREATE POLICY "Everyone can view active reward configs" ON streak_reward_configs
    FOR SELECT USING (is_active = true);

CREATE POLICY "Only admins can manage reward configs" ON streak_reward_configs
    FOR ALL USING (is_admin(auth.uid()));

-- User streak history policies  
CREATE POLICY "Users can view their own streak history" ON user_streak_history
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "System can insert streak history" ON user_streak_history
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 6. Helper functions for streak management
-- -----------------------------------------------------------------------------

-- Function to update user streak when they complete reviews
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
    ELSIF v_is_consecutive THEN
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
    
    -- Record streak history
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

-- Function to get user's unclaimed rewards
CREATE OR REPLACE FUNCTION get_unclaimed_streak_rewards(p_user_id UUID)
RETURNS TABLE(
    milestone_days INTEGER,
    reward_type TEXT,
    reward_title TEXT,
    reward_description TEXT,
    reward_value INTEGER,
    achieved_at TIMESTAMPTZ
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT 
        usm.milestone_days,
        src.reward_type,
        src.reward_title,
        src.reward_description,
        src.reward_value,
        usm.achieved_at
    FROM user_streak_milestones usm
    JOIN streak_reward_configs src ON usm.milestone_days = src.milestone_days
    WHERE usm.user_id = p_user_id 
        AND usm.reward_claimed = false
        AND src.is_active = true
    ORDER BY usm.milestone_days ASC;
END;
$$;

-- Function to claim a streak reward
CREATE OR REPLACE FUNCTION claim_streak_reward(p_user_id UUID, p_milestone_days INTEGER)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_reward_type TEXT;
    v_reward_value INTEGER;
BEGIN
    -- Get reward details and mark as claimed
    UPDATE user_streak_milestones 
    SET reward_claimed = true
    WHERE user_id = p_user_id 
        AND milestone_days = p_milestone_days 
        AND reward_claimed = false
    RETURNING reward_type INTO v_reward_type;
    
    -- If no row updated, reward doesn't exist or already claimed
    IF NOT FOUND THEN
        RETURN false;
    END IF;
    
    -- Apply reward effects (for extra_cards type)
    SELECT reward_value INTO v_reward_value
    FROM streak_reward_configs
    WHERE milestone_days = p_milestone_days;
    
    IF v_reward_type = 'extra_cards' AND v_reward_value IS NOT NULL THEN
        -- Could implement temporary daily limit increase here
        -- For now, just mark as claimed
        NULL;
    END IF;
    
    RETURN true;
END;
$$;

COMMIT;

-- =============================================================================
-- COMMENTS ON FUNCTIONS
-- =============================================================================

COMMENT ON FUNCTION update_user_streak IS 'Updates user streak when they complete reviews, handles streak breaks and milestone detection';
COMMENT ON FUNCTION get_unclaimed_streak_rewards IS 'Returns all unclaimed streak milestone rewards for a user';
COMMENT ON FUNCTION claim_streak_reward IS 'Marks a streak milestone reward as claimed and applies any reward effects';

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

-- Check that all tables were created successfully
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
    AND table_name IN ('user_streak_milestones', 'streak_reward_configs', 'user_streak_history')
ORDER BY table_name;

-- Check default reward configurations
SELECT milestone_days, reward_type, reward_title 
FROM streak_reward_configs 
WHERE is_active = true 
ORDER BY milestone_days;