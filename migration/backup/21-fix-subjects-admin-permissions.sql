-- Migration: 21-fix-subjects-admin-permissions.sql
-- Description: Fix RLS permissions for admin users to update subjects table
-- Dependencies: 04-subjects.sql, 15-fix-admin-function.sql

-- Create a function that admins can call to update subject status
-- This bypasses RLS by using SECURITY DEFINER
CREATE OR REPLACE FUNCTION admin_toggle_subject_status(
    subject_id UUID,
    new_status BOOLEAN
)
RETURNS JSON AS $$
DECLARE
    result_data JSON;
BEGIN
    -- Check if the calling user is an admin
    IF NOT is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Access denied: Admin privileges required';
    END IF;

    -- Perform the update
    UPDATE public.subjects 
    SET is_active = new_status, updated_at = NOW()
    WHERE id = subject_id;

    -- Check if any rows were updated
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subject not found or could not be updated';
    END IF;

    -- Return the updated subject data
    SELECT row_to_json(subjects.*) INTO result_data
    FROM public.subjects
    WHERE id = subject_id;

    RETURN result_data;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function for bulk subject status updates
CREATE OR REPLACE FUNCTION admin_bulk_toggle_subjects(
    subject_ids UUID[],
    new_status BOOLEAN
)
RETURNS JSON AS $$
DECLARE
    updated_count INTEGER;
    result_data JSON;
BEGIN
    -- Check if the calling user is an admin
    IF NOT is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Access denied: Admin privileges required';
    END IF;

    -- Perform the bulk update
    UPDATE public.subjects 
    SET is_active = new_status, updated_at = NOW()
    WHERE id = ANY(subject_ids);

    GET DIAGNOSTICS updated_count = ROW_COUNT;

    -- Return result information
    SELECT json_build_object(
        'updated_count', updated_count,
        'requested_count', array_length(subject_ids, 1),
        'subject_ids', subject_ids,
        'new_status', new_status
    ) INTO result_data;

    RETURN result_data;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION admin_toggle_subject_status(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_bulk_toggle_subjects(UUID[], BOOLEAN) TO authenticated;

-- Add comments
COMMENT ON FUNCTION admin_toggle_subject_status IS 'Allows admin users to toggle subject active status';
COMMENT ON FUNCTION admin_bulk_toggle_subjects IS 'Allows admin users to bulk toggle multiple subjects active status';