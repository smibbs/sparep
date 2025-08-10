-- =====================================================
-- Migration 11: Final Optimizations and Sample Data
-- =====================================================
-- Final performance optimizations, additional functions, and sample data
-- Requires: 01-extensions-and-enums.sql through 10-views.sql

-- =====================================================
-- ADDITIONAL PERFORMANCE INDEXES
-- =====================================================

-- Composite indexes for the most common query patterns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_cards_user_deck_state_due 
ON user_cards(user_id, deck_id, state, due_at) 
WHERE state IN ('learning', 'review', 'relearning');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_cards_user_state_created 
ON user_cards(user_id, state, created_at) 
WHERE state = 'new';

-- Reviews analytics indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reviews_user_rating_date 
ON reviews(user_id, rating, reviewed_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reviews_user_date_desc 
ON reviews(user_id, reviewed_at DESC);

-- Card template search optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_card_templates_public_unflagged 
ON card_templates(is_public, flagged_for_review) 
WHERE is_public = TRUE AND flagged_for_review = FALSE;

-- =====================================================
-- ESSENTIAL FSRS FUNCTIONS
-- =====================================================

-- Function to integrate review recording with card updates
CREATE OR REPLACE FUNCTION process_card_review(
    p_user_id UUID,
    p_card_template_id UUID,
    p_deck_id UUID,
    p_rating INTEGER,
    p_response_time_ms INTEGER,
    p_new_stability DECIMAL,
    p_new_difficulty DECIMAL,
    p_new_due_at TIMESTAMPTZ,
    p_new_state card_state
)
RETURNS UUID AS $$
DECLARE
    current_card RECORD;
    review_id UUID;
    elapsed_days DECIMAL;
    scheduled_days DECIMAL;
BEGIN
    -- Get current card state
    SELECT * INTO current_card
    FROM user_cards
    WHERE user_id = p_user_id 
    AND card_template_id = p_card_template_id 
    AND deck_id = p_deck_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Card not found';
    END IF;
    
    -- Calculate elapsed and scheduled days
    IF current_card.last_reviewed_at IS NOT NULL THEN
        elapsed_days := EXTRACT(EPOCH FROM (NOW() - current_card.last_reviewed_at)) / 86400.0;
    ELSE
        elapsed_days := 0;
    END IF;
    
    IF current_card.due_at IS NOT NULL THEN
        scheduled_days := EXTRACT(EPOCH FROM (current_card.due_at - COALESCE(current_card.last_reviewed_at, current_card.created_at))) / 86400.0;
    ELSE
        scheduled_days := 0;
    END IF;
    
    -- Record the review first
    review_id := record_review(
        p_user_id,
        p_card_template_id,
        p_deck_id,
        p_rating,
        p_response_time_ms,
        current_card.state,
        current_card.stability,
        current_card.difficulty,
        current_card.due_at,
        p_new_state,
        p_new_stability,
        p_new_difficulty,
        p_new_due_at,
        elapsed_days,
        scheduled_days,
        current_card.reps,
        current_card.lapses
    );
    
    -- Update the card state
    PERFORM update_card_after_review(
        p_user_id,
        p_card_template_id,
        p_deck_id,
        p_rating,
        p_response_time_ms,
        p_new_state,
        p_new_stability,
        p_new_difficulty,
        p_new_due_at,
        elapsed_days,
        scheduled_days
    );
    
    -- Update user streak
    PERFORM update_user_streak(p_user_id, 1);
    
    -- Update profile reviews_today counter
    UPDATE profiles
    SET 
        reviews_today = reviews_today + 1,
        last_review_date = CURRENT_DATE
    WHERE id = p_user_id;
    
    RETURN review_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reset daily counters (to be called by cron)
CREATE OR REPLACE FUNCTION reset_daily_counters()
RETURNS INTEGER AS $$
DECLARE
    reset_count INTEGER;
BEGIN
    -- Reset reviews_today for users whose day has passed
    UPDATE profiles
    SET reviews_today = 0
    WHERE last_review_date < CURRENT_DATE;
    
    GET DIAGNOSTICS reset_count = ROW_COUNT;
    
    RETURN reset_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- SAMPLE DATA CREATION
-- =====================================================

-- Function to create sample data for development/testing
CREATE OR REPLACE FUNCTION create_sample_data()
RETURNS TEXT AS $$
DECLARE
    sample_user_id UUID;
    default_deck_id UUID;
    math_subject_id UUID;
    science_subject_id UUID;
    card_template_id UUID;
    result_text TEXT := '';
BEGIN
    -- This function should only be used in development
    IF current_setting('app.environment', true) = 'production' THEN
        RETURN 'Sample data creation disabled in production';
    END IF;
    
    result_text := result_text || 'Creating sample data...' || E'\n';
    
    -- Create sample subjects (public)
    INSERT INTO subjects (name, description, is_public, is_active)
    VALUES 
        ('Mathematics', 'Basic mathematics concepts', TRUE, TRUE),
        ('Science', 'General science knowledge', TRUE, TRUE)
    RETURNING id INTO math_subject_id;
    
    INSERT INTO subjects (name, description, is_public, is_active)
    VALUES ('Science', 'General science knowledge', TRUE, TRUE)
    RETURNING id INTO science_subject_id;
    
    result_text := result_text || 'Created sample subjects' || E'\n';
    
    -- Create sample card templates (public)
    INSERT INTO card_templates (question, answer, subject_id, is_public, tags)
    VALUES 
        ('What is 2 + 2?', '4', math_subject_id, TRUE, ARRAY['basic', 'addition']),
        ('What is 5 × 6?', '30', math_subject_id, TRUE, ARRAY['basic', 'multiplication']),
        ('What is the capital of France?', 'Paris', science_subject_id, TRUE, ARRAY['geography', 'capitals']),
        ('What gas do plants absorb from the atmosphere?', 'Carbon dioxide (CO2)', science_subject_id, TRUE, ARRAY['biology', 'plants']),
        ('What is the chemical symbol for water?', 'H2O', science_subject_id, TRUE, ARRAY['chemistry', 'basic']);
    
    result_text := result_text || 'Created sample card templates' || E'\n';
    
    -- Create sample streak reward configs
    INSERT INTO streak_reward_configs (milestone_days, reward_type, reward_title, reward_description, is_active)
    VALUES 
        (3, 'badge', '3-Day Streak!', 'You completed your first 3-day learning streak!', TRUE),
        (7, 'badge', 'Week Warrior', 'Amazing! You studied for a full week straight!', TRUE),
        (30, 'badge', 'Month Master', 'Incredible dedication - 30 days of learning!', TRUE),
        (100, 'badge', 'Century Scholar', 'You are unstoppable! 100 days of consistent learning!', TRUE)
    ON CONFLICT (milestone_days) DO NOTHING;
    
    result_text := result_text || 'Created sample streak rewards' || E'\n';
    
    RETURN result_text || 'Sample data creation completed successfully!';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- ADMIN UTILITY FUNCTIONS
-- =====================================================

-- Function to get database statistics (admin only)
CREATE OR REPLACE FUNCTION get_database_stats(admin_user_id UUID)
RETURNS TABLE(
    table_name TEXT,
    row_count BIGINT,
    table_size TEXT
) AS $$
DECLARE
    is_admin BOOLEAN;
BEGIN
    -- Verify admin permissions
    SELECT profiles.is_admin INTO is_admin
    FROM profiles
    WHERE id = admin_user_id;
    
    IF NOT is_admin THEN
        RAISE EXCEPTION 'Admin access required';
    END IF;
    
    RETURN QUERY
    SELECT 
        schemaname||'.'||tablename as table_name,
        n_tup_ins - n_tup_del as row_count,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as table_size
    FROM pg_stat_user_tables 
    WHERE schemaname = 'public'
    ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get system health metrics (admin only)
CREATE OR REPLACE FUNCTION get_system_health(admin_user_id UUID)
RETURNS TABLE(
    metric_name TEXT,
    metric_value TEXT,
    status TEXT
) AS $$
DECLARE
    is_admin BOOLEAN;
    total_users INTEGER;
    active_users INTEGER;
    total_reviews INTEGER;
    reviews_today INTEGER;
BEGIN
    -- Verify admin permissions
    SELECT profiles.is_admin INTO is_admin
    FROM profiles
    WHERE id = admin_user_id;
    
    IF NOT is_admin THEN
        RAISE EXCEPTION 'Admin access required';
    END IF;
    
    -- Get metrics
    SELECT COUNT(*) INTO total_users FROM profiles;
    SELECT COUNT(*) INTO active_users FROM profiles WHERE last_review_date >= CURRENT_DATE - INTERVAL '7 days';
    SELECT COUNT(*) INTO total_reviews FROM reviews;
    SELECT COUNT(*) INTO reviews_today FROM reviews WHERE reviewed_at >= CURRENT_DATE;
    
    RETURN QUERY VALUES 
        ('Total Users', total_users::TEXT, 'info'),
        ('Active Users (7 days)', active_users::TEXT, CASE WHEN active_users > 0 THEN 'good' ELSE 'warning' END),
        ('Total Reviews', total_reviews::TEXT, 'info'),
        ('Reviews Today', reviews_today::TEXT, 'info'),
        ('Database Status', 'Online', 'good');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- README GENERATION
-- =====================================================

-- Create a README file with migration information
INSERT INTO loading_messages (message, weight, category, show_on_study, show_on_review, show_on_new_cards) VALUES
('🎉 Welcome to the new FSRS database! Everything is fresh and optimized!', 1, 'system', true, true, true)
ON CONFLICT DO NOTHING;

-- =====================================================
-- FINAL VERIFICATION FUNCTIONS
-- =====================================================

-- Function to verify database integrity
CREATE OR REPLACE FUNCTION verify_database_integrity()
RETURNS TABLE(
    check_name TEXT,
    status TEXT,
    details TEXT
) AS $$
BEGIN
    -- Check if all expected tables exist
    RETURN QUERY
    SELECT 
        'Tables Check' as check_name,
        CASE WHEN COUNT(*) = 11 THEN 'PASS' ELSE 'FAIL' END as status,
        'Found ' || COUNT(*) || ' tables (expected 11)' as details
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE';
    
    -- Check if all expected enums exist
    RETURN QUERY
    SELECT 
        'Enums Check' as check_name,
        CASE WHEN COUNT(*) = 3 THEN 'PASS' ELSE 'FAIL' END as status,
        'Found ' || COUNT(*) || ' enums (expected 3)' as details
    FROM pg_type 
    WHERE typtype = 'e' 
    AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
    
    -- Check if RLS is enabled on all tables
    RETURN QUERY
    SELECT 
        'RLS Check' as check_name,
        CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END as status,
        COALESCE(COUNT(*) || ' tables missing RLS', 'All tables have RLS enabled') as details
    FROM information_schema.tables t
    LEFT JOIN pg_class c ON c.relname = t.table_name
    WHERE t.table_schema = 'public' 
    AND t.table_type = 'BASE TABLE'
    AND NOT c.relrowsecurity;
    
    -- Check if views exist
    RETURN QUERY
    SELECT 
        'Views Check' as check_name,
        CASE WHEN COUNT(*) >= 4 THEN 'PASS' ELSE 'FAIL' END as status,
        'Found ' || COUNT(*) || ' views' as details
    FROM information_schema.views 
    WHERE table_schema = 'public';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- MIGRATION COMPLETE MESSAGE
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE 'Database migration completed successfully!';
    RAISE NOTICE 'New Features:';
    RAISE NOTICE '- Modern FSRS implementation with JSONB parameters';
    RAISE NOTICE '- Deck-based organization with per-deck settings';
    RAISE NOTICE '- Timezone-aware scheduling';
    RAISE NOTICE '- 0-3 rating scale (standard FSRS)';
    RAISE NOTICE '- Optimized views for client queries';
    RAISE NOTICE '- Enhanced security with comprehensive RLS';
    RAISE NOTICE '- Immutable review history for analytics';
    RAISE NOTICE '- User flagging and streak systems';
    RAISE NOTICE '';
    RAISE NOTICE 'Next Steps:';
    RAISE NOTICE '1. Update client code to use new schema';
    RAISE NOTICE '2. Test FSRS calculations with JSONB parameters';  
    RAISE NOTICE '3. Verify all functionality works end-to-end';
END $$;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Complete FSRS database rewrite is finished!
-- Database is ready for modern FSRS implementation