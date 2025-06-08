-- Fix conflicting profile tables and permissions

-- Drop the redundant profiles table
DROP TABLE IF EXISTS public.profiles CASCADE;

-- Drop conflicting trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Update the handle_new_user function to handle display_name
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_profiles (id, email, display_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'display_name', '')
    );
    RETURN NEW;
END;
$$ language 'plpgsql' SECURITY DEFINER;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Add missing INSERT policy for user_profiles
DROP POLICY IF EXISTS "Trigger can create user profiles" ON public.user_profiles;
CREATE POLICY "Trigger can create user profiles"
    ON public.user_profiles
    FOR INSERT
    WITH CHECK (true);  -- Allow the trigger to create profiles

-- Grant necessary permissions to the auth user
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON public.user_profiles TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- Ensure RLS is enabled
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY; 