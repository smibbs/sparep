-- =====================================================
-- Migration 08: User Flags and Streaks Systems
-- =====================================================
-- User flagging system and streak tracking functionality
-- Requires: 01-extensions-and-enums.sql through 07-fsrs-params.sql

-- =====================================================
-- USER CARD FLAGS TABLE
-- =====================================================

CREATE TABLE user_card_flags (
    -- Core identity
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Flag context
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    card_template_id UUID NOT NULL REFERENCES card_templates(id) ON DELETE CASCADE,
    
    -- Flag details
    reason flag_reason NOT NULL,
    comment TEXT, -- Optional user explanation
    
    -- Flag lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    resolution_action TEXT, -- 'dismissed', 'card_updated', 'card_removed'
    resolution_comment TEXT,
    
    -- Constraints
    CONSTRAINT user_card_flags_comment_not_empty CHECK (comment IS NULL OR length(trim(comment)) > 0),
    CONSTRAINT user_card_flags_resolution_action_check CHECK (
        resolution_action IS NULL OR 
        resolution_action IN ('dismissed', 'card_updated', 'card_removed')
    )
);

-- Enable Row Level Security
ALTER TABLE user_card_flags ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_card_flags
CREATE POLICY "Users can view their own flags" ON user_card_flags
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create flags" ON user_card_flags
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own unresolved flags" ON user_card_flags
    FOR UPDATE USING (
        auth.uid() = user_id 
        AND resolved_at IS NULL
    );

CREATE POLICY "Users can delete their own unresolved flags" ON user_card_flags
    FOR DELETE USING (
        auth.uid() = user_id 
        AND resolved_at IS NULL
    );

CREATE POLICY "Admins can view all flags" ON user_card_flags
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND is_admin = TRUE
        )
    );

CREATE POLICY "Admins can resolve flags" ON user_card_flags
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND is_admin = TRUE
        )
    );

-- =====================================================
-- STREAK REWARD CONFIGS TABLE
-- =====================================================

CREATE TABLE streak_reward_configs (
    -- Core identity
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Milestone configuration
    milestone_days INTEGER NOT NULL UNIQUE,
    reward_type TEXT NOT NULL, -- 'badge', 'feature_unlock', 'cosmetic', etc.
    reward_title TEXT NOT NULL,
    reward_description TEXT NOT NULL,
    reward_value INTEGER, -- Optional numeric value
    
    -- Configuration state
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT streak_reward_configs_milestone_days_check CHECK (milestone_days > 0),
    CONSTRAINT streak_reward_configs_reward_type_not_empty CHECK (length(trim(reward_type)) > 0),
    CONSTRAINT streak_reward_configs_reward_title_not_empty CHECK (length(trim(reward_title)) > 0),
    CONSTRAINT streak_reward_configs_reward_description_not_empty CHECK (length(trim(reward_description)) > 0),
    CONSTRAINT streak_reward_configs_reward_value_check CHECK (reward_value IS NULL OR reward_value >= 0)
);

-- Enable Row Level Security
ALTER TABLE streak_reward_configs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for streak_reward_configs (read-only for users, admin-managed)
CREATE POLICY "Anyone can view active streak rewards" ON streak_reward_configs
    FOR SELECT USING (is_active = TRUE);

CREATE POLICY "Admins can manage all streak rewards" ON streak_reward_configs
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND is_admin = TRUE
        )
    );

-- =====================================================
-- USER STREAK MILESTONES TABLE
-- =====================================================

CREATE TABLE user_streak_milestones (
    -- Core identity
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Milestone context
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    milestone_days INTEGER NOT NULL,
    
    -- Achievement details
    achieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reward_claimed BOOLEAN NOT NULL DEFAULT FALSE,
    reward_claimed_at TIMESTAMPTZ,
    reward_type TEXT,
    reward_description TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT user_streak_milestones_milestone_days_check CHECK (milestone_days > 0),
    CONSTRAINT user_streak_milestones_unique_user_milestone UNIQUE (user_id, milestone_days)
);

-- Enable Row Level Security
ALTER TABLE user_streak_milestones ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_streak_milestones
CREATE POLICY "Users can view their own milestones" ON user_streak_milestones
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own milestone claims" ON user_streak_milestones
    FOR UPDATE USING (auth.uid() = user_id);

-- Note: Milestone creation is handled by triggers/functions, not direct user insertion

CREATE POLICY "Admins can view all milestones" ON user_streak_milestones
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND is_admin = TRUE
        )
    );

