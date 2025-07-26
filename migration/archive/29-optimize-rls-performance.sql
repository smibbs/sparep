-- Migration 29: Optimize RLS Performance
-- Fix auth function re-evaluation and consolidate duplicate policies

-- Step 1: Drop all existing policies to avoid conflicts
-- user_profiles policies
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can view public profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Admins can manage user tiers" ON user_profiles;
DROP POLICY IF EXISTS "Debug allow all" ON user_profiles;
DROP POLICY IF EXISTS "Debug allow all profiles" ON user_profiles;
DROP POLICY IF EXISTS "System can create user profiles" ON user_profiles;
DROP POLICY IF EXISTS "Trigger can create user profiles" ON user_profiles;

-- cards policies
DROP POLICY IF EXISTS "Users can view their own cards" ON cards;
DROP POLICY IF EXISTS "Users can view accessible cards" ON cards;
DROP POLICY IF EXISTS "Users can insert their own cards" ON cards;
DROP POLICY IF EXISTS "Users can create cards in accessible subjects" ON cards;
DROP POLICY IF EXISTS "Users can update their own cards" ON cards;
DROP POLICY IF EXISTS "Users can update own cards" ON cards;
DROP POLICY IF EXISTS "Users can delete their own cards" ON cards;
DROP POLICY IF EXISTS "Users can delete own cards" ON cards;
DROP POLICY IF EXISTS "Admins can manage all cards" ON cards;
DROP POLICY IF EXISTS "Admins can view flagged cards" ON cards;
DROP POLICY IF EXISTS "Admins can flag/unflag cards" ON cards;
DROP POLICY IF EXISTS "Public cards are viewable by everyone" ON cards;
DROP POLICY IF EXISTS "Cards are viewable by all authenticated users" ON cards;

-- subjects policies
DROP POLICY IF EXISTS "Users can view their own subjects" ON subjects;
DROP POLICY IF EXISTS "Users can view accessible subjects" ON subjects;
DROP POLICY IF EXISTS "Users can insert their own subjects" ON subjects;
DROP POLICY IF EXISTS "Users can create subjects" ON subjects;
DROP POLICY IF EXISTS "Users can update their own subjects" ON subjects;
DROP POLICY IF EXISTS "Users can update own subjects" ON subjects;
DROP POLICY IF EXISTS "Users can delete their own subjects" ON subjects;
DROP POLICY IF EXISTS "Users can delete own subjects" ON subjects;
DROP POLICY IF EXISTS "Admins can manage all subjects" ON subjects;
DROP POLICY IF EXISTS "Public subjects are viewable by everyone" ON subjects;

-- user_card_progress policies
DROP POLICY IF EXISTS "Users can view their own progress" ON user_card_progress;
DROP POLICY IF EXISTS "Users can insert their own progress" ON user_card_progress;
DROP POLICY IF EXISTS "Users can update their own progress" ON user_card_progress;
DROP POLICY IF EXISTS "Users can delete their own progress" ON user_card_progress;
DROP POLICY IF EXISTS "Admins can view all progress" ON user_card_progress;

-- review_history policies
DROP POLICY IF EXISTS "Users can view their own review history" ON review_history;
DROP POLICY IF EXISTS "Users can view their own reviews" ON review_history;
DROP POLICY IF EXISTS "Users can insert their own review history" ON review_history;
DROP POLICY IF EXISTS "Users can insert their own reviews" ON review_history;
DROP POLICY IF EXISTS "Admins can view all review history" ON review_history;

-- fsrs_parameters policies
DROP POLICY IF EXISTS "Users can view their own FSRS parameters" ON fsrs_parameters;
DROP POLICY IF EXISTS "Users can update their own FSRS parameters" ON fsrs_parameters;
DROP POLICY IF EXISTS "Users can create their own FSRS parameters" ON fsrs_parameters;
DROP POLICY IF EXISTS "Admins can view all FSRS parameters" ON fsrs_parameters;
DROP POLICY IF EXISTS "Admins can update all FSRS parameters" ON fsrs_parameters;
DROP POLICY IF EXISTS "Debug allow all fsrs" ON fsrs_parameters;

