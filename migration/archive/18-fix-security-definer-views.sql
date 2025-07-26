-- Migration: 18-fix-security-definer-views.sql
-- Description: Fix Supabase security advisor warnings by converting views from SECURITY DEFINER to SECURITY INVOKER
-- Dependencies: 13-advanced-analytics-schema.sql

-- Convert card_analytics_summary view to use SECURITY INVOKER
ALTER VIEW public.card_analytics_summary
SET (security_invoker = true);

-- Convert card_hesitation_analytics view to use SECURITY INVOKER
ALTER VIEW public.card_hesitation_analytics
SET (security_invoker = true);

-- Convert card_difficulty_consistency view to use SECURITY INVOKER
ALTER VIEW public.card_difficulty_consistency
SET (security_invoker = true);

-- Convert card_error_patterns view to use SECURITY INVOKER
ALTER VIEW public.card_error_patterns
SET (security_invoker = true);

-- Add comments to document the security change
COMMENT ON VIEW public.card_analytics_summary IS 'Comprehensive analytics summary view - SECURITY INVOKER mode respects RLS policies';
COMMENT ON VIEW public.card_hesitation_analytics IS 'Card hesitation pattern analytics view - SECURITY INVOKER mode respects RLS policies';
COMMENT ON VIEW public.card_difficulty_consistency IS 'Card difficulty consistency analytics view - SECURITY INVOKER mode respects RLS policies';
COMMENT ON VIEW public.card_error_patterns IS 'Card error pattern analytics view - SECURITY INVOKER mode respects RLS policies';