-- =====================================================
-- USER STREAK HISTORY TABLE
-- =====================================================

CREATE TABLE user_streak_history (
    -- Core identity
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Streak context
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    streak_date DATE NOT NULL,
    
    -- Daily activity
    cards_reviewed INTEGER NOT NULL DEFAULT 0,
    streak_day_number INTEGER NOT NULL,
    is_streak_break BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT user_streak_history_cards_reviewed_check CHECK (cards_reviewed >= 0),
    CONSTRAINT user_streak_history_streak_day_number_check CHECK (streak_day_number >= 0),
    CONSTRAINT user_streak_history_unique_user_date UNIQUE (user_id, streak_date)
);

-- Enable Row Level Security
ALTER TABLE user_streak_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_streak_history
CREATE POLICY "Users can view their own streak history" ON user_streak_history
    FOR SELECT USING (auth.uid() = user_id);

-- Note: Streak history is managed by functions, not direct user manipulation

CREATE POLICY "Admins can view all streak history" ON user_streak_history
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND is_admin = TRUE
        )
    );

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Updated at trigger for streak_reward_configs
CREATE TRIGGER streak_reward_configs_updated_at
    BEFORE UPDATE ON streak_reward_configs
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- Trigger to update card template user flag count
CREATE OR REPLACE FUNCTION update_card_template_flag_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Increment flag count
        UPDATE card_templates
        SET user_flag_count = user_flag_count + 1
        WHERE id = NEW.card_template_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        -- Decrement flag count
        UPDATE card_templates
        SET user_flag_count = user_flag_count - 1
        WHERE id = OLD.card_template_id;
        RETURN OLD;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER update_flag_count_on_insert
    AFTER INSERT ON user_card_flags
    FOR EACH ROW
    EXECUTE FUNCTION update_card_template_flag_count();

CREATE TRIGGER update_flag_count_on_delete
    AFTER DELETE ON user_card_flags
    FOR EACH ROW
    EXECUTE FUNCTION update_card_template_flag_count();

-- =====================================================
-- INDEXES
-- =====================================================

-- User card flags indexes
CREATE INDEX idx_user_card_flags_user_id ON user_card_flags(user_id);
CREATE INDEX idx_user_card_flags_card_template_id ON user_card_flags(card_template_id);
CREATE INDEX idx_user_card_flags_reason ON user_card_flags(reason);
CREATE INDEX idx_user_card_flags_resolved_at ON user_card_flags(resolved_at);
CREATE INDEX idx_user_card_flags_unresolved ON user_card_flags(created_at) WHERE resolved_at IS NULL;

-- Streak reward configs indexes
CREATE INDEX idx_streak_reward_configs_milestone_days ON streak_reward_configs(milestone_days);
CREATE INDEX idx_streak_reward_configs_is_active ON streak_reward_configs(is_active);

-- User streak milestones indexes
CREATE INDEX idx_user_streak_milestones_user_id ON user_streak_milestones(user_id);
CREATE INDEX idx_user_streak_milestones_milestone_days ON user_streak_milestones(milestone_days);
CREATE INDEX idx_user_streak_milestones_achieved_at ON user_streak_milestones(achieved_at);
CREATE INDEX idx_user_streak_milestones_unclaimed ON user_streak_milestones(user_id) WHERE reward_claimed = FALSE;