-- user_card_flags policies
DROP POLICY IF EXISTS "Users can view own flags" ON user_card_flags;
DROP POLICY IF EXISTS "Users can flag cards" ON user_card_flags;
DROP POLICY IF EXISTS "Admins can view all flags" ON user_card_flags;
DROP POLICY IF EXISTS "Admins can resolve flags" ON user_card_flags;

-- user_streak_milestones policies
DROP POLICY IF EXISTS "Users can view their own milestones" ON user_streak_milestones;
DROP POLICY IF EXISTS "Users can update their milestone claims" ON user_streak_milestones;
DROP POLICY IF EXISTS "System can insert milestones" ON user_streak_milestones;

-- user_streak_history policies
DROP POLICY IF EXISTS "Users can view their own streak history" ON user_streak_history;
DROP POLICY IF EXISTS "System can insert streak history" ON user_streak_history;

-- streak_reward_configs policies
DROP POLICY IF EXISTS "Everyone can view active reward configs" ON streak_reward_configs;
DROP POLICY IF EXISTS "Only admins can manage reward configs" ON streak_reward_configs;

-- Step 2: Create optimized consolidated policies with (select auth.uid())

-- user_profiles - consolidated policies
CREATE POLICY "user_profiles_select" ON user_profiles
    FOR SELECT USING (
        (is_public = true) OR 
        (id = (select auth.uid())) OR 
        ((select get_user_tier((select auth.uid()))) = 'admin')
    );

CREATE POLICY "user_profiles_insert" ON user_profiles
    FOR INSERT WITH CHECK (true); -- Allow system/trigger creates

CREATE POLICY "user_profiles_update" ON user_profiles
    FOR UPDATE USING (
        (id = (select auth.uid())) OR 
        ((select get_user_tier((select auth.uid()))) = 'admin')
    )
    WITH CHECK (
        (id = (select auth.uid())) OR 
        ((select get_user_tier((select auth.uid()))) = 'admin')
    );

CREATE POLICY "user_profiles_delete" ON user_profiles
    FOR DELETE USING ((select get_user_tier((select auth.uid()))) = 'admin');

-- cards - consolidated policies  
CREATE POLICY "cards_select" ON cards
    FOR SELECT USING (
        (is_public = true) OR 
        (creator_id = (select auth.uid())) OR
        ((select is_admin()) = true) OR
        ((select has_card_access(id)) = true AND 
         ((NOT flagged_for_review) OR (select can_access_flagged_cards()) = true))
    );

CREATE POLICY "cards_insert" ON cards
    FOR INSERT WITH CHECK (
        (creator_id = (select auth.uid())) AND 
        ((select has_subject_access(subject_id)) = true OR (select is_admin()) = true)
    );

CREATE POLICY "cards_update" ON cards
    FOR UPDATE USING (
        (creator_id = (select auth.uid())) OR (select is_admin()) = true
    )
    WITH CHECK (
        (creator_id = (select auth.uid())) OR (select is_admin()) = true
    );

CREATE POLICY "cards_delete" ON cards
    FOR DELETE USING (
        (creator_id = (select auth.uid())) OR (select is_admin()) = true
    );

-- subjects - consolidated policies
CREATE POLICY "subjects_select" ON subjects
    FOR SELECT USING (
        (is_public = true) OR 
        (creator_id = (select auth.uid())) OR 
        (select is_admin()) = true
    );

CREATE POLICY "subjects_insert" ON subjects
    FOR INSERT WITH CHECK (
        (creator_id = (select auth.uid())) OR (select is_admin()) = true
    );

