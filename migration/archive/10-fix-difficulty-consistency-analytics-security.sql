-- Fix security issue: Change get_difficulty_consistency_analytics from SECURITY DEFINER to SECURITY INVOKER
-- This ensures the function respects the caller's permissions and RLS policies

CREATE OR REPLACE FUNCTION public.get_difficulty_consistency_analytics(
    p_subject_id uuid DEFAULT NULL::uuid, 
    p_min_reviews integer DEFAULT 5, 
    p_classification text DEFAULT NULL::text, 
    p_limit integer DEFAULT 50
)
RETURNS TABLE(
    card_id uuid, 
    question text, 
    difficulty_classification text, 
    consistency_score numeric, 
    avg_rating numeric, 
    rating_variance numeric, 
    total_reviews bigint, 
    subject_name text
)
LANGUAGE plpgsql
SECURITY INVOKER  -- Changed from SECURITY DEFINER to respect caller's permissions
AS $function$
BEGIN
    -- Check if user is admin using their own permissions
    IF NOT is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Only admins can access difficulty consistency analytics';
    END IF;
    
    RETURN QUERY
    SELECT 
        dc.card_id,
        dc.question,
        dc.difficulty_classification,
        dc.consistency_score,
        dc.avg_rating,
        dc.rating_variance,
        dc.total_reviews,
        COALESCE(dc.subject_name::TEXT, 'Unknown') as subject_name
    FROM public.card_difficulty_consistency dc
    WHERE (p_subject_id IS NULL OR dc.subject_id = p_subject_id)
    AND dc.total_reviews >= p_min_reviews
    AND (p_classification IS NULL OR dc.difficulty_classification = p_classification)
    ORDER BY 
        CASE 
            WHEN p_classification = 'optimal' THEN dc.consistency_score
            ELSE -dc.consistency_score
        END DESC
    LIMIT p_limit;
END;
$function$;