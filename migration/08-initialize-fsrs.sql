-- Migration: 08-initialize-fsrs.sql
-- Description: Sets up FSRS parameter initialization for new users
-- Dependencies: 01-initial-setup.sql, 02-user-profiles.sql, 07-fsrs-parameters.sql

-- Create function to initialize FSRS parameters
CREATE OR REPLACE FUNCTION initialize_fsrs_parameters()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    -- Add debug logging
    RAISE LOG 'initialize_fsrs_parameters() called for user_id: %', NEW.id;
    
    BEGIN
        -- Insert default FSRS parameters
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
        
        RAISE LOG 'Successfully initialized FSRS parameters for user_id: %', NEW.id;
    EXCEPTION WHEN OTHERS THEN
        -- Log the error details
        RAISE LOG 'Error in initialize_fsrs_parameters(): % %', SQLERRM, SQLSTATE;
        RETURN NULL;
    END;
    
    RETURN NEW;
END;
$$;

-- Create trigger for new users
CREATE TRIGGER on_auth_user_created_fsrs
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION initialize_fsrs_parameters();

-- Ensure proper function permissions
ALTER FUNCTION initialize_fsrs_parameters() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION initialize_fsrs_parameters() TO postgres;

-- Comments
COMMENT ON FUNCTION initialize_fsrs_parameters IS 'Initializes FSRS parameters for new users with optimized defaults'; 