-- Migration: 12-sample-data.sql
-- Description: Optional sample data for development and testing
-- Dependencies: All previous migrations

-- Note: This migration is optional and primarily for development environments
-- Sample subjects
INSERT INTO public.subjects (
    id,
    name,
    description,
    icon_name,
    color_hex,
    is_public,
    display_order,
    creator_id
) VALUES 
(
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'General Knowledge',
    'General knowledge and trivia questions',
    'brain',
    '#4F46E5',
    true,
    1,
    NULL
),
(
    'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    'Science',
    'Basic science concepts and facts',
    'flask',
    '#059669',
    true,
    2,
    NULL
),
(
    'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
    'History',
    'Historical events and figures',
    'scroll',
    '#DC2626',
    true,
    3,
    NULL
)
ON CONFLICT (id) DO NOTHING;

-- Sample cards (only if subjects exist)
INSERT INTO public.cards (
    id,
    question,
    answer,
    subject_id,
    is_public,
    creator_id
) VALUES 
(
    'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'What is the capital of France?',
    'Paris',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    true,
    NULL
),
(
    'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    'What is the chemical symbol for water?',
    'H2O',
    'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    true,
    NULL
),
(
    'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
    'In which year did World War II end?',
    '1945',
    'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
    true,
    NULL
),
(
    'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
    'What is the largest planet in our solar system?',
    'Jupiter',
    'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    true,
    NULL
),
(
    'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
    'Who painted the Mona Lisa?',
    'Leonardo da Vinci',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    true,
    NULL
)
ON CONFLICT (id) DO NOTHING;

-- Comments
COMMENT ON MIGRATION '12-sample-data.sql' IS 'Optional sample data for development and testing environments';