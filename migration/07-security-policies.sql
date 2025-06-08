-- Migration: 07-security-policies.sql
-- Description: Sets up comprehensive Row Level Security (RLS) policies for all tables
-- Dependencies: All previous migrations (01-06)

-- Helper function to check if user is an admin
CREATE OR REPLACE FUNCTION is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE id = user_id AND is_admin = true
    );
END;
$$ language 'plpgsql' SECURITY DEFINER;

-- Helper function to check if user has access to a subject
CREATE OR REPLACE FUNCTION has_subject_access(user_id UUID, subject_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.subjects s
        WHERE s.id = subject_id AND (
            s.is_public = true OR
            s.creator_id = user_id OR
            is_admin(user_id)
        )
    );
END;
$$ language 'plpgsql' SECURITY DEFINER;

-- Helper function to check if user has access to a card
CREATE OR REPLACE FUNCTION has_card_access(user_id UUID, card_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.cards c
        WHERE c.id = card_id AND (
            c.is_public = true OR
            c.creator_id = user_id OR
            has_subject_access(user_id, c.subject_id) OR
            is_admin(user_id)
        )
    );
END;
$$ language 'plpgsql' SECURITY DEFINER;

-- User Profiles Table Policies
DROP POLICY IF EXISTS "Users can view public profiles" ON public.user_profiles;
CREATE POLICY "Users can view public profiles"
    ON public.user_profiles
    FOR SELECT
    USING (
        is_public = true OR
        id = auth.uid() OR
        is_admin(auth.uid())
    );

DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
CREATE POLICY "Users can update own profile"
    ON public.user_profiles
    FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- Subjects Table Policies
DROP POLICY IF EXISTS "Users can view accessible subjects" ON public.subjects;
CREATE POLICY "Users can view accessible subjects"
    ON public.subjects
    FOR SELECT
    USING (
        is_public = true OR
        creator_id = auth.uid() OR
        is_admin(auth.uid())
    );

DROP POLICY IF EXISTS "Users can create subjects" ON public.subjects;
CREATE POLICY "Users can create subjects"
    ON public.subjects
    FOR INSERT
    WITH CHECK (creator_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own subjects" ON public.subjects;
CREATE POLICY "Users can update own subjects"
    ON public.subjects
    FOR UPDATE
    USING (creator_id = auth.uid())
    WITH CHECK (creator_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own subjects" ON public.subjects;
CREATE POLICY "Users can delete own subjects"
    ON public.subjects
    FOR DELETE
    USING (creator_id = auth.uid());

DROP POLICY IF EXISTS "Admins can manage all subjects" ON public.subjects;
CREATE POLICY "Admins can manage all subjects"
    ON public.subjects
    FOR ALL
    USING (is_admin(auth.uid()))
    WITH CHECK (is_admin(auth.uid()));

-- Cards Table Policies
DROP POLICY IF EXISTS "Users can view accessible cards" ON public.cards;
CREATE POLICY "Users can view accessible cards"
    ON public.cards
    FOR SELECT
    USING (
        is_public = true OR
        creator_id = auth.uid() OR
        has_subject_access(auth.uid(), subject_id) OR
        is_admin(auth.uid())
    );

DROP POLICY IF EXISTS "Users can create cards in accessible subjects" ON public.cards;
CREATE POLICY "Users can create cards in accessible subjects"
    ON public.cards
    FOR INSERT
    WITH CHECK (
        creator_id = auth.uid() AND
        has_subject_access(auth.uid(), subject_id)
    );

DROP POLICY IF EXISTS "Users can update own cards" ON public.cards;
CREATE POLICY "Users can update own cards"
    ON public.cards
    FOR UPDATE
    USING (creator_id = auth.uid())
    WITH CHECK (creator_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own cards" ON public.cards;
CREATE POLICY "Users can delete own cards"
    ON public.cards
    FOR DELETE
    USING (creator_id = auth.uid());

DROP POLICY IF EXISTS "Admins can manage all cards" ON public.cards;
CREATE POLICY "Admins can manage all cards"
    ON public.cards
    FOR ALL
    USING (is_admin(auth.uid()))
    WITH CHECK (is_admin(auth.uid()));

-- User Card Progress Table Policies
-- Note: Most policies already created in previous migration, adding admin access
DROP POLICY IF EXISTS "Admins can view all progress" ON public.user_card_progress;
CREATE POLICY "Admins can view all progress"
    ON public.user_card_progress
    FOR SELECT
    USING (is_admin(auth.uid()));

-- Review History Table Policies
-- Note: Most policies already created in previous migration, adding admin access
DROP POLICY IF EXISTS "Admins can view all review history" ON public.review_history;
CREATE POLICY "Admins can view all review history"
    ON public.review_history
    FOR SELECT
    USING (is_admin(auth.uid()));

-- FSRS Parameters Table Policies
-- Note: Most policies already created in previous migration, adding admin access
DROP POLICY IF EXISTS "Admins can view all FSRS parameters" ON public.fsrs_parameters;
CREATE POLICY "Admins can view all FSRS parameters"
    ON public.fsrs_parameters
    FOR SELECT
    USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update all FSRS parameters" ON public.fsrs_parameters;
CREATE POLICY "Admins can update all FSRS parameters"
    ON public.fsrs_parameters
    FOR UPDATE
    USING (is_admin(auth.uid()));

-- Comments
COMMENT ON FUNCTION is_admin IS 'Helper function to check if a user has admin privileges';
COMMENT ON FUNCTION has_subject_access IS 'Helper function to check if a user has access to a subject';
COMMENT ON FUNCTION has_card_access IS 'Helper function to check if a user has access to a card'; 