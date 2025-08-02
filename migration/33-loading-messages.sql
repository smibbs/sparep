-- Migration 33: Loading Messages Table
-- Creates a table for dynamic loading messages with weighted selection

-- Create loading_messages table
CREATE TABLE IF NOT EXISTS loading_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    message TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    weight INTEGER DEFAULT 1 CHECK (weight > 0), -- Higher weight = more likely to be selected
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_loading_messages_active ON loading_messages (is_active);
CREATE INDEX IF NOT EXISTS idx_loading_messages_weight ON loading_messages (weight DESC);

-- Enable RLS (read-only for all users)
ALTER TABLE loading_messages ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read active messages
CREATE POLICY "Allow all users to read active loading messages"
ON loading_messages FOR SELECT
TO authenticated
USING (is_active = true);

-- Admin users can manage loading messages
CREATE POLICY "Allow admins to manage loading messages"
ON loading_messages FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE user_profiles.id = auth.uid() 
        AND user_profiles.user_tier = 'admin'
    )
);

-- Function to get a weighted random loading message
CREATE OR REPLACE FUNCTION get_random_loading_message()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    selected_message TEXT;
    total_weight INTEGER;
    random_threshold INTEGER;
    cumulative_weight INTEGER := 0;
    message_record RECORD;
BEGIN
    -- Get total weight of all active messages
    SELECT COALESCE(SUM(weight), 0) INTO total_weight
    FROM loading_messages
    WHERE is_active = true;
    
    -- If no active messages, return default
    IF total_weight = 0 THEN
        RETURN 'Generating your flashcards...';
    END IF;
    
    -- Generate random number between 1 and total_weight
    random_threshold := floor(random() * total_weight) + 1;
    
    -- Find the message that corresponds to this random number
    FOR message_record IN
        SELECT message, weight
        FROM loading_messages
        WHERE is_active = true
        ORDER BY id -- Consistent ordering for reproducible results
    LOOP
        cumulative_weight := cumulative_weight + message_record.weight;
        IF cumulative_weight >= random_threshold THEN
            RETURN message_record.message;
        END IF;
    END LOOP;
    
    -- Fallback (should never reach here)
    RETURN 'Generating your flashcards...';
END;
$$;

-- Insert initial loading messages with varied weights
INSERT INTO loading_messages (message, weight) VALUES
('Generating your flashcards...', 5),
('Preparing your study session...', 4),
('Shuffling the deck...', 3),
('Loading your learning materials...', 3),
('Getting your cards ready...', 3),
('Organizing your study materials...', 2),
('Preparing for optimal learning...', 2),
('Setting up your review session...', 2),
('Curating your study experience...', 2),
('Loading knowledge nuggets...', 1),
('Brewing some brain fuel...', 1),
('Activating learning mode...', 1),
('Calibrating your memory...', 1),
('Assembling your study toolkit...', 1),
('Preparing mental gymnastics...', 1)
ON CONFLICT (id) DO NOTHING; -- Prevent duplicates if migration runs multiple times

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_loading_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER loading_messages_updated_at
    BEFORE UPDATE ON loading_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_loading_messages_updated_at();

-- Grant necessary permissions
GRANT SELECT ON loading_messages TO authenticated;
GRANT EXECUTE ON FUNCTION get_random_loading_message() TO authenticated;