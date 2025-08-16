-- =====================================================
-- Migration 14: Update flag_card_for_review function
-- =====================================================
-- Enhances flagging to mark cards under review and track flag time
-- Requires: 13-flag-card-function.sql

CREATE OR REPLACE FUNCTION public.flag_card_for_review(
    p_card_template_id UUID,
    p_reason TEXT,
    p_comment TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_flag_reason flag_reason;
    v_existing_flag_id UUID;
BEGIN
    -- Get the current user ID
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User not authenticated'
        );
    END IF;

    -- Validate card template exists
    IF NOT EXISTS (
        SELECT 1 FROM card_templates WHERE id = p_card_template_id
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Card template not found'
        );
    END IF;

    -- Convert reason text to enum, default to 'other' if invalid
    BEGIN
        v_flag_reason := p_reason::flag_reason;
    EXCEPTION WHEN invalid_text_representation THEN
        v_flag_reason := 'other'::flag_reason;
    END;

    -- Check if user has already flagged this card
    SELECT id INTO v_existing_flag_id
    FROM user_card_flags
    WHERE user_id = v_user_id
      AND card_template_id = p_card_template_id
      AND resolved_at IS NULL;

    IF v_existing_flag_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Card already flagged by this user'
        );
    END IF;

    -- Insert the flag
    INSERT INTO user_card_flags (
        user_id,
        card_template_id,
        reason,
        comment
    ) VALUES (
        v_user_id,
        p_card_template_id,
        v_flag_reason,
        p_comment
    );

    -- Update card status
    UPDATE card_templates
    SET user_flag_count   = user_flag_count + 1,
        flagged_for_review = TRUE,
        flagged_at        = COALESCE(flagged_at, NOW()),
        updated_at        = NOW()
    WHERE id = p_card_template_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Card flagged successfully'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', 'Database error: ' || SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.flag_card_for_review(UUID, TEXT, TEXT) TO authenticated;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
