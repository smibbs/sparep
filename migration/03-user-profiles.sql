-- Migration: 03-user-profiles.sql
-- Description: Creates the user profiles table and sets up authentication
-- Dependencies: 01-initial-setup.sql, 02-enums.sql

-- Create user profiles table
CREATE TABLE public.user_profiles (
    -- Primary key, matches auth.users.id
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- User profile fields
    display_name VARCHAR,
    email VARCHAR NOT NULL,
    avatar_url TEXT,
    
    -- User preferences and limits
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
    longest_streak INT NOT NULL DEFAULT 0,
    
    -- Visibility and permissions
    is_public BOOLEAN NOT NULL DEFAULT false,
    is_admin BOOLEAN NOT NULL DEFAULT false,
    
    -- User tier system
    user_tier user_tier NOT NULL DEFAULT 'free',
    
    -- Daily review tracking
    reviews_today INT NOT NULL DEFAULT 0,
    last_review_date DATE DEFAULT CURRENT_DATE
);

-- Create updated_at trigger
CREATE TRIGGER update_user_profiles_updated_at
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create function to handle new user creation
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_display_name TEXT;
BEGIN
    -- Add debug logging
    RAISE LOG 'handle_new_user() called for user_id: %, email: %', NEW.id, NEW.email;
    
    BEGIN
        -- Extract display_name with fallback
        v_display_name := COALESCE(
            NEW.raw_user_meta_data->>'display_name',
            split_part(NEW.email, '@', 1)
        );
        
        -- Create user profile
        INSERT INTO public.user_profiles (
            id,
            email,
            display_name,
            created_at,
            updated_at
        ) VALUES (
            NEW.id,
            NEW.email,
            v_display_name,
            NOW(),
            NOW()
        );
        
        RAISE LOG 'Successfully created profile for user_id: %', NEW.id;
    EXCEPTION WHEN OTHERS THEN
        -- Log the error details
        RAISE LOG 'Error in handle_new_user(): % %', SQLERRM, SQLSTATE;
        RETURN NULL;
    END;
    
    RETURN NEW;
END;
$$;

-- Create trigger for new users
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- Set up Row Level Security (RLS)
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view own profile"
    ON public.user_profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.user_profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
    ON public.user_profiles FOR SELECT
    USING (is_admin(auth.uid()));

CREATE POLICY "Admins can update all profiles"
    ON public.user_profiles FOR UPDATE
    USING (is_admin(auth.uid()))
    WITH CHECK (is_admin(auth.uid()));

-- Create policy for trigger-based creation
CREATE POLICY "System can create user profiles"
    ON public.user_profiles
    FOR INSERT
    WITH CHECK (true);

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated;
GRANT ALL ON public.user_profiles TO postgres;
GRANT SELECT, UPDATE ON public.user_profiles TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO postgres, authenticated;

-- Ensure proper function permissions
ALTER FUNCTION handle_new_user() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION handle_new_user() TO postgres;

-- Create indexes
CREATE INDEX user_profiles_email_idx ON public.user_profiles(email);
CREATE INDEX user_profiles_created_at_idx ON public.user_profiles(created_at);
CREATE INDEX user_profiles_user_tier_idx ON public.user_profiles(user_tier);
CREATE INDEX user_profiles_last_review_date_idx ON public.user_profiles(last_review_date);

-- Comments
COMMENT ON TABLE public.user_profiles IS 'Profile data for each user that extends Supabase auth.users';
COMMENT ON COLUMN public.user_profiles.id IS 'References the auth.users.id for the user';
COMMENT ON COLUMN public.user_profiles.daily_new_cards_limit IS 'Maximum number of new cards to show per day';
COMMENT ON COLUMN public.user_profiles.daily_review_limit IS 'Maximum number of reviews to show per day';
COMMENT ON COLUMN public.user_profiles.learn_ahead_time_minutes IS 'Minutes to look ahead for cards becoming due';
COMMENT ON COLUMN public.user_profiles.is_public IS 'Whether the user profile is publicly visible';
COMMENT ON COLUMN public.user_profiles.is_admin IS 'Whether the user has administrator privileges';
COMMENT ON COLUMN public.user_profiles.user_tier IS 'User access tier determining features and limits';
COMMENT ON COLUMN public.user_profiles.reviews_today IS 'Number of reviews completed today';
COMMENT ON COLUMN public.user_profiles.last_review_date IS 'Date of last review for daily reset tracking';