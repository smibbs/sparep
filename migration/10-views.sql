-- =====================================================
-- Migration 10: Optimized Views
-- =====================================================
-- Client-facing views for efficient querying
-- Requires: 01-extensions-and-enums.sql through 09-loading-messages.sql

-- =====================================================
-- v_due_user_cards VIEW
-- =====================================================
-- Cards that are due for review (learning, review, relearning states)

CREATE VIEW v_due_user_cards AS
SELECT 
    -- Card identification
    uc.user_id,
    uc.card_template_id,
    uc.deck_id,
    
    -- Card content from template
    ct.question,
    ct.answer,
    ct.tags,
    ct.subsection,
    
    -- FSRS state
    uc.state,
    uc.stability,
    uc.difficulty,
    uc.due_at,
    uc.last_reviewed_at,
    uc.last_rating,
    
    -- Progress metrics
    uc.reps,
    uc.lapses,
    uc.total_reviews,
    uc.correct_reviews,
    uc.incorrect_reviews,
    
    -- Organization info
    s.name as subject_name,
    d.name as deck_name,
    
    -- Priority for sorting (overdue cards first)
    CASE 
        WHEN uc.due_at <= NOW() THEN EXTRACT(EPOCH FROM (NOW() - uc.due_at))
        ELSE 0
    END as overdue_seconds,
    
    -- Timestamps
    uc.created_at,
    uc.updated_at

FROM user_cards uc
JOIN card_templates ct ON ct.id = uc.card_template_id
JOIN decks d ON d.id = uc.deck_id
LEFT JOIN subjects s ON s.id = ct.subject_id
WHERE 
    uc.state IN ('learning', 'review', 'relearning')
    AND uc.due_at <= NOW()
    AND ct.flagged_for_review = FALSE
    AND d.is_active = TRUE;

-- Enable RLS on view
ALTER VIEW v_due_user_cards SET (security_barrier = true);

-- =====================================================
-- v_new_user_cards VIEW
-- =====================================================
-- Cards in 'new' state ready for introduction

CREATE VIEW v_new_user_cards AS
SELECT 
    -- Card identification
    uc.user_id,
    uc.card_template_id,
    uc.deck_id,
    
    -- Card content from template
    ct.question,
    ct.answer,
    ct.tags,
    ct.subsection,
    
    -- FSRS state (mostly defaults for new cards)
    uc.state,
    uc.stability,
    uc.difficulty,
    
    -- Organization info
    s.name as subject_name,
    d.name as deck_name,
    
    -- Priority for sorting (older additions first)
    uc.created_at as added_at,
    
    -- Timestamps
    uc.created_at,
    uc.updated_at

FROM user_cards uc
JOIN card_templates ct ON ct.id = uc.card_template_id
JOIN decks d ON d.id = uc.deck_id
LEFT JOIN subjects s ON s.id = ct.subject_id
WHERE 
    uc.state = 'new'
    AND ct.flagged_for_review = FALSE
    AND d.is_active = TRUE;

-- Enable RLS on view
ALTER VIEW v_new_user_cards SET (security_barrier = true);

-- =====================================================
-- v_due_counts_by_deck VIEW
-- =====================================================
-- Summary counts for dashboard display

CREATE VIEW v_due_counts_by_deck AS
SELECT 
    d.user_id,
    d.id as deck_id,
    d.name as deck_name,
    d.description as deck_description,
    
    -- Count by state
    COUNT(*) FILTER (WHERE uc.state = 'new') as new_count,
    COUNT(*) FILTER (
        WHERE uc.state IN ('learning', 'relearning') 
        AND uc.due_at <= NOW()
    ) as learning_count,
    COUNT(*) FILTER (
        WHERE uc.state = 'review' 
        AND uc.due_at <= NOW()
    ) as review_count,
    COUNT(*) FILTER (
        WHERE uc.state IN ('learning', 'review', 'relearning') 
        AND uc.due_at <= NOW()
    ) as total_due_count,
    COUNT(*) FILTER (WHERE uc.state = 'suspended') as suspended_count,
    COUNT(*) as total_cards,
    
    -- Deck metadata
    d.daily_new_cards_limit,
    d.daily_review_limit,
    d.is_active,
    d.created_at as deck_created_at,
    d.updated_at as deck_updated_at

