-- =====================================================
-- Migration 09: Loading Messages
-- =====================================================
-- Dynamic loading messages system for better UX
-- Requires: 01-extensions-and-enums.sql through 08-user-flags-and-streaks.sql

-- =====================================================
-- LOADING MESSAGES TABLE
-- =====================================================

CREATE TABLE loading_messages (
    -- Core identity
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Message content
    message TEXT NOT NULL,
    
    -- Display configuration
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    weight INTEGER NOT NULL DEFAULT 1, -- Higher weight = more frequent display
    
    -- Categorization (optional)
    category TEXT, -- e.g., 'motivational', 'educational', 'fun'
    
    -- Display context (optional filtering)
    show_on_study BOOLEAN DEFAULT TRUE, -- Show during study sessions
    show_on_review BOOLEAN DEFAULT TRUE, -- Show during review sessions
    show_on_new_cards BOOLEAN DEFAULT TRUE, -- Show when learning new cards
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT loading_messages_message_not_empty CHECK (length(trim(message)) > 0),
    CONSTRAINT loading_messages_weight_check CHECK (weight > 0),
    CONSTRAINT loading_messages_category_not_empty CHECK (category IS NULL OR length(trim(category)) > 0)
);

-- Enable Row Level Security
ALTER TABLE loading_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for loading_messages (read-only for users, admin-managed)
CREATE POLICY "Anyone can view active loading messages" ON loading_messages
    FOR SELECT USING (is_active = TRUE);

CREATE POLICY "Admins can manage all loading messages" ON loading_messages
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND is_admin = TRUE
        )
    );

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Updated at trigger
CREATE TRIGGER loading_messages_updated_at
    BEFORE UPDATE ON loading_messages
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX idx_loading_messages_is_active ON loading_messages(is_active);
CREATE INDEX idx_loading_messages_weight ON loading_messages(weight);
CREATE INDEX idx_loading_messages_category ON loading_messages(category);
CREATE INDEX idx_loading_messages_show_context ON loading_messages(show_on_study, show_on_review, show_on_new_cards);

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to get a random loading message
CREATE OR REPLACE FUNCTION get_random_loading_message(
    p_context TEXT DEFAULT 'general' -- 'study', 'review', 'new_cards', 'general'
)
RETURNS TABLE(
    id UUID,
    message TEXT,
    category TEXT
) AS $$
DECLARE
    total_weight INTEGER;
    random_weight INTEGER;
    running_weight INTEGER := 0;
    selected_message RECORD;
BEGIN
    -- Calculate total weight for active messages matching context
    SELECT COALESCE(SUM(weight), 0) INTO total_weight
    FROM loading_messages
    WHERE is_active = TRUE
    AND (
        p_context = 'general' OR
        (p_context = 'study' AND show_on_study = TRUE) OR
        (p_context = 'review' AND show_on_review = TRUE) OR
        (p_context = 'new_cards' AND show_on_new_cards = TRUE)
    );
    
    -- If no messages available, return null
    IF total_weight = 0 THEN
        RETURN;
    END IF;
    
    -- Generate random number between 1 and total_weight
    random_weight := floor(random() * total_weight) + 1;
    
    -- Find the message at the random weight position
    FOR selected_message IN
        SELECT lm.id, lm.message, lm.category, lm.weight
        FROM loading_messages lm
        WHERE lm.is_active = TRUE
        AND (
            p_context = 'general' OR
            (p_context = 'study' AND lm.show_on_study = TRUE) OR
            (p_context = 'review' AND lm.show_on_review = TRUE) OR
            (p_context = 'new_cards' AND lm.show_on_new_cards = TRUE)
        )
        ORDER BY lm.created_at
    LOOP
        running_weight := running_weight + selected_message.weight;
        
        IF running_weight >= random_weight THEN
            id := selected_message.id;
            message := selected_message.message;
            category := selected_message.category;
            RETURN NEXT;
            RETURN;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get multiple random loading messages (for variety)