-- User streak history indexes
CREATE INDEX idx_user_streak_history_user_id ON user_streak_history(user_id);
CREATE INDEX idx_user_streak_history_streak_date ON user_streak_history(streak_date);
CREATE INDEX idx_user_streak_history_user_date ON user_streak_history(user_id, streak_date);

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to submit a user flag for a card
CREATE OR REPLACE FUNCTION submit_user_card_flag(
    p_user_id UUID,
    p_card_template_id UUID,
    p_reason flag_reason,
    p_comment TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    new_flag_id UUID;
    existing_flag_id UUID;
BEGIN
    -- Check if user already flagged this card (unresolved)
    SELECT id INTO existing_flag_id
    FROM user_card_flags
    WHERE user_id = p_user_id 
    AND card_template_id = p_card_template_id
    AND resolved_at IS NULL;
    
    IF existing_flag_id IS NOT NULL THEN
        RAISE EXCEPTION 'Card already flagged by user';
    END IF;
    
    -- Create the flag
    INSERT INTO user_card_flags (user_id, card_template_id, reason, comment)
    VALUES (p_user_id, p_card_template_id, p_reason, p_comment)
    RETURNING id INTO new_flag_id;
    
    RETURN new_flag_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to resolve a user flag (admin only)
CREATE OR REPLACE FUNCTION resolve_user_card_flag(
    p_flag_id UUID,
    p_admin_id UUID,
    p_resolution_action TEXT,
    p_resolution_comment TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    is_admin BOOLEAN;
BEGIN
    -- Verify admin permissions
    SELECT profiles.is_admin INTO is_admin
    FROM profiles
    WHERE id = p_admin_id;
    
    IF NOT is_admin THEN
        RAISE EXCEPTION 'Insufficient permissions';
    END IF;
    
    -- Resolve the flag
    UPDATE user_card_flags
    SET 
        resolved_at = NOW(),
        resolved_by = p_admin_id,
        resolution_action = p_resolution_action,
        resolution_comment = p_resolution_comment
    WHERE id = p_flag_id AND resolved_at IS NULL;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update user streak after review session
CREATE OR REPLACE FUNCTION update_user_streak(
    p_user_id UUID,
    p_cards_reviewed INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
    user_profile RECORD;
    today_date DATE;
    yesterday_date DATE;
    current_streak INTEGER;
    existing_history RECORD;
BEGIN
    -- Get user profile
    SELECT * INTO user_profile
    FROM profiles
    WHERE id = p_user_id;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Get user's local date
    today_date := (get_user_local_time(p_user_id))::DATE;
    yesterday_date := today_date - INTERVAL '1 day';
    
    -- Check if we already have a record for today
    SELECT * INTO existing_history
    FROM user_streak_history
    WHERE user_id = p_user_id AND streak_date = today_date;
    
    IF FOUND THEN
        -- Update existing record
        UPDATE user_streak_history
        SET cards_reviewed = cards_reviewed + p_cards_reviewed
        WHERE id = existing_history.id;
        
        RETURN TRUE;
    END IF;
    
    -- Determine streak day number
    current_streak := user_profile.current_daily_streak;
    
    -- Check if yesterday had activity
    IF EXISTS (
        SELECT 1 FROM user_streak_history
        WHERE user_id = p_user_id 
        AND streak_date = yesterday_date
        AND cards_reviewed > 0
    ) THEN
        -- Continue streak
        current_streak := current_streak + 1;
    ELSE
        -- New streak starts
        current_streak := 1;
    END IF;
    
    -- Insert today's record
    INSERT INTO user_streak_history (
        user_id, 
        streak_date, 
        cards_reviewed, 
        streak_day_number,
        is_streak_break
    ) VALUES (
        p_user_id, 
        today_date, 
        p_cards_reviewed, 
        current_streak,
        FALSE
    );
    
    -- Update profile streak info
    UPDATE profiles
    SET 
        current_daily_streak = current_streak,
        longest_daily_streak = GREATEST(longest_daily_streak, current_streak),
        last_streak_date = today_date
    WHERE id = p_user_id;
    
    -- Check for milestone achievements
    PERFORM check_and_award_streak_milestones(p_user_id, current_streak);
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check and award streak milestones
CREATE OR REPLACE FUNCTION check_and_award_streak_milestones(
    p_user_id UUID,
    p_current_streak INTEGER
)
RETURNS INTEGER AS $$
DECLARE
    milestone_config RECORD;
    new_milestones INTEGER := 0;
BEGIN
    -- Find all milestone configs that this streak qualifies for
    FOR milestone_config IN
        SELECT *
        FROM streak_reward_configs
        WHERE is_active = TRUE
        AND milestone_days <= p_current_streak
        AND NOT EXISTS (
            SELECT 1 FROM user_streak_milestones
            WHERE user_id = p_user_id
            AND milestone_days = streak_reward_configs.milestone_days
        )
    LOOP
        -- Award the milestone
        INSERT INTO user_streak_milestones (
            user_id,
            milestone_days,
            reward_type,
            reward_description
        ) VALUES (
            p_user_id,
            milestone_config.milestone_days,
            milestone_config.reward_type,
            milestone_config.reward_description
        );
        
        new_milestones := new_milestones + 1;
    END LOOP;
    
    RETURN new_milestones;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to claim a streak milestone reward
CREATE OR REPLACE FUNCTION claim_streak_milestone_reward(
    p_user_id UUID,
    p_milestone_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE user_streak_milestones
    SET 
        reward_claimed = TRUE,
        reward_claimed_at = NOW()
    WHERE id = p_milestone_id
    AND user_id = p_user_id
    AND reward_claimed = FALSE;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- User flags and streaks systems are ready
-- Next: Run 09-loading-messages.sql