CREATE POLICY "subjects_update" ON subjects
    FOR UPDATE USING (
        (creator_id = (select auth.uid())) OR (select is_admin()) = true
    )
    WITH CHECK (
        (creator_id = (select auth.uid())) OR (select is_admin()) = true
    );

CREATE POLICY "subjects_delete" ON subjects
    FOR DELETE USING (
        (creator_id = (select auth.uid())) OR (select is_admin()) = true
    );

-- user_card_progress - consolidated policies
CREATE POLICY "user_card_progress_select" ON user_card_progress
    FOR SELECT USING (
        (user_id = (select auth.uid())) OR (select is_admin()) = true
    );

CREATE POLICY "user_card_progress_insert" ON user_card_progress
    FOR INSERT WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "user_card_progress_update" ON user_card_progress
    FOR UPDATE USING (user_id = (select auth.uid()))
    WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "user_card_progress_delete" ON user_card_progress
    FOR DELETE USING (user_id = (select auth.uid()));

-- review_history - consolidated policies
CREATE POLICY "review_history_select" ON review_history
    FOR SELECT USING (
        (user_id = (select auth.uid())) OR (select is_admin()) = true
    );

CREATE POLICY "review_history_insert" ON review_history
    FOR INSERT WITH CHECK (user_id = (select auth.uid()));

-- fsrs_parameters - consolidated policies (keeping debug policy as it exists)
CREATE POLICY "fsrs_parameters_select" ON fsrs_parameters
    FOR SELECT USING (
        (user_id = (select auth.uid())) OR (select is_admin()) = true
    );

CREATE POLICY "fsrs_parameters_insert" ON fsrs_parameters
    FOR INSERT WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "fsrs_parameters_update" ON fsrs_parameters
    FOR UPDATE USING (
        (user_id = (select auth.uid())) OR (select is_admin()) = true
    )
    WITH CHECK (
        (user_id = (select auth.uid())) OR (select is_admin()) = true
    );

-- Re-create the debug policy if it exists
CREATE POLICY "Debug allow all fsrs" ON fsrs_parameters
    FOR ALL USING (true) WITH CHECK (true);

-- user_card_flags - consolidated policies
CREATE POLICY "user_card_flags_select" ON user_card_flags
    FOR SELECT USING (
        (user_id = (select auth.uid())) OR 
        ((select get_user_tier((select auth.uid()))) = 'admin')
    );

CREATE POLICY "user_card_flags_insert" ON user_card_flags
    FOR INSERT WITH CHECK (
        (user_id = (select auth.uid())) AND 
        ((select get_user_tier((select auth.uid()))) = ANY(ARRAY['free', 'paid', 'admin']))
    );

CREATE POLICY "user_card_flags_update" ON user_card_flags
    FOR UPDATE USING ((select get_user_tier((select auth.uid()))) = 'admin')
    WITH CHECK ((select get_user_tier((select auth.uid()))) = 'admin');

-- user_streak_milestones - optimized policies
CREATE POLICY "user_streak_milestones_select" ON user_streak_milestones
    FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "user_streak_milestones_insert" ON user_streak_milestones
    FOR INSERT WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "user_streak_milestones_update" ON user_streak_milestones
    FOR UPDATE USING (user_id = (select auth.uid()))
    WITH CHECK (user_id = (select auth.uid()));

-- user_streak_history - optimized policies
CREATE POLICY "user_streak_history_select" ON user_streak_history
    FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "user_streak_history_insert" ON user_streak_history
    FOR INSERT WITH CHECK (user_id = (select auth.uid()));

-- streak_reward_configs - consolidated policies
CREATE POLICY "streak_reward_configs_select" ON streak_reward_configs
    FOR SELECT USING (
        (is_active = true) OR (select is_admin()) = true
    );

CREATE POLICY "streak_reward_configs_modify" ON streak_reward_configs
    FOR ALL USING ((select is_admin()) = true)
    WITH CHECK ((select is_admin()) = true);