FROM decks d
LEFT JOIN user_cards uc ON uc.deck_id = d.id AND uc.user_id = d.user_id
LEFT JOIN card_templates ct ON ct.id = uc.card_template_id
WHERE 
    d.is_active = TRUE
    AND (ct.id IS NULL OR ct.flagged_for_review = FALSE)
GROUP BY 
    d.user_id, d.id, d.name, d.description, 
    d.daily_new_cards_limit, d.daily_review_limit, 
    d.is_active, d.created_at, d.updated_at;

-- Enable RLS on view
ALTER VIEW v_due_counts_by_deck SET (security_barrier = true);

-- =====================================================
-- v_user_study_session_info VIEW
-- =====================================================
-- Complete study session info for a user

CREATE VIEW v_user_study_session_info AS
SELECT DISTINCT
    p.id as user_id,
    
    -- User info
    p.display_name,
    p.user_tier,
    p.timezone,
    p.day_start_time,
    
    -- Daily limits (effective)
    p.daily_new_cards_limit as profile_new_cards_limit,
    p.daily_review_limit as profile_review_limit,
    fp.new_cards_per_day as fsrs_new_cards_override,
    fp.reviews_per_day as fsrs_reviews_override,
    
    -- Today's activity
    p.reviews_today,
    p.last_review_date,
    
    -- Streak info
    p.current_daily_streak,
    p.longest_daily_streak,
    p.last_streak_date,
    p.streak_freeze_count,
    
    -- FSRS settings
    fp.weights as fsrs_weights,
    fp.desired_retention,
    fp.learning_steps_minutes,
    fp.graduating_interval_days,
    fp.easy_interval_days,
    fp.maximum_interval_days,
    fp.minimum_interval_days,
    
    -- Overall counts across all decks
    (SELECT COUNT(*) FROM v_new_user_cards vnuc WHERE vnuc.user_id = p.id) as total_new_cards,
    (SELECT COUNT(*) FROM v_due_user_cards vduc WHERE vduc.user_id = p.id) as total_due_cards,
    
    -- Timestamps
    p.created_at as profile_created_at,
    p.updated_at as profile_updated_at

FROM profiles p
LEFT JOIN fsrs_params fp ON fp.user_id = p.id;

-- Enable RLS on view
ALTER VIEW v_user_study_session_info SET (security_barrier = true);

-- =====================================================
-- v_user_review_analytics VIEW
-- =====================================================
-- Analytics data for user progress tracking