CREATE OR REPLACE FUNCTION get_random_loading_messages(
    p_count INTEGER DEFAULT 5,
    p_context TEXT DEFAULT 'general'
)
RETURNS TABLE(
    id UUID,
    message TEXT,
    category TEXT
) AS $$
DECLARE
    i INTEGER := 0;
    selected_message RECORD;
    used_ids UUID[] := '{}';
BEGIN
    WHILE i < p_count LOOP
        -- Get a random message not yet selected
        SELECT rm.id, rm.message, rm.category
        INTO selected_message
        FROM get_random_loading_message(p_context) rm
        WHERE rm.id IS NOT NULL
        AND NOT (rm.id = ANY(used_ids))
        LIMIT 1;
        
        -- If we found a message, return it and track it
        IF selected_message.id IS NOT NULL THEN
            id := selected_message.id;
            message := selected_message.message;
            category := selected_message.category;
            used_ids := array_append(used_ids, selected_message.id);
            RETURN NEXT;
            i := i + 1;
        ELSE
            -- No more unique messages available
            EXIT;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to add a loading message (admin only)
CREATE OR REPLACE FUNCTION add_loading_message(
    p_admin_id UUID,
    p_message TEXT,
    p_weight INTEGER DEFAULT 1,
    p_category TEXT DEFAULT NULL,
    p_show_on_study BOOLEAN DEFAULT TRUE,
    p_show_on_review BOOLEAN DEFAULT TRUE,
    p_show_on_new_cards BOOLEAN DEFAULT TRUE
)
RETURNS UUID AS $$
DECLARE
    is_admin BOOLEAN;
    new_message_id UUID;
BEGIN
    -- Verify admin permissions
    SELECT profiles.is_admin INTO is_admin
    FROM profiles
    WHERE id = p_admin_id;
    
    IF NOT is_admin THEN
        RAISE EXCEPTION 'Insufficient permissions';
    END IF;
    
    -- Insert the message
    INSERT INTO loading_messages (
        message,
        weight,
        category,
        show_on_study,
        show_on_review,
        show_on_new_cards
    ) VALUES (
        p_message,
        p_weight,
        p_category,
        p_show_on_study,
        p_show_on_review,
        p_show_on_new_cards
    )
    RETURNING id INTO new_message_id;
    
    RETURN new_message_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- SAMPLE DATA
-- =====================================================

-- Insert some sample loading messages
INSERT INTO loading_messages (message, weight, category, show_on_study, show_on_review, show_on_new_cards) VALUES
-- Motivational messages
('Keep going! Every card reviewed makes you stronger! 💪', 3, 'motivational', true, true, true),
('You''re building knowledge one card at a time! 🧠', 3, 'motivational', true, true, true),
('Consistency beats intensity - great job studying! 🎯', 3, 'motivational', true, true, true),
('Your brain is making new connections right now! ⚡', 2, 'motivational', true, true, true),
('Progress, not perfection! Keep it up! 🌟', 3, 'motivational', true, true, true),

-- Educational/FSRS messages  
('The FSRS algorithm is optimizing your learning schedule! 🤖', 2, 'educational', true, true, true),
('Each review helps the algorithm learn your memory patterns! 📊', 2, 'educational', true, true, false),
('Spaced repetition: the science of remembering forever! 🔬', 2, 'educational', true, true, true),
('Your difficulty ratings help personalize your learning! ⚙️', 1, 'educational', false, true, false),

-- Context-specific messages
('New cards ahead! Time to expand your knowledge! 📚', 3, 'learning', true, false, true),
('Review time! Let''s see what you remember! 🔄', 3, 'review', false, true, false),
('Getting ready to challenge your memory! 🎮', 2, 'review', false, true, false),
('Fresh knowledge coming your way! 🌱', 2, 'learning', true, false, true),

-- Fun/encouraging messages
('Your future self will thank you for studying today! ⏰', 2, 'fun', true, true, true),
('Building your mental library, one card at a time! 📖', 2, 'fun', true, true, true),
('Loading awesome facts for your brain! 🚀', 3, 'fun', true, true, true),
('Preparing your daily dose of knowledge! 💊', 2, 'fun', true, true, true),
('Your learning streak is impressive! 🔥', 1, 'fun', true, true, true);

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Loading messages system with dynamic selection is ready
-- Next: Run 10-views.sql