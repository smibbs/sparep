-- Function to get cards that a user hasn't seen yet
CREATE OR REPLACE FUNCTION get_unseen_cards(user_id_param UUID, limit_param INTEGER)
RETURNS TABLE (
    id UUID,
    question TEXT,
    answer TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT c.id, c.question, c.answer
    FROM cards c
    WHERE NOT EXISTS (
        SELECT 1
        FROM user_card_progress p
        WHERE p.card_id = c.id
        AND p.user_id = user_id_param
    )
    LIMIT limit_param;
END;
$$ LANGUAGE plpgsql; 