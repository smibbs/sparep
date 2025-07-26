-- Migration 03: User Profiles Table (Current Schema)
-- Description: Creates user profiles table with streak tracking and tier system
-- Dependencies: 01-initial-setup-current.sql, 02-enums-current.sql

-- Create user profiles table
CREATE TABLE public.user_profiles (
    -- Primary key, matches auth.users.id
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- User profile fields
    display_name VARCHAR,
    email VARCHAR NOT NULL,
    
    -- User preferences and limits
    daily_new_cards_limit INT NOT NULL DEFAULT 20,
    daily_review_limit INT NOT NULL DEFAULT 100,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Visibility and permissions
    is_public BOOLEAN NOT NULL DEFAULT false,
    is_admin BOOLEAN NOT NULL DEFAULT false,
    
    -- User tier system
    user_tier user_tier NOT NULL DEFAULT 'free',
    
    -- Daily review tracking
    reviews_today INT NOT NULL DEFAULT 0,
    last_review_date DATE DEFAULT CURRENT_DATE,
    
    -- Streak tracking (added in later database evolution)
    current_daily_streak INT DEFAULT 0,
    longest_daily_streak INT DEFAULT 0,
    last_streak_date DATE,
    streak_freeze_count INT DEFAULT 0
);

-- Create updated_at trigger
CREATE TRIGGER update_user_profiles_updated_at
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own profile"
    ON public.user_profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
    ON public.user_profiles FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Public profiles are viewable by authenticated users"
    ON public.user_profiles FOR SELECT
    USING (is_public = true AND auth.role() = 'authenticated');

-- Create function to handle new user creation
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_profiles (id, email, display_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user creation
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();