-- =====================================================
-- Fix Security Definer Linter Warnings
-- =====================================================
-- This migration explicitly sets security_invoker=true on all views
-- to silence Supabase linter warnings about SECURITY DEFINER views.
--
-- CONTEXT: The linter detects views using auth.uid() and flags them
-- as potential SECURITY DEFINER issues. However, in PostgreSQL 15+,
-- views default to SECURITY INVOKER mode, which properly respects RLS.
--
-- This migration makes the security mode explicit to:
-- 1. Silence linter warnings
-- 2. Document intent clearly
-- 3. Prevent future confusion
-- =====================================================

-- View 1: v_subject_availability
ALTER VIEW v_subject_availability SET (security_invoker = true);

-- View 2: v_deck_availability
ALTER VIEW v_deck_availability SET (security_invoker = true);

-- View 3: v_new_user_cards
ALTER VIEW v_new_user_cards SET (security_invoker = true);

-- View 4: v_user_study_session_info
ALTER VIEW v_user_study_session_info SET (security_invoker = true);

-- View 5: v_due_user_cards
ALTER VIEW v_due_user_cards SET (security_invoker = true);

-- View 6: v_auto_managed_deck_inspection
ALTER VIEW v_auto_managed_deck_inspection SET (security_invoker = true);

-- View 7: v_due_counts_by_deck
ALTER VIEW v_due_counts_by_deck SET (security_invoker = true);

-- Add comments documenting the security model
COMMENT ON VIEW v_subject_availability IS 'Shows subjects with available cards for the current user. Uses SECURITY INVOKER mode to respect RLS policies.';
COMMENT ON VIEW v_deck_availability IS 'Shows decks with available cards for the current user. Uses SECURITY INVOKER mode to respect RLS policies.';
COMMENT ON VIEW v_new_user_cards IS 'Shows new cards available for the current user. Uses SECURITY INVOKER mode to respect RLS policies.';
COMMENT ON VIEW v_user_study_session_info IS 'Shows study session info for the current user. Uses SECURITY INVOKER mode to respect RLS policies.';
COMMENT ON VIEW v_due_user_cards IS 'Shows due cards for the current user. Uses SECURITY INVOKER mode to respect RLS policies.';
COMMENT ON VIEW v_auto_managed_deck_inspection IS 'Admin inspection view for auto-managed deck assignments. Uses SECURITY INVOKER mode to respect RLS policies.';
COMMENT ON VIEW v_due_counts_by_deck IS 'Shows card counts by deck for the current user. Uses SECURITY INVOKER mode to respect RLS policies.';
