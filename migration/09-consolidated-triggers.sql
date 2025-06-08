-- Migration: 09-consolidated-triggers.sql
-- Description: Consolidates all user creation triggers into a single trigger
-- Dependencies: All previous migrations

-- Drop existing triggers
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created_fsrs ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS initialize_fsrs_parameters() CASCADE;

-- Create consolidated trigger function
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
        
        -- Initialize FSRS parameters
        INSERT INTO public.fsrs_parameters (
            user_id,
            -- Optimized FSRS weights based on research
            w0, w1, w2, w3, w4, w5, w6, w7, w8,
            w9, w10, w11, w12, w13, w14, w15, w16
        ) VALUES (
            NEW.id,
            -- Default weights from FSRS research paper
            1.0, 1.0, 5.0, 0.5, 0.2, 1.2, 0.8, 0.7, 1.4,
            0.7, 0.2, 0.9, 0.5, 100.0, 1.0, 10.0, 1.0
        );
        
        RAISE LOG 'Successfully created profile and FSRS parameters for user_id: %', NEW.id;
    EXCEPTION WHEN OTHERS THEN
        -- Log the error details
        RAISE LOG 'Error in handle_new_user(): % %', SQLERRM, SQLSTATE;
        RETURN NULL;
    END;
    
    RETURN NEW;
END;
$$;

-- Create single trigger for new users
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- Ensure proper function permissions
ALTER FUNCTION handle_new_user() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION handle_new_user() TO postgres;

-- Grant necessary table permissions
GRANT ALL ON public.user_profiles TO postgres;
GRANT ALL ON public.fsrs_parameters TO postgres;

-- Comments
COMMENT ON FUNCTION handle_new_user IS 'Consolidated trigger function that handles all new user initialization'; 