CREATE VIEW v_user_review_analytics AS
SELECT 
    p.id as user_id,
    
    -- Last 7 days activity
    (SELECT COUNT(*) FROM reviews r WHERE r.user_id = p.id AND r.reviewed_at >= NOW() - INTERVAL '7 days') as reviews_last_7_days,
    (SELECT COUNT(*) FILTER (WHERE rating >= 2) FROM reviews r WHERE r.user_id = p.id AND r.reviewed_at >= NOW() - INTERVAL '7 days') as correct_reviews_last_7_days,
    
    -- Last 30 days activity
    (SELECT COUNT(*) FROM reviews r WHERE r.user_id = p.id AND r.reviewed_at >= NOW() - INTERVAL '30 days') as reviews_last_30_days,
    (SELECT COUNT(*) FILTER (WHERE rating >= 2) FROM reviews r WHERE r.user_id = p.id AND r.reviewed_at >= NOW() - INTERVAL '30 days') as correct_reviews_last_30_days,
    
    -- All time stats
    (SELECT COUNT(*) FROM reviews r WHERE r.user_id = p.id) as total_reviews,
    (SELECT COUNT(*) FILTER (WHERE rating = 0) FROM reviews r WHERE r.user_id = p.id) as total_again,
    (SELECT COUNT(*) FILTER (WHERE rating = 1) FROM reviews r WHERE r.user_id = p.id) as total_hard,
    (SELECT COUNT(*) FILTER (WHERE rating = 2) FROM reviews r WHERE r.user_id = p.id) as total_good,
    (SELECT COUNT(*) FILTER (WHERE rating = 3) FROM reviews r WHERE r.user_id = p.id) as total_easy,
    
    -- Average response time
    (SELECT ROUND(AVG(response_time_ms)) FROM reviews r WHERE r.user_id = p.id AND r.reviewed_at >= NOW() - INTERVAL '30 days') as avg_response_time_ms_last_30_days,
    
    -- Learning efficiency (% correct in last 30 days)
    ROUND(
        COALESCE(
            (SELECT COUNT(*) FILTER (WHERE rating >= 2) * 100.0 / NULLIF(COUNT(*), 0)
             FROM reviews r WHERE r.user_id = p.id AND r.reviewed_at >= NOW() - INTERVAL '30 days'), 
            0
        ), 2
    ) as accuracy_percent_last_30_days,
    
    -- FSRS optimization info
    fp.optimization_count,
    fp.last_optimization_at,
    
    -- Card counts by state
    (SELECT COUNT(*) FROM user_cards uc WHERE uc.user_id = p.id AND uc.state = 'new') as cards_new,
    (SELECT COUNT(*) FROM user_cards uc WHERE uc.user_id = p.id AND uc.state = 'learning') as cards_learning,
    (SELECT COUNT(*) FROM user_cards uc WHERE uc.user_id = p.id AND uc.state = 'review') as cards_review,
    (SELECT COUNT(*) FROM user_cards uc WHERE uc.user_id = p.id AND uc.state = 'relearning') as cards_relearning,
    (SELECT COUNT(*) FROM user_cards uc WHERE uc.user_id = p.id AND uc.state = 'suspended') as cards_suspended,
    
    -- Profile timestamps
    p.created_at as profile_created_at

FROM profiles p
LEFT JOIN fsrs_params fp ON fp.user_id = p.id;

-- Enable RLS on view
ALTER VIEW v_user_review_analytics SET (security_barrier = true);

-- =====================================================
-- v_admin_user_overview VIEW (Admin Only)
-- =====================================================
-- Admin view for monitoring user activity

CREATE VIEW v_admin_user_overview AS
SELECT 
    p.id as user_id,
    p.display_name,
    p.email,
    p.user_tier,
    p.is_admin,
    p.is_public,
    
    -- Activity metrics
    p.current_daily_streak,
    p.longest_daily_streak,
    p.reviews_today,
    p.last_review_date,
    
    -- Content creation
    (SELECT COUNT(*) FROM card_templates ct WHERE ct.creator_id = p.id) as cards_created,
    (SELECT COUNT(*) FROM subjects s WHERE s.creator_id = p.id) as subjects_created,
    (SELECT COUNT(*) FROM decks d WHERE d.user_id = p.id) as decks_created,
    
    -- Review activity
    (SELECT COUNT(*) FROM reviews r WHERE r.user_id = p.id) as total_reviews,
    (SELECT COUNT(*) FROM reviews r WHERE r.user_id = p.id AND r.reviewed_at >= CURRENT_DATE) as reviews_today_count,
    (SELECT COUNT(*) FROM reviews r WHERE r.user_id = p.id AND r.reviewed_at >= NOW() - INTERVAL '7 days') as reviews_last_7_days,
    
    -- Flags and moderation
    (SELECT COUNT(*) FROM user_card_flags ucf WHERE ucf.user_id = p.id) as flags_submitted,
    (SELECT COUNT(*) FROM user_card_flags ucf WHERE ucf.resolved_by = p.id) as flags_resolved,
    
    -- Account info
    p.created_at as account_created_at,
    p.updated_at as last_updated_at

