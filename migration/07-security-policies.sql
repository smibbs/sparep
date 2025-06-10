-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Cards are viewable by all authenticated users" ON cards;
DROP POLICY IF EXISTS "Users can view their own progress" ON user_card_progress;
DROP POLICY IF EXISTS "Users can insert their own progress" ON user_card_progress;
DROP POLICY IF EXISTS "Users can update their own progress" ON user_card_progress;
DROP POLICY IF EXISTS "Users can view their own reviews" ON review_history;
DROP POLICY IF EXISTS "Users can insert their own reviews" ON review_history;

-- Enable RLS on tables
ALTER TABLE user_card_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;

-- Allow users to read all cards (shared content)
CREATE POLICY "Cards are viewable by all authenticated users"
ON cards FOR SELECT
TO authenticated
USING (true);

-- Allow users to view their own progress
CREATE POLICY "Users can view their own progress"
ON user_card_progress FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Allow users to insert their own progress
CREATE POLICY "Users can insert their own progress"
ON user_card_progress FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own progress
CREATE POLICY "Users can update their own progress"
ON user_card_progress FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Allow users to view their own review history
CREATE POLICY "Users can view their own reviews"
ON review_history FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Allow users to insert their own reviews
CREATE POLICY "Users can insert their own reviews"
ON review_history FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Grant necessary privileges to authenticated users
GRANT SELECT ON cards TO authenticated;
GRANT SELECT, INSERT, UPDATE ON user_card_progress TO authenticated;
GRANT SELECT, INSERT ON review_history TO authenticated; 