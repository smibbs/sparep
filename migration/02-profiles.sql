-- =====================================================
-- Migration 02: User Profiles
-- =====================================================
-- Enhanced user profiles with timezone and daily scheduling support
-- Requires: 01-extensions-and-enums.sql

-- =====================================================
-- PROFILES TABLE
-- =====================================================

CREATE TABLE profiles (
    -- Core identity
    id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR NOT NULL,
    display_name VARCHAR,
    
    -- User tier and permissions
    user_tier user_tier NOT NULL DEFAULT 'free',
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Timezone and scheduling (NEW - enhanced FSRS support)
    timezone VARCHAR DEFAULT 'UTC', -- User's timezone (e.g., 'America/New_York')
    day_start_time TIME DEFAULT '04:00:00', -- When user's day starts (4 AM default)
    
    -- Daily limits and caps
    daily_new_cards_limit INTEGER NOT NULL DEFAULT 20,
    daily_review_limit INTEGER NOT NULL DEFAULT 100,
    
    -- Daily tracking
    reviews_today INTEGER NOT NULL DEFAULT 0,
    last_review_date DATE DEFAULT CURRENT_DATE,
    
    -- Streak system
    current_daily_streak INTEGER DEFAULT 0,
    longest_daily_streak INTEGER DEFAULT 0,
    last_streak_date DATE,
    streak_freeze_count INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT profiles_daily_new_cards_limit_check CHECK (daily_new_cards_limit >= 0),
    CONSTRAINT profiles_daily_review_limit_check CHECK (daily_review_limit >= 0),
    CONSTRAINT profiles_reviews_today_check CHECK (reviews_today >= 0),
    CONSTRAINT profiles_current_daily_streak_check CHECK (current_daily_streak >= 0),
    CONSTRAINT profiles_longest_daily_streak_check CHECK (longest_daily_streak >= 0),
    CONSTRAINT profiles_streak_freeze_count_check CHECK (streak_freeze_count >= 0)
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON profiles
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND is_admin = TRUE
        )
    );

-- Create updated_at trigger
CREATE TRIGGER profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- Create indexes for performance
CREATE INDEX idx_profiles_user_tier ON profiles(user_tier);
CREATE INDEX idx_profiles_last_review_date ON profiles(last_review_date);
CREATE INDEX idx_profiles_timezone ON profiles(timezone);

-- =====================================================
-- HELPER FUNCTIONS FOR PROFILES
-- =====================================================

-- Function to get user's current local time
CREATE OR REPLACE FUNCTION get_user_local_time(user_id UUID)
RETURNS TIMESTAMPTZ AS $$
DECLARE
    user_timezone VARCHAR;
BEGIN
    SELECT timezone INTO user_timezone
    FROM profiles
    WHERE id = user_id;
    
    IF user_timezone IS NULL THEN
        RETURN NOW();
    END IF;
    
    RETURN NOW() AT TIME ZONE user_timezone;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if it's a new day for the user
CREATE OR REPLACE FUNCTION is_new_day_for_user(user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    user_profile RECORD;
    user_local_time TIMESTAMPTZ;
    day_start_today TIMESTAMPTZ;
    last_review_day_start TIMESTAMPTZ;
BEGIN
    -- Get user profile
    SELECT * INTO user_profile
    FROM profiles
    WHERE id = user_id;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Get user's current local time
    user_local_time := get_user_local_time(user_id);
    
    -- Calculate today's day start time in user's timezone
    day_start_today := (user_local_time::DATE + user_profile.day_start_time)::TIMESTAMPTZ AT TIME ZONE user_profile.timezone;
    
    -- If current time is before day start, use yesterday's day start
    IF user_local_time < day_start_today THEN
        day_start_today := day_start_today - INTERVAL '1 day';
    END IF;
    
    -- Calculate last review day start
    IF user_profile.last_review_date IS NULL THEN
        RETURN TRUE;
    END IF;
    
    last_review_day_start := (user_profile.last_review_date + user_profile.day_start_time)::TIMESTAMPTZ AT TIME ZONE user_profile.timezone;
    
    -- Check if current day start is different from last review day start
    RETURN day_start_today::DATE != last_review_day_start::DATE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Profiles table with enhanced timezone support is ready
-- Next: Run 03-subjects-and-decks.sql