FROM profiles p;

-- This view will have RLS that only allows admins to access it

-- =====================================================
-- RLS POLICIES FOR VIEWS
-- =====================================================

-- Policy for due cards view
CREATE POLICY "Users can view their own due cards" ON v_due_user_cards
    FOR SELECT USING (auth.uid() = user_id);

-- Policy for new cards view  
CREATE POLICY "Users can view their own new cards" ON v_new_user_cards
    FOR SELECT USING (auth.uid() = user_id);

-- Policy for deck counts view
CREATE POLICY "Users can view their own deck counts" ON v_due_counts_by_deck
    FOR SELECT USING (auth.uid() = user_id);

-- Policy for study session info view
CREATE POLICY "Users can view their own study session info" ON v_user_study_session_info
    FOR SELECT USING (auth.uid() = user_id);

-- Policy for user analytics view
CREATE POLICY "Users can view their own analytics" ON v_user_review_analytics
    FOR SELECT USING (auth.uid() = user_id);

-- Policy for admin overview (admin only)
CREATE POLICY "Admins can view user overview" ON v_admin_user_overview
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND is_admin = TRUE
        )
    );

-- =====================================================
-- VIEW HELPER FUNCTIONS
-- =====================================================

-- Function to refresh materialized views if we convert any to materialized later
CREATE OR REPLACE FUNCTION refresh_analytics_views()
RETURNS VOID AS $$
BEGIN
    -- Placeholder for future materialized view refreshes
    -- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_user_analytics;
    RAISE NOTICE 'View refresh completed';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get study queue for user (combines due + new with limits)
CREATE OR REPLACE FUNCTION get_user_study_queue(
    p_user_id UUID,
    p_deck_id UUID DEFAULT NULL,
    p_max_new INTEGER DEFAULT NULL,
    p_max_due INTEGER DEFAULT NULL
)
RETURNS TABLE(
    queue_type TEXT, -- 'new' or 'due'
    card_template_id UUID,
    deck_id UUID,
    question TEXT,
    answer TEXT,
    tags TEXT[],
    subject_name TEXT,
    deck_name TEXT,
    state card_state,
    stability DECIMAL,
    difficulty DECIMAL,
    due_at TIMESTAMPTZ,
    priority_score NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    -- Due cards first (ordered by how overdue they are)
    SELECT 
        'due'::TEXT,
        vduc.card_template_id,
        vduc.deck_id,
        vduc.question,
        vduc.answer,
        vduc.tags,
        vduc.subject_name,
        vduc.deck_name,
        vduc.state,
        vduc.stability,
        vduc.difficulty,
        vduc.due_at,
        vduc.overdue_seconds as priority_score
    FROM v_due_user_cards vduc
    WHERE vduc.user_id = p_user_id
    AND (p_deck_id IS NULL OR vduc.deck_id = p_deck_id)
    ORDER BY vduc.overdue_seconds DESC, vduc.due_at ASC
    LIMIT COALESCE(p_max_due, 50)
    
    UNION ALL
    
    -- New cards second (ordered by when they were added)
    SELECT 
        'new'::TEXT,
        vnuc.card_template_id,
        vnuc.deck_id,
        vnuc.question,
        vnuc.answer,
        vnuc.tags,
        vnuc.subject_name,
        vnuc.deck_name,
        vnuc.state,
        vnuc.stability,
        vnuc.difficulty,
        NULL::TIMESTAMPTZ,
        EXTRACT(EPOCH FROM (NOW() - vnuc.added_at)) as priority_score
    FROM v_new_user_cards vnuc
    WHERE vnuc.user_id = p_user_id
    AND (p_deck_id IS NULL OR vnuc.deck_id = p_deck_id)
    ORDER BY vnuc.added_at ASC
    LIMIT COALESCE(p_max_new, 20);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Optimized views for efficient client queries are ready
-- Next: Run 11-rls-policies.sql