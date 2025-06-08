-- Migration: 01-users-table.sql
-- Description: Creates the users table and sets up authentication schema
-- Note: Supabase automatically creates auth.users table, this extends it with our custom fields

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom user profiles table that extends auth.users
CREATE TABLE public.user_profiles (
    -- Primary key, matches auth.users.id
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- User profile fields
    display_name VARCHAR(50),
    email VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    
    -- User preferences
    daily_new_cards_limit INT NOT NULL DEFAULT 20,
    daily_review_limit INT NOT NULL DEFAULT 100,
    learn_ahead_time_minutes INT NOT NULL DEFAULT 20,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ,
    
    -- Study statistics
    total_cards_studied INT NOT NULL DEFAULT 0,
    total_reviews INT NOT NULL DEFAULT 0,
    current_streak INT NOT NULL DEFAULT 0,
    longest_streak INT NOT NULL DEFAULT 0
);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_profiles_updated_at
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create function to validate email matches auth.users
CREATE OR REPLACE FUNCTION validate_user_profile_email()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.email != (SELECT email FROM auth.users WHERE id = NEW.id) THEN
        RAISE EXCEPTION 'Email must match the email in auth.users';
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for email validation
CREATE TRIGGER validate_email_match
    BEFORE INSERT OR UPDATE OF email ON public.user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION validate_user_profile_email();

-- Create function to handle new user creation
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_profiles (id, email)
    VALUES (NEW.id, NEW.email);
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to create profile when user signs up
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- Set up Row Level Security (RLS)
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own profile"
    ON public.user_profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.user_profiles FOR UPDATE
    USING (auth.uid() = id);

-- Create indexes
CREATE INDEX user_profiles_email_idx ON public.user_profiles(email);
CREATE INDEX user_profiles_created_at_idx ON public.user_profiles(created_at);

-- Comments
COMMENT ON TABLE public.user_profiles IS 'Profile data for each user that extends Supabase auth.users';
COMMENT ON COLUMN public.user_profiles.id IS 'References the auth.users.id for the user';
COMMENT ON COLUMN public.user_profiles.daily_new_cards_limit IS 'Maximum number of new cards to show per day';
COMMENT ON COLUMN public.user_profiles.daily_review_limit IS 'Maximum number of reviews to show per day';
COMMENT ON COLUMN public.user_profiles.learn_ahead_time_minutes IS 'Minutes to look ahead for cards becoming due'; 